package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setupRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		if _, err := gitEnv(dir, []string{
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@example.com",
		}, args...); err != nil {
			t.Fatalf("git %v: %v", args, err)
		}
	}
	run("init", "-b", "main")
	run("config", "user.name", "Test")
	run("config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "a.txt")
	run("commit", "-m", "first")
	return dir
}

func withCwd(t *testing.T, dir string) {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })
}

func apiServer() *httptest.Server {
	mux := http.NewServeMux()
	registerAPI(mux)
	return httptest.NewServer(mux)
}

func TestBranchesCheckoutCreateDelete(t *testing.T) {
	dir := setupRepo(t)
	withCwd(t, dir)
	srv := apiServer()
	defer srv.Close()

	res, err := http.Get(srv.URL + "/api/branches")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var payload struct {
		Branches []Branch `json:"branches"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Branches) != 1 || payload.Branches[0].Name != "main" || !payload.Branches[0].Current {
		t.Fatalf("unexpected branches: %+v", payload.Branches)
	}

	post := func(body string) {
		t.Helper()
		r, err := http.Post(srv.URL+"/api/branches", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		if r.StatusCode != 200 {
			var e map[string]string
			_ = json.NewDecoder(r.Body).Decode(&e)
			t.Fatalf("status %d: %v", r.StatusCode, e)
		}
	}
	post(`{"action":"create","name":"feature"}`)
	post(`{"action":"checkout","name":"main"}`)
	post(`{"action":"delete","name":"feature"}`)
}

func TestChangesStageCommit(t *testing.T) {
	dir := setupRepo(t)
	withCwd(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello\nworld\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	srv := apiServer()
	defer srv.Close()

	res, err := http.Get(srv.URL + "/api/changes")
	if err != nil {
		t.Fatal(err)
	}
	var ch ChangesPayload
	if err := json.NewDecoder(res.Body).Decode(&ch); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if len(ch.Status.Unstaged) != 1 {
		t.Fatalf("expected unstaged file, got %+v", ch.Status)
	}

	r, err := http.Post(srv.URL+"/api/changes", "application/json", strings.NewReader(`{"action":"stage","paths":["a.txt"]}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("stage: %d", r.StatusCode)
	}
	r, err = http.Post(srv.URL+"/api/changes", "application/json", strings.NewReader(`{"action":"commit","message":"second"}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("commit: %d", r.StatusCode)
	}

	res, err = http.Get(srv.URL + "/api/commits")
	if err != nil {
		t.Fatal(err)
	}
	var list CommitList
	if err := json.NewDecoder(res.Body).Decode(&list); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if len(list.Commits) < 2 {
		t.Fatalf("expected 2 commits, got %d", len(list.Commits))
	}

	hash := list.Commits[0].Hash
	r, err = http.Post(srv.URL+"/api/commits", "application/json", strings.NewReader(
		`{"action":"update-author","hash":"`+hash+`","author":"Ada","email":"ada@example.com"}`))
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 200 {
		var e map[string]string
		_ = json.NewDecoder(r.Body).Decode(&e)
		r.Body.Close()
		t.Fatalf("update-author: %d %v", r.StatusCode, e)
	}
	r.Body.Close()

	res, err = http.Get(srv.URL + "/api/commits")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewDecoder(res.Body).Decode(&list); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if list.Commits[0].Author != "Ada" {
		t.Fatalf("author %q", list.Commits[0].Author)
	}

	show, err := http.Get(srv.URL + "/api/commits/show?hash=" + list.Commits[0].Short)
	if err != nil {
		t.Fatal(err)
	}
	defer show.Body.Close()
	var d CommitDetail
	if err := json.NewDecoder(show.Body).Decode(&d); err != nil {
		t.Fatal(err)
	}
	if d.Subject != "second" {
		t.Fatalf("subject %q", d.Subject)
	}
}

func TestTagsStashesReflog(t *testing.T) {
	dir := setupRepo(t)
	withCwd(t, dir)
	srv := apiServer()
	defer srv.Close()

	r, err := http.Post(srv.URL+"/api/tags", "application/json", strings.NewReader(`{"action":"create","name":"v1.0.0","annotated":true,"message":"release"}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("tag create %d", r.StatusCode)
	}
	res, err := http.Get(srv.URL + "/api/tags")
	if err != nil {
		t.Fatal(err)
	}
	var tp struct {
		Tags []Tag `json:"tags"`
	}
	if err := json.NewDecoder(res.Body).Decode(&tp); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if len(tp.Tags) != 1 || tp.Tags[0].Name != "v1.0.0" || !tp.Tags[0].Annotated {
		t.Fatalf("tags %+v", tp.Tags)
	}

	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("stashme\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r, err = http.Post(srv.URL+"/api/stashes", "application/json", strings.NewReader(`{"action":"create","message":"wip"}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("stash create %d", r.StatusCode)
	}
	res, err = http.Get(srv.URL + "/api/stashes")
	if err != nil {
		t.Fatal(err)
	}
	var sp struct {
		Stashes []Stash `json:"stashes"`
	}
	_ = json.NewDecoder(res.Body).Decode(&sp)
	res.Body.Close()
	if len(sp.Stashes) != 1 {
		t.Fatalf("stashes %+v", sp.Stashes)
	}

	res, err = http.Get(srv.URL + "/api/reflog")
	if err != nil {
		t.Fatal(err)
	}
	var rp struct {
		Entries []ReflogEntry `json:"entries"`
	}
	_ = json.NewDecoder(res.Body).Decode(&rp)
	res.Body.Close()
	if len(rp.Entries) == 0 {
		t.Fatal("expected reflog entries")
	}

	res, err = http.Get(srv.URL + "/api/submodules")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("submodules %d", res.StatusCode)
	}

	r, err = http.Post(srv.URL+"/api/remotes", "application/json", strings.NewReader(`{"action":"add","name":"origin","url":"/tmp/fake.git"}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("remote add %d", r.StatusCode)
	}
}

func TestOverviewStillWorks(t *testing.T) {
	dir := setupRepo(t)
	withCwd(t, dir)
	srv := apiServer()
	defer srv.Close()
	res, err := http.Get(srv.URL + "/api/overview")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("overview %d", res.StatusCode)
	}
}
