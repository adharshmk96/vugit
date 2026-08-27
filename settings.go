package main

import (
	"fmt"
	"strings"
)

// SettingDef describes one git-config key surfaced in the Settings tab.
type SettingDef struct {
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	Desc        string   `json:"desc"`
	Type        string   `json:"type"` // "text" | "bool" | "select"
	Options     []string `json:"options,omitempty"`
	Placeholder string   `json:"placeholder,omitempty"`
}

// SettingGroup is a titled section of related settings.
type SettingGroup struct {
	Name     string       `json:"name"`
	Settings []SettingDef `json:"settings"`
}

// settingsCatalog is the whitelist of config keys the UI can read and write.
// Anything not listed here is rejected on save.
var settingsCatalog = []SettingGroup{
	{
		Name: "Identity",
		Settings: []SettingDef{
			{Key: "user.name", Label: "Name", Desc: "Author/committer name on new commits.", Type: "text", Placeholder: "Ada Lovelace"},
			{Key: "user.email", Label: "Email", Desc: "Author/committer email on new commits.", Type: "text", Placeholder: "ada@example.com"},
			{Key: "user.signingKey", Label: "Signing key", Desc: "GPG/SSH key id used to sign commits and tags.", Type: "text", Placeholder: "0xABCD1234 or ~/.ssh/id_ed25519.pub"},
		},
	},
	{
		Name: "Commit & signing",
		Settings: []SettingDef{
			{Key: "commit.gpgSign", Label: "Sign all commits", Desc: "Sign every commit without passing -S.", Type: "bool"},
			{Key: "tag.gpgSign", Label: "Sign all tags", Desc: "Sign every annotated tag automatically.", Type: "bool"},
			{Key: "gpg.format", Label: "Signature format", Desc: "Signing backend to use.", Type: "select", Options: []string{"openpgp", "ssh", "x509"}},
			{Key: "commit.verbose", Label: "Verbose commit message", Desc: "Show the diff in the commit message editor.", Type: "bool"},
		},
	},
	{
		Name: "Core",
		Settings: []SettingDef{
			{Key: "core.editor", Label: "Editor", Desc: "Editor launched for commit messages, rebases, etc.", Type: "text", Placeholder: "vim"},
			{Key: "core.pager", Label: "Pager", Desc: "Pager used for log, diff and show output.", Type: "text", Placeholder: "less -FRX"},
			{Key: "core.autocrlf", Label: "Line endings (autocrlf)", Desc: "Convert line endings between the repo and working tree.", Type: "select", Options: []string{"true", "input", "false"}},
			{Key: "core.fileMode", Label: "Track file mode", Desc: "Honour the executable bit on files.", Type: "bool"},
			{Key: "core.ignoreCase", Label: "Ignore case", Desc: "Treat paths that differ only in case as the same.", Type: "bool"},
			{Key: "core.longpaths", Label: "Allow long paths", Desc: "Enable paths longer than 260 chars (Windows).", Type: "bool"},
		},
	},
	{
		Name: "Branches & merging",
		Settings: []SettingDef{
			{Key: "init.defaultBranch", Label: "Default branch name", Desc: "Branch created by git init.", Type: "text", Placeholder: "main"},
			{Key: "merge.conflictStyle", Label: "Conflict style", Desc: "How conflict markers are written.", Type: "select", Options: []string{"merge", "diff3", "zdiff3"}},
			{Key: "merge.ff", Label: "Merge fast-forward", Desc: "Fast-forward behaviour for git merge.", Type: "select", Options: []string{"true", "false", "only"}},
			{Key: "rebase.autoStash", Label: "Rebase autostash", Desc: "Stash and reapply local changes around a rebase.", Type: "bool"},
			{Key: "rerere.enabled", Label: "Reuse recorded resolutions", Desc: "Remember and replay conflict resolutions (rerere).", Type: "bool"},
		},
	},
	{
		Name: "Fetch, pull & push",
		Settings: []SettingDef{
			{Key: "pull.rebase", Label: "Pull strategy", Desc: "How git pull integrates upstream changes.", Type: "select", Options: []string{"false", "true", "merges", "interactive"}},
			{Key: "pull.ff", Label: "Pull fast-forward", Desc: "Fast-forward behaviour for git pull.", Type: "select", Options: []string{"true", "false", "only"}},
			{Key: "push.default", Label: "Push default", Desc: "Which branches git push sends without arguments.", Type: "select", Options: []string{"simple", "current", "upstream", "matching", "nothing"}},
			{Key: "push.autoSetupRemote", Label: "Auto set upstream on push", Desc: "Create the upstream ref on first push of a new branch.", Type: "bool"},
			{Key: "push.followTags", Label: "Push annotated tags", Desc: "Include reachable annotated tags on every push.", Type: "bool"},
			{Key: "fetch.prune", Label: "Prune on fetch", Desc: "Delete local refs for branches removed on the remote.", Type: "bool"},
		},
	},
	{
		Name: "Misc",
		Settings: []SettingDef{
			{Key: "color.ui", Label: "Colored output", Desc: "Colorize terminal output.", Type: "select", Options: []string{"auto", "always", "false"}},
			{Key: "credential.helper", Label: "Credential helper", Desc: "Program that caches or stores credentials.", Type: "text", Placeholder: "osxkeychain / cache --timeout=3600"},
			{Key: "diff.colorMoved", Label: "Highlight moved lines", Desc: "Distinguish moved code from added/removed in diffs.", Type: "select", Options: []string{"no", "default", "plain", "zebra", "dimmed-zebra"}},
			{Key: "log.date", Label: "Log date format", Desc: "Default date format for git log.", Type: "select", Options: []string{"default", "relative", "local", "iso", "iso-strict", "short"}},
		},
	},
}

