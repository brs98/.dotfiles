#!/usr/bin/env bash
set -euo pipefail

doctor_repo="${TYPESCRIPT_DOCTOR_REPO:-$HOME/personal/typescript-doctor}"
if [[ -f "$doctor_repo/src/cli.ts" ]] && command -v bun >/dev/null 2>&1; then
  exec bun run "$doctor_repo/src/cli.ts" "$@"
fi
if command -v typescript-doctor >/dev/null 2>&1; then
  exec typescript-doctor "$@"
fi
printf '%s\n' 'TypeScript Doctor is unavailable. Set TYPESCRIPT_DOCTOR_REPO to a local checkout with dependencies installed, or install the CLI using the project package manager.' >&2
exit 1
