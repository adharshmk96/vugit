package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type Branch struct {
	Name     string `json:"name"`
	Current  bool   `json:"current"`
	Remote   bool   `json:"remote"`
	Upstream string `json:"upstream,omitempty"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
	Hash     string `json:"hash"`
	Subject  string `json:"subject"`
	Date     string `json:"date"`
	Author   string `json:"author"`
	Gone     bool   `json:"gone,omitempty"`
}

type BranchAction struct {
	Action   string `json:"action"`
	Name     string `json:"name"`
	NewName  string `json:"newName,omitempty"`
	Start    string `json:"start,omitempty"`
	Upstream string `json:"upstream,omitempty"`
	Remote   string `json:"remote,omitempty"`
	Force    bool   `json:"force,omitempty"`
}

func handleBranches(w http.ResponseWriter, r *http.Request) {
	root, ok := requireRepo(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := listBranches(root)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"branches": list})
	case http.MethodPost:
		var body BranchAction
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := applyBranchAction(root, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeOK(w, nil)
	default:
		writeAllow(w, http.MethodGet, http.MethodPost)
	}
}

func listBranches(root string) ([]Branch, error) {
	format := strings.Join([]string{
		"%(refname:short)",
		"%(objectname:short)",
		"%(subject)",
		"%(authordate:iso-strict)",
		"%(authorname)",
		"%(upstream:short)",
		"%(upstream:track)",
		"%(HEAD)",
		"%(refname)",
	}, gitFieldSep)
	lines, err := gitLines(root, "for-each-ref", "--sort=-committerdate", "--format="+format, "refs/heads", "refs/remotes")
	if err != nil {
		return nil, err
	}
	out := make([]Branch, 0, len(lines))
	for _, ln := range lines {
		f := strings.Split(ln, gitFieldSep)
		if len(f) < 9 {
			continue
		}
		if strings.HasSuffix(f[8], "/HEAD") || strings.HasSuffix(f[0], "/HEAD") {
			continue
		}
		b := Branch{
			Name:     f[0],
			Hash:     f[1],
			Subject:  f[2],
			Date:     f[3],
			Author:   f[4],
			Upstream: f[5],
			Current:  strings.TrimSpace(f[7]) == "*",
			Remote:   strings.HasPrefix(f[8], "refs/remotes/"),
		}
		track := f[6]
		if strings.Contains(track, "gone") {
			b.Gone = true
		}
		if m := aheadBehindRe.FindStringSubmatch(track); m != nil {
			b.Ahead, _ = strconv.Atoi(m[1])
			b.Behind, _ = strconv.Atoi(m[2])
		}
		out = append(out, b)
	}
	return out, nil
}

func applyBranchAction(root string, a BranchAction) error {
	action := strings.ToLower(strings.TrimSpace(a.Action))
	if err := validRef(a.Name); err != nil && action != "" && action != "create" {
		if action != "create" {
			return err
		}
	}
	switch action {
	case "checkout":
		if err := validRef(a.Name); err != nil {
			return err
		}
		_, err := gitQuiet(root, "switch", a.Name)
		if err != nil {
			_, err = gitQuiet(root, "checkout", a.Name)
		}
		return err
	case "create":
		if err := validRef(a.Name); err != nil {
			return err
		}
		args := []string{"switch", "-c", a.Name}
		if strings.TrimSpace(a.Start) != "" {
			if err := validRef(a.Start); err != nil {
				if err2 := validHash(a.Start); err2 != nil {
					return err
				}
			}
			args = append(args, a.Start)
		}
		_, err := gitQuiet(root, args...)
		return err
	case "rename":
		if err := validRef(a.Name); err != nil {
			return err
		}
		if err := validRef(a.NewName); err != nil {
			return err
		}
		_, err := git(root, "branch", "-m", a.Name, a.NewName)
		return err
	case "delete":
		if err := validRef(a.Name); err != nil {
			return err
		}
		if a.Remote != "" {
			if err := validRef(a.Remote); err != nil {
				return err
			}
			_, err := git(root, "push", a.Remote, "--delete", a.Name)
			return err
		}
		flag := "-d"
		if a.Force {
			flag = "-D"
		}
		if strings.HasPrefix(a.Name, "origin/") || strings.Count(a.Name, "/") >= 1 {
			// remote-tracking ref stored locally
			if _, err := git(root, "show-ref", "--verify", "--quiet", "refs/remotes/"+a.Name); err == nil {
				_, err := git(root, "branch", "-r", flag, a.Name)
				return err
			}
		}
		_, err := git(root, "branch", flag, a.Name)
		return err
	case "merge":
		if err := validRef(a.Name); err != nil {
			return err
		}
		_, err := gitQuiet(root, "merge", "--no-edit", a.Name)
		return err
	case "squash-merge-main":
		return squashMergeToMain(root, a.Name)
	case "rebase":
		if err := validRef(a.Name); err != nil {
			return err
		}
		_, err := gitQuiet(root, "rebase", a.Name)
		return err
	case "set-upstream":
		if err := validRef(a.Name); err != nil {
			return err
		}
		up := a.Upstream
		if up == "" {
			up = "origin/" + a.Name
		}
		if err := validRef(up); err != nil {
			return err
		}
		_, err := git(root, "branch", "-u", up, a.Name)
		return err
	case "push":
		if err := validRef(a.Name); err != nil {
			return err
		}
		remote := a.Remote
		if remote == "" {
			remote = "origin"
		}
		if err := validRef(remote); err != nil {
			return err
		}
		_, err := git(root, "push", "-u", remote, a.Name)
		return err
	default:
		return fmt.Errorf("unknown action %q", a.Action)
	}
}

const squashMergeTarget = "main"

func squashMergeToMain(root, source string) error {
	if err := validRef(source); err != nil {
		return err
	}
	if source == squashMergeTarget || strings.HasSuffix(source, "/"+squashMergeTarget) {
		return fmt.Errorf("cannot squash merge %s into itself", squashMergeTarget)
	}
	if _, err := git(root, "show-ref", "--verify", "--quiet", "refs/heads/"+squashMergeTarget); err != nil {
		return fmt.Errorf("branch %s does not exist", squashMergeTarget)
	}

	head, err := git(root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return err
	}
	if head != squashMergeTarget {
		if _, err := gitQuiet(root, "switch", squashMergeTarget); err != nil {
			if _, err = gitQuiet(root, "checkout", squashMergeTarget); err != nil {
				return err
			}
		}
	}

	if _, err := gitQuiet(root, "merge", "--squash", source); err != nil {
		return err
	}

	staged, err := git(root, "diff", "--cached", "--name-only")
	if err != nil {
		return err
	}
	if strings.TrimSpace(staged) == "" {
		return fmt.Errorf("nothing to squash merge from %s into %s", source, squashMergeTarget)
	}

	_, err = gitQuiet(root, "commit", "--no-edit")
	return err
}

func splitRemoteBranch(name string) (remote, branch string) {
	i := strings.Index(name, "/")
	if i <= 0 {
		return "", name
	}
	return name[:i], name[i+1:]
}
