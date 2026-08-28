package main

import (
	"fmt"
	"net/http"
	"strings"
)

type Submodule struct {
	Path    string `json:"path"`
	Hash    string `json:"hash"`
	Status  string `json:"status"`
	URL     string `json:"url,omitempty"`
	Branch  string `json:"branch,omitempty"`
	Message string `json:"message,omitempty"`
}

type SubmoduleAction struct {
	Action    string `json:"action"`
	Path      string `json:"path,omitempty"`
	Recursive bool   `json:"recursive,omitempty"`
	Init      bool   `json:"init,omitempty"`
	Remote    bool   `json:"remote,omitempty"`
}

func handleSubmodules(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := listSubmodules(root)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"submodules": list})
	case http.MethodPost:
		var body SubmoduleAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applySubmoduleAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func listSubmodules(root string) ([]Submodule, error) {
	lines, err := gitLines(root, "submodule", "status")
	if err != nil {
		if strings.Contains(err.Error(), "no submodule mapping") {
			return []Submodule{}, nil
		}
		return nil, err
	}
	out := make([]Submodule, 0, len(lines))
	for _, ln := range lines {
		ln = strings.TrimRight(ln, "\n")
		if ln == "" {
			continue
		}
		status := "ok"
		rest := ln
		if len(rest) > 0 && (rest[0] == '-' || rest[0] == '+' || rest[0] == ' ' || rest[0] == 'U') {
			switch rest[0] {
			case '-':
				status = "uninitialized"
			case '+':
				status = "out-of-date"
			case 'U':
				status = "conflict"
			default:
				status = "ok"
			}
			rest = rest[1:]
		}
		fields := strings.Fields(rest)
		if len(fields) < 2 {
			continue
		}
		s := Submodule{Hash: fields[0], Path: fields[1], Status: status}
		if len(fields) > 2 {
			s.Message = strings.Trim(fields[2], "()")
		}
		url, _ := git(root, "config", "-f", ".gitmodules", "submodule."+s.Path+".url")
		s.URL = url
		branch, _ := git(root, "config", "-f", ".gitmodules", "submodule."+s.Path+".branch")
		s.Branch = branch
		out = append(out, s)
	}
	return out, nil
}

func applySubmoduleAction(root string, a SubmoduleAction) error {
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "update":
		args := []string{"submodule", "update"}
		if a.Init {
			args = append(args, "--init")
		}
		if a.Recursive {
			args = append(args, "--recursive")
		}
		if a.Remote {
			args = append(args, "--remote")
		}
		if strings.TrimSpace(a.Path) != "" {
			args = append(args, "--", a.Path)
		}
		_, err := git(root, args...)
		return err
	case "sync":
		args := []string{"submodule", "sync"}
		if a.Recursive {
			args = append(args, "--recursive")
		}
		if strings.TrimSpace(a.Path) != "" {
			args = append(args, "--", a.Path)
		}
		_, err := git(root, args...)
		return err
	case "init":
		args := []string{"submodule", "init"}
		if strings.TrimSpace(a.Path) != "" {
			args = append(args, "--", a.Path)
		}
		_, err := git(root, args...)
		return err
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}
