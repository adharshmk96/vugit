package main

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type RemoteDetail struct {
	Name     string   `json:"name"`
	URL      string   `json:"url"`
	FetchURL string   `json:"fetchUrl"`
	PushURL  string   `json:"pushUrl"`
	Heads    []string `json:"heads,omitempty"`
}

type RemoteAction struct {
	Action  string `json:"action"`
	Name    string `json:"name"`
	NewName string `json:"newName,omitempty"`
	URL     string `json:"url,omitempty"`
	PushURL string `json:"pushUrl,omitempty"`
	Branch  string `json:"branch,omitempty"`
	Prune   bool   `json:"prune,omitempty"`
	Force   bool   `json:"force,omitempty"`
	Tags    bool   `json:"tags,omitempty"`
}

func handleRemotes(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := listRemoteDetails(root)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"remotes": list})
	case http.MethodPost:
		var body RemoteAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyRemoteAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func listRemoteDetails(root string) ([]RemoteDetail, error) {
	lines, err := gitLines(root, "remote", "-v")
	if err != nil {
		return nil, err
	}
	byName := map[string]*RemoteDetail{}
	var order []string
	for _, ln := range lines {
		fields := strings.Fields(ln)
		if len(fields) < 3 {
			continue
		}
		name, url, kind := fields[0], fields[1], fields[2]
		d, ok := byName[name]
		if !ok {
			redacted := redactURL(url)
			d = &RemoteDetail{Name: name, URL: redacted, FetchURL: redacted, PushURL: redacted}
			byName[name] = d
			order = append(order, name)
		}
		if kind == "(fetch)" {
			d.FetchURL = redactURL(url)
			d.URL = d.FetchURL
		}
		if kind == "(push)" {
			d.PushURL = redactURL(url)
		}
	}
	out := make([]RemoteDetail, 0, len(order))
	for _, name := range order {
		d := *byName[name]
		heads, _ := gitLines(root, "for-each-ref", "--format=%(refname:short)", "refs/remotes/"+name)
		for _, h := range heads {
			h = strings.TrimSpace(h)
			if h == "" || strings.HasSuffix(h, "/HEAD") {
				continue
			}
			d.Heads = append(d.Heads, strings.TrimPrefix(h, name+"/"))
		}
		out = append(out, d)
	}
	return out, nil
}

func applyRemoteAction(root string, a RemoteAction) error {
	name := strings.TrimSpace(a.Name)
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "add":
		if err := validRef(name); err != nil {
			return err
		}
		if strings.TrimSpace(a.URL) == "" {
			return fmt.Errorf("url is required")
		}
		_, err := git(root, "remote", "add", name, a.URL)
		return err
	case "rename":
		if err := validRef(name); err != nil {
			return err
		}
		if err := validRef(a.NewName); err != nil {
			return err
		}
		_, err := git(root, "remote", "rename", name, a.NewName)
		return err
	case "remove":
		if err := validRef(name); err != nil {
			return err
		}
		_, err := git(root, "remote", "remove", name)
		return err
	case "fetch":
		if err := validRef(name); err != nil {
			return err
		}
		args := []string{"fetch", name}
		if a.Prune {
			args = append(args, "--prune")
		}
		_, err := git(root, args...)
		return err
	case "prune":
		if err := validRef(name); err != nil {
			return err
		}
		_, err := git(root, "remote", "prune", name)
		return err
	case "pull":
		if name == "" {
			name = "origin"
		}
		if err := validRef(name); err != nil {
			return err
		}
		args := []string{"pull", "--no-edit", name}
		if strings.TrimSpace(a.Branch) != "" {
			if err := validRef(a.Branch); err != nil {
				return err
			}
			args = append(args, a.Branch)
		}
		_, err := gitQuiet(root, args...)
		return err
	case "push":
		if name == "" {
			name = "origin"
		}
		if err := validRef(name); err != nil {
			return err
		}
		args := []string{"push", name}
		if a.Tags {
			args = append(args, "--tags")
		}
		if a.Force {
			args = append(args, "--force-with-lease")
		}
		if strings.TrimSpace(a.Branch) != "" {
			if err := validRef(a.Branch); err != nil {
				return err
			}
			args = append(args, a.Branch)
		}
		_, err := git(root, args...)
		return err
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}

func redactURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.User == nil {
		return raw
	}
	if _, hasPass := u.User.Password(); hasPass {
		u.User = url.UserPassword(u.User.Username(), "***")
	} else if u.User.Username() != "" {
		u.User = url.User("***")
	}
	return u.String()
}