// settingKeys is the lowercase set of writable keys, for validation.
var settingKeys = func() map[string]string {
	m := map[string]string{}
	for _, g := range settingsCatalog {
		for _, s := range g.Settings {
			m[strings.ToLower(s.Key)] = s.Type
		}
	}
	return m
}()

// ScopeValues holds the raw value at each config scope for one key.
type ScopeValues struct {
	Global string `json:"global"`
	Local  string `json:"local"`
}

// SettingsPayload is the response for GET /api/settings.
type SettingsPayload struct {
	InRepo   bool                   `json:"inRepo"`
	RepoPath string                 `json:"repoPath"`
	Groups   []SettingGroup         `json:"groups"`
	Values   map[string]ScopeValues `json:"values"`
}

// SettingChange is one requested edit from POST /api/settings.
type SettingChange struct {
	Key   string `json:"key"`
	Scope string `json:"scope"` // "global" | "local"
	Value string `json:"value"` // "" means unset
}

func readSettings(dir string) (*SettingsPayload, error) {
	out := &SettingsPayload{Groups: settingsCatalog, Values: map[string]ScopeValues{}}

	base := dir
	if root, err := repoRoot(dir); err == nil {
		out.InRepo = true
		out.RepoPath = root
		base = root
	}

	for key := range settingKeys {
		sv := ScopeValues{Global: configGet(base, "global", key)}
		if out.InRepo {
			sv.Local = configGet(base, "local", key)
		}
		out.Values[key] = sv
	}
	return out, nil
}

// configGet reads a single key at the given scope via `git config`. A missing
// key (non-zero exit) yields "".
func configGet(dir, scope, key string) string {
	scopeFlag := "--local"
	if scope == "global" {
		scopeFlag = "--global"
	}
	out, err := git(dir, "config", scopeFlag, "--get", key)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

func applySettings(dir string, changes []SettingChange) error {
	base := dir
	root, repoErr := repoRoot(dir)
	if repoErr == nil {
		base = root
	}

	for _, c := range changes {
		key := strings.TrimSpace(c.Key)
		typ, ok := settingKeys[strings.ToLower(key)]
		if !ok {
			return fmt.Errorf("unknown setting %q", key)
		}
		if c.Scope != "global" && c.Scope != "local" {
			return fmt.Errorf("invalid scope %q for %s", c.Scope, key)
		}
		if c.Scope == "local" && repoErr != nil {
			return fmt.Errorf("cannot set %s locally: not a git repository", key)
		}

		value := strings.TrimSpace(c.Value)
		if typ == "bool" && value != "" && value != "true" && value != "false" {
			return fmt.Errorf("%s must be true or false", key)
		}

		scopeFlag := "--local"
		if c.Scope == "global" {
			scopeFlag = "--global"
		}

		if value == "" {
			// Only unset if it currently has a value; --unset on a missing
			// key exits non-zero.
			if configGet(base, c.Scope, key) == "" {
				continue
			}
			if _, err := git(base, "config", scopeFlag, "--unset", key); err != nil {
				return fmt.Errorf("unset %s: %v", key, err)
			}
			continue
		}

		if _, err := git(base, "config", scopeFlag, key, value); err != nil {
			return fmt.Errorf("set %s: %v", key, err)
		}
	}
	return nil
}
