package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type StashDetail struct {
	Stash
	Files []string `json:"files,omitempty"`
	Diff  string   `json:"diff,omitempty"`
}

type StashAction struct {
	Action           string `json:"action"`
	Ref              string `json:"ref"`
	Message          string `json:"message,omitempty"`
	Branch           string `json:"branch,omitempty"`
	IncludeUntracked bool   `json:"includeUntracked,omitempty"`
}

func handleStashes(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := listStashes(root)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"stashes": list})
	case http.MethodPost:
		var body StashAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyStashAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func handleStashShow(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeAllow(w, http.MethodGet)
		return
	}
	ref := r.URL.Query().Get("ref")
	if err := validStashRef(ref); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	files, _ := gitLines(root, "stash", "show", "--name-only", ref)
	diff, _ := gitDiff(root, "stash", "show", "-p", "--no-color", ref)
	writeJSON(w, http.StatusOK, map[string]any{"ref": ref, "files": files, "diff": diff})
}

func listStashes(root string) ([]Stash, error) {
	format := strings.Join([]string{"%gd", "%ci", "%gs"}, gitFieldSep)
	lines, err := gitLines(root, "stash", "list", "--pretty="+format)
	if err != nil {
		return nil, err
	}
	out := make([]Stash, 0, len(lines))
	for i, ln := range lines {
		f := strings.SplitN(ln, gitFieldSep, 3)
		if len(f) < 3 {
			continue
		}
		s := Stash{Ref: f[0], Date: f[1], Message: f[2], Index: i}
		msg := f[2]
		if j := strings.Index(msg, " on "); j >= 0 {
			tail := msg[j+4:]
			if k := strings.Index(tail, ":"); k >= 0 {
				s.Branch = tail[:k]
				s.Message = strings.TrimSpace(tail[k+1:])
			}
		} else if j := strings.Index(msg, "On "); j == 0 {
			tail := msg[3:]
			if k := strings.Index(tail, ":"); k >= 0 {
				s.Branch = tail[:k]
				s.Message = strings.TrimSpace(tail[k+1:])
			}
		}
		out = append(out, s)
	}
	return out, nil
}

func validStashRef(ref string) error {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return fmt.Errorf("stash ref is required")
	}
	if strings.HasPrefix(ref, "stash@{") && strings.HasSuffix(ref, "}") {
		inner := strings.TrimSuffix(strings.TrimPrefix(ref, "stash@{"), "}")
		if _, err := strconv.Atoi(inner); err == nil {
			return nil
		}
	}
	return validRef(ref)
}

func applyStashAction(root string, a StashAction) error {
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "create":
		args := []string{"stash", "push"}
		if strings.TrimSpace(a.Message) != "" {
			args = append(args, "-m", a.Message)
		}
		if a.IncludeUntracked {
			args = append(args, "-u")
		}
		_, err := git(root, args...)
		return err
	case "apply":
		if err := validStashRef(a.Ref); err != nil {
			return err
		}
		_, err := git(root, "stash", "apply", a.Ref)
		return err
	case "pop":
		if err := validStashRef(a.Ref); err != nil {
			return err
		}
		_, err := git(root, "stash", "pop", a.Ref)
		return err
	case "drop":
		if err := validStashRef(a.Ref); err != nil {
			return err
		}
		_, err := git(root, "stash", "drop", a.Ref)
		return err
	case "branch":
		if err := validStashRef(a.Ref); err != nil {
			return err
		}
		if err := validRef(a.Branch); err != nil {
			return err
		}
		_, err := gitQuiet(root, "stash", "branch", a.Branch, a.Ref)
		return err
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}
