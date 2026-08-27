#!/usr/bin/env bash
set -euo pipefail

git branch --merged | grep -Ev '(^\*|master|main|dev)' | xargs -r git branch -d
