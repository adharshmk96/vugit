package main

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
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

// gitStdin runs git with patch text on stdin (git apply).
func gitStdin(dir, stdin string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(stdin)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return errors.New(msg)
	}
	return nil
}

// gitDiff runs a diff command. Git exits 1 when diffs exist; that is not an error.
func gitDiff(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) && ee.ExitCode() == 1 {
			return strings.TrimRight(stdout.String(), "\n"), nil
		}
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

// gitEnv is git() with extra environment variables (GIT_EDITOR, author rewrite, …).
func gitEnv(dir string, extraEnv []string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), extraEnv...)

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

// gitQuiet is like git() but never opens an editor.
func gitQuiet(dir string, args ...string) (string, error) {
	return gitEnv(dir, []string{"GIT_EDITOR=true", "GIT_SEQUENCE_EDITOR=true"}, args...)
}

var refNameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/@~^+\-]*$`)

func validRef(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("name is required")
	}
	if strings.HasPrefix(name, "-") {
		return errors.New("invalid name")
	}
	if strings.Contains(name, "..") || strings.Contains(name, "//") {
		return errors.New("invalid name")
	}
	if !refNameRe.MatchString(name) {
		return fmt.Errorf("invalid ref name %q", name)
	}
	return nil
}

func validHash(h string) error {
	h = strings.TrimSpace(h)
	if len(h) < 4 || len(h) > 40 {
		return errors.New("invalid commit hash")
	}
	for _, c := range h {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return errors.New("invalid commit hash")
		}
	}
	return nil
}
