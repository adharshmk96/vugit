package main

import (
	"fmt"
	"net/http"
	"strings"
)

type ReflogEntry struct {
	Hash     string `json:"hash"`
	Short    string `json:"short"`
	Selector string `json:"selector"`
	Subject  string `json:"subject"`
	Date     string `json:"date"`
	RelDate  string `json:"relDate"`
}

type ReflogAction struct {
	Action string `json:"action"`
	Hash   string `json:"hash"`
	Mode   string `json:"mode,omitempty"`
}

func handleReflog(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		ref := r.URL.Query().Get("ref")
		if ref == "" {
			ref = "HEAD"
		}
		if err := validRef(ref); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		list, err := listReflog(root, ref)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ref": ref, "entries": list})
	case http.MethodPost:
		var body ReflogAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyReflogAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func listReflog(root, ref string) ([]ReflogEntry, error) {
	format := strings.Join([]string{"%H", "%h", "%gd", "%gs", "%ci", "%cr"}, gitFieldSep)
	lines, err := gitLines(root, "reflog", "show", "--pretty="+format, ref)
	if err != nil {
		return nil, err
	}
	out := make([]ReflogEntry, 0, len(lines))
	for _, ln := range lines {
		f := strings.Split(ln, gitFieldSep)
		if len(f) < 6 {
			continue
		}
		out = append(out, ReflogEntry{
			Hash: f[0], Short: f[1], Selector: f[2],
			Subject: f[3], Date: f[4], RelDate: f[5],
		})
	}
	return out, nil
}

func applyReflogAction(root string, a ReflogAction) error {
	if err := validHash(a.Hash); err != nil {
		return err
	}
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "reset":
		mode := strings.ToLower(a.Mode)
		if mode == "" {
			mode = "hard"
		}
		if mode != "soft" && mode != "mixed" && mode != "hard" {
			return fmt.Errorf("reset mode must be soft, mixed, or hard")
		}
		_, err := git(root, "reset", "--"+mode, a.Hash)
		return err
	case "checkout":
		_, err := gitQuiet(root, "checkout", a.Hash)
		return err
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}
