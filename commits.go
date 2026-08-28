package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type CommitList struct {
	Commits []CommitDetail `json:"commits"`
	Head    string         `json:"head"`
}

type CommitDetail struct {
	Commit
	Parents []string `json:"parents"`
	Files   []string `json:"files,omitempty"`
	Diff    string   `json:"diff,omitempty"`
	IsHead  bool     `json:"isHead"`
}

type CommitAction struct {
	Action    string `json:"action"`
	Hash      string `json:"hash"`
	Name      string `json:"name,omitempty"`
	Mode      string `json:"mode,omitempty"`
	Author    string `json:"author,omitempty"`
	Email     string `json:"email,omitempty"`
	Date      string `json:"date,omitempty"`
	Message   string `json:"message,omitempty"`
	Annotated bool   `json:"annotated,omitempty"`
}

func handleCommits(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		q := r.URL.Query()
		max := 200
		if n, err := strconv.Atoi(q.Get("max")); err == nil && n > 0 && n <= 1000 {
			max = n
		}
		list, err := listCommits(root, q.Get("branch"), q.Get("author"), q.Get("path"), max)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, list)
	case http.MethodPost:
		var body CommitAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyCommitAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func handleCommitShow(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeAllow(w, http.MethodGet)
		return
	}
	hash := r.URL.Query().Get("hash")
	if err := validHash(hash); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	d, err := showCommit(root, hash)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func listCommits(root, branch, author, path string, max int) (*CommitList, error) {
	head, _ := git(root, "rev-parse", "HEAD")
	format := strings.Join([]string{"%H", "%h", "%s", "%b", "%an", "%ae", "%ar", "%cI", "%D", "%P"}, gitFieldSep)
	args := []string{"log", "-n", strconv.Itoa(max), "--pretty=format:" + format + gitRecordSep}
	if branch != "" {
		if err := validRef(branch); err != nil {
			if err2 := validHash(branch); err2 != nil {
				return nil, err
			}
		}
		args = append(args, branch)
	} else {
		args = append(args, "--all")
	}
	if author != "" {
		args = append(args, "--author="+author)
	}
	if path != "" {
		args = append(args, "--", path)
	}
	out, err := git(root, args...)
	if err != nil {
		return nil, err
	}
	list := &CommitList{Head: head, Commits: []CommitDetail{}}
	for _, rec := range strings.Split(out, gitRecordSep) {
		rec = strings.Trim(rec, "\n")
		if rec == "" {
			continue
		}
		f := strings.Split(rec, gitFieldSep)
		if len(f) < 10 {
			continue
		}
		parents := []string{}
		if strings.TrimSpace(f[9]) != "" {
			parents = strings.Fields(f[9])
		}
		c := CommitDetail{
			Commit: Commit{
				Hash: f[0], Short: f[1], Subject: f[2], Body: strings.TrimSpace(f[3]),
				Author: f[4], Email: f[5], RelDate: f[6], Date: f[7],
				Refs: strings.TrimSpace(f[8]), Parents: parents,
			},
			Parents: parents,
			IsHead:  f[0] == head,
		}
		list.Commits = append(list.Commits, c)
	}
	return list, nil
}

func showCommit(root, hash string) (*CommitDetail, error) {
	format := strings.Join([]string{"%H", "%h", "%s", "%b", "%an", "%ae", "%ar", "%cI", "%D", "%P"}, gitFieldSep)
	out, err := git(root, "show", "-s", "--pretty=format:"+format, hash)
	if err != nil {
		return nil, err
	}
	f := strings.Split(out, gitFieldSep)
	if len(f) < 10 {
		return nil, fmt.Errorf("unexpected git show output")
	}
	head, _ := git(root, "rev-parse", "HEAD")
	parents := []string{}
	if strings.TrimSpace(f[9]) != "" {
		parents = strings.Fields(f[9])
	}
	files, _ := gitLines(root, "diff-tree", "--no-commit-id", "--name-only", "-r", hash)
	var diff string
	if len(parents) == 0 {
		diff, _ = git(root, "show", "--pretty=format:", "--no-color", hash)
	} else {
		diff, _ = gitDiff(root, "diff", "--no-color", parents[0], hash)
	}
	return &CommitDetail{
		Commit: Commit{
			Hash: f[0], Short: f[1], Subject: f[2], Body: strings.TrimSpace(f[3]),
			Author: f[4], Email: f[5], RelDate: f[6], Date: f[7],
			Refs: strings.TrimSpace(f[8]), Parents: parents,
		},
		Parents: parents,
		Files:   files,
		Diff:    diff,
		IsHead:  f[0] == head,
	}, nil
}

