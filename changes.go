package main

import (
	"fmt"
	"net/http"
	"strings"
)

type ChangesPayload struct {
	Status WorkingTree `json:"status"`
	Branch string      `json:"branch"`
	Head   string      `json:"head"`
}

type ChangesAction struct {
	Action           string   `json:"action"`
	Paths            []string `json:"paths,omitempty"`
	Message          string   `json:"message,omitempty"`
	Amend            bool     `json:"amend,omitempty"`
	Signoff          bool     `json:"signoff,omitempty"`
	AllowEmpty       bool     `json:"allowEmpty,omitempty"`
	IncludeUntracked bool     `json:"includeUntracked,omitempty"`
	Patch            string   `json:"patch,omitempty"`
	Staged           bool     `json:"staged,omitempty"`
}

func handleChanges(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		ov := &Overview{}
		st := parseStatus(root, ov)
		head, _ := git(root, "rev-parse", "--short", "HEAD")
		branch := ov.Repo.Branch
		if branch == "" {
			if b, err := git(root, "symbolic-ref", "--quiet", "--short", "HEAD"); err == nil {
				branch = b
			} else {
				branch = head
			}
		}
		writeJSON(w, http.StatusOK, ChangesPayload{Status: st, Branch: branch, Head: head})
	case http.MethodPost:
		var body ChangesAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyChangesAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func handleDiff(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeAllow(w, http.MethodGet)
		return
	}
	q := r.URL.Query()
	path := q.Get("path")
	staged := q.Get("staged") == "1" || q.Get("staged") == "true"
	untracked := q.Get("untracked") == "1" || q.Get("untracked") == "true"
	diff, err := fileDiff(root, path, staged, untracked)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": path, "diff": diff})
}

func fileDiff(root, path string, staged, untracked bool) (string, error) {
	if path == "" {
		if staged {
			return gitDiff(root, "diff", "--cached", "--no-color")
		}
		return gitDiff(root, "diff", "--no-color")
	}
	if untracked {
		return gitDiff(root, "diff", "--no-color", "--no-index", "--", "/dev/null", path)
	}
	args := []string{"diff", "--no-color"}
	if staged {
		args = append(args, "--cached")
	}
	args = append(args, "--", path)
	return gitDiff(root, args...)
}

func applyChangesAction(root string, a ChangesAction) error {
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "stage":
		if a.Patch != "" {
			return gitApply(root, a.Patch, true, false)
		}
		if len(a.Paths) == 0 {
			_, err := git(root, "add", "-A")
			return err
		}
		args := append([]string{"add", "--"}, a.Paths...)
		_, err := git(root, args...)
		return err
	case "unstage":
		if a.Patch != "" {
			return gitApply(root, a.Patch, true, true)
		}
		if len(a.Paths) == 0 {
			_, err := git(root, "restore", "--staged", ".")
			return err
		}
		args := append([]string{"restore", "--staged", "--"}, a.Paths...)
		_, err := git(root, args...)
		return err
	case "discard":
		if len(a.Paths) == 0 {
			return fmt.Errorf("paths required to discard")
		}
		var tracked, untracked []string
		for _, p := range a.Paths {
			if _, err := git(root, "ls-files", "--error-unmatch", "--", p); err != nil {
				untracked = append(untracked, p)
			} else {
				tracked = append(tracked, p)
			}
		}
		if len(tracked) > 0 {
			args := append([]string{"restore", "--worktree", "--"}, tracked...)
			if _, err := git(root, args...); err != nil {
				return err
			}
		}
		if len(untracked) > 0 {
			args := append([]string{"clean", "-f", "--"}, untracked...)
			if _, err := git(root, args...); err != nil {
				return err
			}
		}
		return nil
	case "commit":
		msg := strings.TrimSpace(a.Message)
		if msg == "" && !a.Amend {
			return fmt.Errorf("commit message is required")
		}
		args := []string{"commit"}
		if a.Amend {
			args = append(args, "--amend", "--no-edit")
			if msg != "" {
				args = []string{"commit", "--amend", "-m", msg}
			}
		} else {
			args = append(args, "-m", msg)
		}
		if a.Signoff {
			args = append(args, "--signoff")
		}
		if a.AllowEmpty {
			args = append(args, "--allow-empty")
		}
		_, err := gitQuiet(root, args...)
		return err
	case "stash":
		args := []string{"stash", "push"}
		if strings.TrimSpace(a.Message) != "" {
			args = append(args, "-m", a.Message)
		}
		if a.IncludeUntracked {
			args = append(args, "-u")
		}
		_, err := git(root, args...)
		return err
	case "apply-patch":
		if a.Patch == "" {
			return fmt.Errorf("patch is required")
		}
		return gitApply(root, a.Patch, a.Staged, false)
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}

func gitApply(root, patch string, cached, reverse bool) error {
	args := []string{"apply"}
	if cached {
		args = append(args, "--cached")
	}
	if reverse {
		args = append(args, "-R")
	}
	return gitStdin(root, patch, args...)
}
