#!/bin/bash
# Synchronize the GameCube Card A repository. The Python entry point also manages
# individual save symlinks and the Rooms lock; systemd should invoke that wrapper.
set -Eeuo pipefail

SAVES_REPO="${RETROARCH_SAVES_REPO:-$HOME/.dotfiles/shared/symlink/retroarch/.config/retroarch/saves}"
CARD_A_DIR='dolphin-emu/User/GC/USA/Card A'
NETWORK_TIMEOUT="${RETROARCH_SYNC_NETWORK_TIMEOUT:-20}"
ERROR_FILE=''

fail() {
    local message="$1"
    printf 'Game save sync: %s\n' "$message" >&2
    # Log every failed attempt, but only notify once until the error changes.
    if [[ -n "$ERROR_FILE" ]] && [[ ! -f "$ERROR_FILE" || "$(cat "$ERROR_FILE")" != "$message" ]]; then
        printf '%s\n' "$message" > "$ERROR_FILE"
        if command -v notify-send >/dev/null 2>&1; then
            timeout 3s notify-send -a 'Game save sync' 'Game saves need attention' "$message" >/dev/null 2>&1 || true
        fi
    fi
    exit 1
}
trap 'fail "Unexpected failure at line $LINENO. Local saves have not been discarded; see the service journal."' ERR

emulator_running() {
    pgrep -x 'retroarch|dolphin-emu|dolphin-emu-qt2' >/dev/null
}
defer_for_emulator() {
    if emulator_running; then
        printf 'Game save sync: emulator running; deferring until it exits.\n'
        exit 0
    fi
}

[[ "$NETWORK_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || fail 'Network timeout must be a positive number of seconds.'
cd "$SAVES_REPO" || fail 'Save repository is missing.'
[[ "$(git rev-parse --show-toplevel)" == "$(pwd -P)" ]] || fail 'Configured saves path is not a repository root.'
GIT_DIR=$(git rev-parse --absolute-git-dir)
exec 9>"$GIT_DIR/retroarch-save-sync.lock"
flock -n 9 || exit 0
ERROR_FILE="$GIT_DIR/retroarch-save-sync-error"

[[ "$(git symbolic-ref --quiet --short HEAD || true)" == main ]] || fail 'Save repository must be on main; detached HEAD and other branches are left untouched.'
for operation in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
    [[ ! -e "$(git rev-parse --git-path "$operation")" ]] || fail 'A Git operation is in progress. Finish it before syncing saves.'
done
[[ -z "$(git ls-files --unmerged)" ]] || fail 'Resolve existing Git conflicts before syncing saves.'
# Never include someone else's staged work in an automatic save commit.
while IFS= read -r -d '' staged; do
    [[ "$staged" == "$CARD_A_DIR/"* ]] || fail 'Unrelated staged changes are present; save sync left the index untouched.'
done < <(git diff --cached --name-only -z)

defer_for_emulator
if [[ -n "$(git status --porcelain -- "$CARD_A_DIR")" ]]; then
    git add -A -- "$CARD_A_DIR"
    if ! git diff --cached --quiet; then
        git -c commit.gpgsign=false commit -m "Auto-backup GameCube saves on $(hostname) - $(date -Iseconds)"
    fi
fi
# A failed network attempt still leaves the save safely committed locally.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -oBatchMode=yes -oConnectTimeout=8 -oConnectionAttempts=1"
network_git() {
    timeout --signal=TERM --kill-after=5s "${NETWORK_TIMEOUT}s" git "$@"
}
network_git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main || fail 'Fetch failed; local save commits are safe and will retry automatically.'

if ! git merge-base --is-ancestor origin/main HEAD; then
    defer_for_emulator
    # Require a clean tree so aborting a conflict can always restore local HEAD.
    [[ -z "$(git status --porcelain)" ]] || fail 'Uncommitted files outside Card A prevent pulling; local save commits are safe.'
    # Binary saves must never receive a line-based merge, even in test fixtures.
    if ! git -c merge.default=binary -c commit.gpgsign=false merge --no-edit origin/main; then
        if [[ -e "$(git rev-parse --git-path MERGE_HEAD)" ]]; then
            git merge --abort || fail 'Merge abort failed. Stop and inspect the repository; both histories remain in Git.'
        fi
        fail 'The machines changed the same save. Local and remote commits are preserved; resolve the conflict manually before syncing.'
    fi
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    network_git push origin HEAD:refs/heads/main || fail 'Push failed; local save commits are safe and will retry automatically.'
fi
rm -f "$ERROR_FILE"
printf 'Game save sync: main is synchronized.\n'