func applyCommitAction(root string, a CommitAction) error {
	if err := validHash(a.Hash); err != nil {
		return err
	}
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "checkout":
		_, err := gitQuiet(root, "checkout", a.Hash)
		return err
	case "cherry-pick":
		_, err := gitQuiet(root, "cherry-pick", "--allow-empty", a.Hash)
		return err
	case "revert":
		_, err := gitQuiet(root, "revert", "--no-edit", a.Hash)
		return err
	case "reset":
		mode := strings.ToLower(a.Mode)
		if mode != "soft" && mode != "mixed" && mode != "hard" {
			return fmt.Errorf("reset mode must be soft, mixed, or hard")
		}
		_, err := git(root, "reset", "--"+mode, a.Hash)
		return err
	case "branch":
		if err := validRef(a.Name); err != nil {
			return err
		}
		_, err := git(root, "branch", a.Name, a.Hash)
		return err
	case "tag":
		if err := validRef(a.Name); err != nil {
			return err
		}
		if a.Annotated {
			msg := a.Message
			if msg == "" {
				msg = a.Name
			}
			_, err := git(root, "tag", "-a", a.Name, "-m", msg, a.Hash)
			return err
		}
		_, err := git(root, "tag", a.Name, a.Hash)
		return err
	case "update-author":
		return updateCommitAuthor(root, a.Hash, a.Author, a.Email, a.Date)
	case "reword":
		return rewordCommit(root, a.Hash, a.Message)
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}

func isHead(root, hash string) bool {
	full, err := git(root, "rev-parse", hash)
	if err != nil {
		return false
	}
	head, err := git(root, "rev-parse", "HEAD")
	return err == nil && full == head
}

func updateCommitAuthor(root, hash, name, email, date string) error {
	name = strings.TrimSpace(name)
	email = strings.TrimSpace(email)
	if name == "" || email == "" || !strings.Contains(email, "@") {
		return fmt.Errorf("author name and email are required")
	}
	author := name + " <" + email + ">"
	if isHead(root, hash) {
		env := []string{"GIT_EDITOR=true"}
		args := []string{"commit", "--amend", "--author=" + author, "--no-edit"}
		if date != "" {
			env = append(env, "GIT_AUTHOR_DATE="+date, "GIT_COMMITTER_DATE="+date)
			args = append(args, "--date="+date)
		}
		_, err := gitEnv(root, env, args...)
		return err
	}
	return rewriteAuthorHistory(root, hash, name, email, date)
}

func rewordCommit(root, hash, message string) error {
	message = strings.TrimSpace(message)
	if message == "" {
		return fmt.Errorf("message is required")
	}
	if !isHead(root, hash) {
		return fmt.Errorf("reword is only supported on HEAD; checkout the commit or reset first")
	}
	_, err := gitQuiet(root, "commit", "--amend", "-m", message)
	return err
}

func rewriteAuthorHistory(root, hash, name, email, date string) error {
	full, err := git(root, "rev-parse", hash)
	if err != nil {
		return err
	}
	script := filepath.Join(os.TempDir(), "vugit-author-filter.sh")
	body := "#!/bin/sh\n" +
		"if [ \"$GIT_COMMIT\" = '" + full + "' ]; then\n" +
		"  export GIT_AUTHOR_NAME=" + shellQuote(name) + "\n" +
		"  export GIT_AUTHOR_EMAIL=" + shellQuote(email) + "\n" +
		"  export GIT_COMMITTER_NAME=" + shellQuote(name) + "\n" +
		"  export GIT_COMMITTER_EMAIL=" + shellQuote(email) + "\n"
	if date != "" {
		body += "  export GIT_AUTHOR_DATE=" + shellQuote(date) + "\n"
		body += "  export GIT_COMMITTER_DATE=" + shellQuote(date) + "\n"
	}
	body += "fi\n"
	if err := os.WriteFile(script, []byte(body), 0o700); err != nil {
		return err
	}
	defer os.Remove(script)

	parentOK := true
	if _, err := git(root, "rev-parse", full+"^"); err != nil {
		parentOK = false
	}
	args := []string{"filter-branch", "-f", "--env-filter", ". " + script}
	if parentOK {
		args = append(args, full+"^..HEAD")
	} else {
		args = append(args, "--", "HEAD")
	}
	_, err = gitEnv(root, []string{"FILTER_BRANCH_SQUELCH_WARNING=1"}, args...)
	return err
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}
