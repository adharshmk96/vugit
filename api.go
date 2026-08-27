package main

import (
	"encoding/json"
	"net/http"
	"os"
)

// registerAPI mounts the JSON API used by the web UI.
func registerAPI(mux *http.ServeMux) {
	mux.HandleFunc("/api/overview", handleOverview)
}

func handleOverview(w http.ResponseWriter, r *http.Request) {
	dir, err := os.Getwd()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	ov, err := buildOverview(dir)
	if err != nil {
		if err == errNotRepo {
			writeError(w, http.StatusBadRequest, "not a git repository")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
