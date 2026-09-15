#!/bin/bash
# Can run from a checkout or from the raw GitHub URL. Defaults to preview.
set -euo pipefail
[[ $(uname -s) == Darwin ]] || { echo 'macOS only' >&2; exit 1; }
[[ $(uname -m) == arm64 ]] || { echo 'This bootstrap currently supports native Apple Silicon Macs only.' >&2; exit 1; }
apply=false; preview=false
for arg in "$@"; do
    case $arg in --apply) apply=true ;; --dry-run) preview=true ;; esac
done
if $apply && $preview; then echo '--apply and --dry-run are mutually exclusive.' >&2; exit 2; fi
if ! xcode-select -p >/dev/null 2>&1; then
    echo 'Install Command Line Tools with xcode-select --install, finish the Apple dialog, then rerun.'
    exit 3
fi
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=${DOTFILES:-$HOME/.dotfiles}
if [[ -f "$script_dir/mac/bootstrap.sh" ]]; then repo=$script_dir; fi
if [[ ! -e "$repo" ]]; then
    if ! $apply; then
        echo "Would clone brs98/.dotfiles to $repo (without game saves), then run mac/bootstrap.sh."
        exit 0
    fi
    git clone https://github.com/brs98/.dotfiles.git "$repo"
fi
[[ -f "$repo/mac/bootstrap.sh" ]] || { echo "Existing $repo has no Mac bootstrap; preserve it and update/review the checkout first." >&2; exit 1; }
exec bash "$repo/mac/bootstrap.sh" "$@"
