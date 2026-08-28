package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
)

// registerAPI mounts the JSON API used by the web UI.
func registerAPI(mux *http.ServeMux) {
	mux.HandleFunc("/api/overview", handleOverview)
	mux.HandleFunc("/api/settings", handleSettings)
	mux.HandleFunc("/api/branches", handleBranches)
	mux.HandleFunc("/api/commits", handleCommits)
	mux.HandleFunc("/api/commits/show", handleCommitShow)
	mux.HandleFunc("/api/changes", handleChanges)
	mux.HandleFunc("/api/diff", handleDiff)
	mux.HandleFunc("/api/tags", handleTags)
	mux.HandleFunc("/api/remotes", handleRemotes)
	mux.HandleFunc("/api/stashes", handleStashes)
	mux.HandleFunc("/api/stashes/show", handleStashShow)
	mux.HandleFunc("/api/reflog", handleReflog)
	mux.HandleFunc("/api/submodules", handleSubmodules)
}

func handleOverview(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeAllow(w, http.MethodGet)
		return
	}
	ov, err := buildOverview(root)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func handleSettings(w http.ResponseWriter, r *http.Request) {
	dir, err := os.Getwd()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		payload, err := readSettings(dir)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, payload)

	case http.MethodPost:
		var body struct {
			Changes []SettingChange `json:"changes"`
		}
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applySettings(dir, body.Changes); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		payload, err := readSettings(dir)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, payload)

	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func requireRepo(w http.ResponseWriter, r *http.Request) (string, bool) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeAllow(w, http.MethodGet, http.MethodPost)
		return "", false
	}
	dir, err := os.Getwd()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return "", false
	}
	root, err := repoRoot(dir)
	if err != nil {
		writeError(w, http.StatusBadRequest, "not a git repository")
		return "", false
	}
	return root, true
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	return dec.Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeAllow(w http.ResponseWriter, methods ...string) {
	w.Header().Set("Allow", strings.Join(methods, ", "))
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func writeOK(w http.ResponseWriter, extra map[string]any) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["ok"] = true
	writeJSON(w, http.StatusOK, extra)
}
