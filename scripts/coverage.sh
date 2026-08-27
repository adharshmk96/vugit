#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COVERAGE_FILE="${ROOT_DIR}/coverage.out"

go test -coverprofile="${COVERAGE_FILE}" "${ROOT_DIR}/..."
go tool cover -html="${COVERAGE_FILE}"
