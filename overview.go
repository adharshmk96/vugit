package main

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Overview is the payload for the Home tab.
type Overview struct {
	Repo    RepoInfo    `json:"repo"`
	Status  WorkingTree `json:"status"`
	Commits []Commit    `json:"commits"`
	Stashes []Stash     `json:"stashes"`
	Remotes []Remote    `json:"remotes"`
	Stats   RepoStats   `json:"stats"`
}

type RepoInfo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Branch   string `json:"branch"`
	Upstream string `json:"upstream"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
	Detached bool   `json:"detached"`
	Head     string `json:"head"`
}

type ChangeEntry struct {
	Path   string `json:"path"`
	Status string `json:"status"` // human label: modified, added, deleted, renamed, untracked...
	Code   string `json:"code"`   // raw XY porcelain code
}

type WorkingTree struct {
	Clean      bool          `json:"clean"`
	Staged     []ChangeEntry `json:"staged"`
	Unstaged   []ChangeEntry `json:"unstaged"`
	Untracked  []ChangeEntry `json:"untracked"`
	Conflicted []ChangeEntry `json:"conflicted"`
}

type Commit struct {
	Hash    string   `json:"hash"`
	Short   string   `json:"short"`
	Subject string   `json:"subject"`
	Body    string   `json:"body,omitempty"`
	Author  string   `json:"author"`
	Email   string   `json:"email"`
	RelDate string   `json:"relDate"`
	Date    string   `json:"date"`
	Refs    string   `json:"refs"`
	Parents []string `json:"parents,omitempty"`
}

type Stash struct {
	Ref     string `json:"ref"`
	Index   int    `json:"index"`
	Branch  string `json:"branch"`
	Message string `json:"message"`
	Date    string `json:"date,omitempty"`
}

type Remote struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	FetchURL string `json:"fetchUrl,omitempty"`
	PushURL  string `json:"pushUrl,omitempty"`
}

type RepoStats struct {
	LocalBranches  int `json:"localBranches"`
	RemoteBranches int `json:"remoteBranches"`
	Tags           int `json:"tags"`
	Stashes        int `json:"stashes"`
	Commits        int `json:"commits"`
	Contributors   int `json:"contributors"`
}

var aheadBehindRe = regexp.MustCompile(`\[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\]`)

func buildOverview(dir string) (*Overview, error) {
	root, err := repoRoot(dir)
	if err != nil {
		return nil, err
	}

	ov := &Overview{}
	ov.Repo.Path = root
	ov.Repo.Name = filepath.Base(root)

	ov.Repo.Head, _ = git(root, "rev-parse", "--short", "HEAD")

	if branch, err := git(root, "symbolic-ref", "--quiet", "--short", "HEAD"); err == nil {
		ov.Repo.Branch = branch
	} else {
		ov.Repo.Detached = true
		ov.Repo.Branch = ov.Repo.Head
	}

	ov.Status = parseStatus(root, ov)
	ov.Commits = readCommits(root, 20)
	ov.Stashes = readStashes(root)
	ov.Remotes = readRemotes(root)
	ov.Stats = readStats(root)

	return ov, nil
}

func parseStatus(root string, ov *Overview) WorkingTree {
	wt := WorkingTree{
		Staged:     []ChangeEntry{},
		Unstaged:   []ChangeEntry{},
		Untracked:  []ChangeEntry{},
		Conflicted: []ChangeEntry{},
	}
	lines, _ := gitLines(root, "status", "--porcelain=v1", "--branch")

	for _, ln := range lines {
		if strings.HasPrefix(ln, "## ") {
			parseBranchLine(strings.TrimPrefix(ln, "## "), ov)
			continue
		}
		if len(ln) < 3 {
			continue
		}
		code := ln[:2]
		path := strings.TrimSpace(ln[3:])
		x, y := code[0], code[1]

		switch {
		case code == "??":
			wt.Untracked = append(wt.Untracked, ChangeEntry{Path: path, Status: "untracked", Code: code})
		case x == 'U' || y == 'U' || code == "AA" || code == "DD":
			wt.Conflicted = append(wt.Conflicted, ChangeEntry{Path: path, Status: "conflicted", Code: code})
		default:
			if x != ' ' {
				wt.Staged = append(wt.Staged, ChangeEntry{Path: path, Status: label(x), Code: code})
			}
			if y != ' ' {
				wt.Unstaged = append(wt.Unstaged, ChangeEntry{Path: path, Status: label(y), Code: code})
			}
		}
	}

	wt.Clean = len(wt.Staged) == 0 && len(wt.Unstaged) == 0 &&
		len(wt.Untracked) == 0 && len(wt.Conflicted) == 0
	return wt
}

func parseBranchLine(s string, ov *Overview) {
	// forms: "main...origin/main [ahead 1, behind 2]" | "main" | "HEAD (no branch)"
	if strings.HasPrefix(s, "HEAD (no branch)") {
		return
	}
	rest := s
	if i := strings.Index(rest, " ["); i >= 0 {
		bracket := rest[i+1:]
		rest = rest[:i]
		if m := aheadBehindRe.FindStringSubmatch(bracket); m != nil {
			ov.Repo.Ahead, _ = strconv.Atoi(m[1])
			ov.Repo.Behind, _ = strconv.Atoi(m[2])
		}
	}
	if i := strings.Index(rest, "..."); i >= 0 {
		ov.Repo.Upstream = rest[i+3:]
	}
}

func label(c byte) string {
	switch c {
	case 'M':
		return "modified"
	case 'A':
		return "added"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case 'T':
		return "typechange"
	default:
		return string(c)
	}
}

func readCommits(root string, n int) []Commit {
	format := strings.Join([]string{"%H", "%h", "%s", "%an", "%ae", "%ar", "%cI", "%D"}, gitFieldSep)
	out, err := git(root, "log", "-n", strconv.Itoa(n), "--pretty=format:"+format+gitRecordSep)
	if err != nil || out == "" {
		return nil
	}

	var commits []Commit
	for _, rec := range strings.Split(out, gitRecordSep) {
		rec = strings.Trim(rec, "\n")
		if rec == "" {
			continue
		}
		f := strings.Split(rec, gitFieldSep)
		if len(f) < 8 {
			continue
		}
		commits = append(commits, Commit{
			Hash: f[0], Short: f[1], Subject: f[2],
			Author: f[3], Email: f[4], RelDate: f[5], Date: f[6],
			Refs: strings.TrimSpace(f[7]),
		})
	}
	return commits
}

func readStashes(root string) []Stash {
	lines, _ := gitLines(root, "stash", "list", "--pretty=%gd"+gitFieldSep+"%gs")
	var out []Stash
	for _, ln := range lines {
		f := strings.SplitN(ln, gitFieldSep, 2)
		if len(f) != 2 {
			continue
		}
		s := Stash{Ref: f[0], Message: f[1]}
		// "WIP on main: 1a2b3c subject" / "On main: message"
		if i := strings.Index(f[1], " on "); i >= 0 {
			tail := f[1][i+4:]
			if j := strings.Index(tail, ":"); j >= 0 {
				s.Branch = tail[:j]
				s.Message = strings.TrimSpace(tail[j+1:])
			}
		}
		out = append(out, s)
	}
	return out
}

func readRemotes(root string) []Remote {
	lines, _ := gitLines(root, "remote", "-v")
	seen := map[string]bool{}
	var out []Remote
	for _, ln := range lines {
		if !strings.Contains(ln, "(fetch)") {
			continue
		}
		fields := strings.Fields(ln)
		if len(fields) < 2 || seen[fields[0]] {
			continue
		}
		seen[fields[0]] = true
		out = append(out, Remote{Name: fields[0], URL: fields[1]})
	}
	return out
}

func readStats(root string) RepoStats {
	st := RepoStats{}
	if l, err := gitLines(root, "branch", "--list"); err == nil {
		st.LocalBranches = len(l)
	}
	if l, err := gitLines(root, "branch", "-r"); err == nil {
		st.RemoteBranches = len(l)
	}
	if l, err := gitLines(root, "tag"); err == nil {
		st.Tags = len(l)
	}
	if l, err := gitLines(root, "stash", "list"); err == nil {
		st.Stashes = len(l)
	}
	if out, err := git(root, "rev-list", "--count", "HEAD"); err == nil {
		st.Commits, _ = strconv.Atoi(out)
	}
	if l, err := gitLines(root, "shortlog", "-sn", "--all", "--no-merges"); err == nil {
		st.Contributors = len(l)
	}
	return st
}
