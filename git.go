package main

import (
	"bytes"
	"errors"
	"os/exec"
	"strings"
)

// unit separator + record separator for machine-parseable git output.
const (
	gitFieldSep  = "\x1f"
	gitRecordSep = "\x1e"
)

// errNotRepo is returned when the working directory is not inside a git repo.
var errNotRepo = errors.New("not a git repository")

// git runs a git command in dir and returns trimmed stdout. A non-zero exit
// yields an error carrying stderr.
func git(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", errors.New(msg)
	}
	return strings.TrimRight(stdout.String(), "\n"), nil
}

// gitLines runs git and splits stdout into non-empty lines.
func gitLines(dir string, args ...string) ([]string, error) {
	out, err := git(dir, args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(out, "\n"), nil
}

// repoRoot resolves the top-level directory of the repo containing dir.
func repoRoot(dir string) (string, error) {
	out, err := git(dir, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", errNotRepo
	}
	return out, nil
}
