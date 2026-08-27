#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/out/win64"

mkdir -p "${OUT_DIR}"
GOOS=windows GOARCH=amd64 go build -o "${OUT_DIR}/vugit.exe" "${ROOT_DIR}"
