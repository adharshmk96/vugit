#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/out/linux"

mkdir -p "${OUT_DIR}"
GOOS=linux GOARCH=amd64 go build -o "${OUT_DIR}/vugit" "${ROOT_DIR}"
