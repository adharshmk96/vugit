# vugit

CLI tool to manage project versioning alongside git tags.

## Status

Initial boilerplate — features coming soon.

## Install

```bash
go install github.com/adharshmk96/vugit@latest
```

## Usage

```bash
# Start the web UI (opens browser)
vugit

# Same as above
vugit ui

# Custom port, skip browser
vugit ui --port 8080 --no-open

# Version
vugit --version
```

## Development

```bash
task build   # cross-compile to out/
task test    # run tests
```

## Release

Tag with semver (`v*.*.*`) to trigger GoReleaser via GitHub Actions.
