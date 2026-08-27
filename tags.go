package main

import (
	"fmt"
	"net/http"
	"strings"
)

type Tag struct {
	Name      string `json:"name"`
	Hash      string `json:"hash"`
	Target    string `json:"target"`
	Annotated bool   `json:"annotated"`
	Message   string `json:"message,omitempty"`
	Tagger    string `json:"tagger,omitempty"`
	Date      string `json:"date,omitempty"`
	Subject   string `json:"subject,omitempty"`
}

type TagAction struct {
	Action    string `json:"action"`
	Name      string `json:"name"`
	Hash      string `json:"hash,omitempty"`
	Message   string `json:"message,omitempty"`
	Annotated bool   `json:"annotated,omitempty"`
	Signed    bool   `json:"signed,omitempty"`
	Remote    string `json:"remote,omitempty"`
}

func handleTags(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := listTags(root)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tags": list})
	case http.MethodPost:
		var body TagAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyTagAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func listTags(root string) ([]Tag, error) {
	format := strings.Join([]string{
		"%(refname:short)",
		"%(objectname:short)",
		"%(objecttype)",
		"%(subject)",
		"%(taggername)",
		"%(taggerdate:iso-strict)",
		"%(authordate:iso-strict)",
		"%(contents:subject)",
		"%(*objectname:short)",
	}, gitFieldSep)
	lines, err := gitLines(root, "for-each-ref", "--sort=-creatordate", "--format="+format, "refs/tags")
	if err != nil {
		return nil, err
	}
	out := make([]Tag, 0, len(lines))
	for _, ln := range lines {
		f := strings.Split(ln, gitFieldSep)
		if len(f) < 8 {
			continue
		}
		t := Tag{
			Name:      f[0],
			Hash:      f[1],
			Target:    f[1],
			Annotated: f[2] == "tag",
			Message:   f[3],
			Tagger:    f[4],
			Subject:   f[7],
		}
		if t.Annotated {
			t.Date = f[5]
			if len(f) > 8 && f[8] != "" {
				t.Target = f[8]
			}
		} else {
			t.Date = f[6]
		}
		out = append(out, t)
	}
	return out, nil
}

func applyTagAction(root string, a TagAction) error {
	if err := validRef(a.Name); err != nil && a.Action != "push-all" {
		return err
	}
	switch strings.ToLower(strings.TrimSpace(a.Action)) {
	case "create":
		args := []string{"tag"}
		if a.Signed {
			args = append(args, "-s")
			msg := a.Message
			if msg == "" {
				msg = a.Name
			}
			args = append(args, "-m", msg)
		} else if a.Annotated {
			msg := a.Message
			if msg == "" {
				msg = a.Name
			}
			args = append(args, "-a", "-m", msg)
		}
		args = append(args, a.Name)
		if strings.TrimSpace(a.Hash) != "" {
			if err := validHash(a.Hash); err != nil {
				if err2 := validRef(a.Hash); err2 != nil {
					return err
				}
			}
			args = append(args, a.Hash)
		}
		_, err := gitQuiet(root, args...)
		return err
	case "delete":
		_, err := git(root, "tag", "-d", a.Name)
		return err
	case "push":
		remote := a.Remote
		if remote == "" {
			remote = "origin"
		}
		if err := validRef(remote); err != nil {
			return err
		}
		_, err := git(root, "push", remote, "refs/tags/"+a.Name)
		return err
	case "push-all":
		remote := a.Remote
		if remote == "" {
			remote = "origin"
		}
		if err := validRef(remote); err != nil {
			return err
		}
		_, err := git(root, "push", remote, "--tags")
		return err
	case "checkout":
		_, err := gitQuiet(root, "checkout", a.Name)
		return err
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}
