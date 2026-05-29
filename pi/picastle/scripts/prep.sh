#!/usr/bin/env bash
# Picastle pre-run audit. Warns about stale host-worktree state, never blocks.

set -uo pipefail

# Accept the same repo flags as main.mts, enough for prep to run from anywhere.
REPO=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo|-C)
      REPO="$2"
      shift 2
      ;;
    --repo=*)
      REPO="${1#--repo=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [ -n "$REPO" ]; then
  cd "$REPO" || exit 0
fi

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "==> picastle-prep: not inside a git repo; main will fail"
  exit 0
fi
cd "$(git rev-parse --show-toplevel)"

WARNINGS=0
warn() {
  printf '  ⚠ %s\n' "$1"
  WARNINGS=$((WARNINGS + 1))
}

echo "==> picastle-prep: auditing local state"

BASE_BRANCH="${PICASTLE_BASE_BRANCH:-main}"

PEB_BASE=(peb)
if [ -n "${PICASTLE_PEB_ARGS:-}" ]; then
  read -r -a _picastle_peb_extra <<< "$PICASTLE_PEB_ARGS"
  PEB_BASE+=("${_picastle_peb_extra[@]}")
fi
if [ -n "${PICASTLE_PEB_REMOTE:-}" ]; then
  PEB_BASE+=(--remote "$PICASTLE_PEB_REMOTE")
fi
if [ -n "${PICASTLE_PEB_REPO:-}" ]; then
  PEB_BASE+=(-R "$PICASTLE_PEB_REPO")
fi

peb_cmd() {
  "${PEB_BASE[@]}" "$@"
}

if ! command -v peb >/dev/null 2>&1; then
  warn "peb CLI not found on host PATH — planner will fail"
elif [ -n "${PICASTLE_PEB_REMOTE:-}${PICASTLE_PEB_REPO:-}${PICASTLE_PEB_ARGS:-}" ]; then
  if ! peb_cmd list --json >/dev/null 2>&1; then
    warn "remote/configured peb command failed — check PICASTLE_PEB_REMOTE/PICASTLE_PEB_REPO/PICASTLE_PEB_ARGS"
  fi
elif ! peb where >/dev/null 2>&1; then
  warn "peb workspace not found from current directory — planner will fail"
fi

if [ ! -f pebbles-policy.json ]; then
  warn "pebbles-policy.json not found — Picastle will default to ready_for_agent / needs_triage statuses"
fi

if ! command -v gh >/dev/null 2>&1; then
  warn "GitHub CLI not found on PATH — PR creation will fail"
elif ! gh auth status >/dev/null 2>&1; then
  warn "gh is not authenticated — run gh auth login"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! node -e "import('@earendil-works/pi-coding-agent')" >/dev/null 2>&1; then
  if ! node -e "import('$SCRIPT_DIR/node_modules/@earendil-works/pi-coding-agent/dist/index.js')" >/dev/null 2>&1; then
    warn "@earendil-works/pi-coding-agent is not installed — run npm --prefix $SCRIPT_DIR install"
  fi
fi

extract_pebbles_id() {
  printf '%s' "$1" | sed -n 's|picastle/\([a-z0-9_]*-[a-z0-9]\{3,\}\)-.*|\1|p'
}

issue_status() {
  local id="$1"
  peb_cmd show "$id" --json 2>/dev/null | jq -r '.data.status // "unknown"' 2>/dev/null || echo "unknown"
}

for branch in $(git for-each-ref --format='%(refname:short)' refs/heads/picastle/*); do
  if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
    continue
  fi
  ahead=$(git rev-list --count "$BASE_BRANCH..$branch" 2>/dev/null || echo 0)
  [ "$ahead" -le 0 ] && continue
  issue=$(extract_pebbles_id "$branch")
  if [ -z "$issue" ]; then
    warn "branch $branch has $ahead unpushed commit(s) but doesn't match picastle/<pebbles-id>-*"
    continue
  fi
  state=$(issue_status "$issue")
  warn "branch $branch has $ahead unpushed commit(s) for issue $issue (state: $state)"
  warn "  → recover: git push -u origin $branch && gh pr create"
done

while IFS= read -r wt_path; do
  [ -z "$wt_path" ] && continue
  if [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
    branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
    warn "worktree $wt_path (branch $branch) has uncommitted changes"
    warn "  → recover: git -C $wt_path checkout -- . && git -C $wt_path clean -fd"
  fi
done < <(git worktree list --porcelain | awk '/^worktree/{print $2}' | grep '/picastle/.*/worktrees/' || true)

while IFS= read -r wt_path; do
  [ -z "$wt_path" ] && continue
  branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  issue=$(extract_pebbles_id "$branch")
  [ -z "$issue" ] && continue
  if command -v peb >/dev/null 2>&1 && [ "$(issue_status "$issue")" = "closed" ]; then
    warn "worktree $wt_path is for closed issue $issue"
    warn "  → recover: git worktree remove --force $wt_path"
  fi
done < <(git worktree list --porcelain | awk '/^worktree/{print $2}' | grep '/picastle/.*/worktrees/' || true)

if [ "$WARNINGS" -eq 0 ]; then
  echo "==> picastle-prep: clean"
else
  echo "==> picastle-prep: $WARNINGS warning(s); Picastle will continue regardless"
fi

exit 0
