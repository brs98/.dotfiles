#!/bin/bash
set -euo pipefail
[[ $(uname -s) == Darwin ]] || { echo 'macOS only' >&2; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd)
apply=false; preview=false; phase=all; flags=(--dry-run); desktop_flags=(--dry-run)
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run) preview=true ;;
        --apply) apply=true; flags+=(--apply); desktop_flags+=(--apply) ;;
        --backup-conflicts) flags+=(--backup-conflicts) ;;
        --onboarding-complete) desktop_flags+=(--onboarding-complete) ;;
        --phase) shift; phase=${1:?phase required} ;;
        -h|--help) echo 'Usage: setup-mac.sh [--apply] [--backup-conflicts] [--onboarding-complete] [--phase all|packages|config|desktop|preferences|herdr|verify]'; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
done
if $apply && $preview; then echo '--apply and --dry-run are mutually exclusive.' >&2; exit 2; fi
case $phase in all|packages|config|desktop|preferences|herdr|verify) ;; *) echo "Unknown phase: $phase" >&2; exit 2;; esac
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if $apply; then
    log_dir="$HOME/.local/state/mac-bootstrap/logs"
    mkdir -p "$log_dir"
    chmod 700 "$log_dir"
    log_file="$log_dir/$(date +%Y%m%d-%H%M%S)-$$.log"
    touch "$log_file"
    chmod 600 "$log_file"
    exec > >(tee -a "$log_file") 2>&1
    echo "Setup log: $log_file"
fi
pending=0
run_phase() {
    local status=0
    "$@" || status=$?
    if [[ $status == 3 ]]; then pending=1
    elif [[ $status != 0 ]]; then return "$status"
    fi
}
if [[ $phase == all || $phase == packages ]]; then
    if ! $apply; then
        echo "Would install Homebrew if absent, brew bundle --no-upgrade --file $root/mac/Brewfile, then standalone Codex if absent."
    else
        if ! command -v brew >/dev/null; then
            script=$(mktemp)
            curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$script"
            /bin/bash "$script"
            rm "$script"
        fi
        eval "$(brew shellenv)"
        brew bundle --no-upgrade --file "$root/mac/Brewfile"
        if ! command -v codex >/dev/null; then
            script=$(mktemp)
            curl -fsSL https://chatgpt.com/codex/install.sh -o "$script"
            sh "$script"
            rm "$script"
        fi
    fi
fi
if [[ $phase == all || $phase == config ]]; then
    run_phase python3 "$root/mac/bootstrap/configure.py" "${flags[@]}"
    if $apply; then python3 "$root/mac/bootstrap/user-config.py" --apply
    else python3 "$root/mac/bootstrap/user-config.py"; fi
fi
if [[ $phase == all || $phase == desktop ]]; then
    run_phase bash "$root/mac/bootstrap/desktop.sh" "${desktop_flags[@]}"
fi
if [[ $phase == all || $phase == preferences ]]; then
    if $apply; then run_phase python3 "$root/mac/bootstrap/preferences.py" --apply
    else run_phase python3 "$root/mac/bootstrap/preferences.py"; fi
fi
if [[ $phase == all || $phase == herdr ]]; then
    if $apply; then run_phase bash "$root/mac/bootstrap/herdr.sh" --apply
    else run_phase bash "$root/mac/bootstrap/herdr.sh"; fi
fi
if [[ $phase == verify || ( $phase == all && $apply == true ) ]]; then
    run_phase bash "$root/mac/bootstrap/verify.sh"
fi
echo 'Manual checklist: mac/SETUP.md. Restart/login may be needed for macOS preferences.'
[[ $pending == 0 ]] || { echo 'Setup has pending manual steps; complete them and rerun the relevant phase.'; exit 3; }
