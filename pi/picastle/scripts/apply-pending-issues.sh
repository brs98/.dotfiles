#!/usr/bin/env bash
# Apply Picastle-surfaced issue/comment intents to the selected pebbles DB.

set -uo pipefail

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "apply-pending-issues: not inside a git repo" >&2
  exit 0
fi
cd "$(git rev-parse --show-toplevel)"

if ! command -v peb >/dev/null 2>&1; then
  echo "apply-pending-issues: peb CLI not found on PATH — skipping" >&2
  exit 0
fi

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

read_jsonl_lines() {
  local file="$1"
  out=()
  [ -s "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    out+=("$line")
  done < "$file"
}

apply_issues_in() {
  local dir="$1"
  local manifest="$dir/.picastle/pending-issues.jsonl"
  local failed="$dir/.picastle/pending-issues.failed.jsonl"
  [ -s "$manifest" ] || return 0

  local out=()
  read_jsonl_lines "$manifest"
  local lines=("${out[@]}")
  echo "==> $manifest: applying ${#lines[@]} pending issue(s)"

  local created=0 failed_count=0
  for line in "${lines[@]}"; do
    local title description type priority labels_args status
    title=$(printf '%s' "$line" | jq -r '.title // ""')
    description=$(printf '%s' "$line" | jq -r '.description // ""')
    type=$(printf '%s' "$line" | jq -r '.type // "feature"')
    priority=$(printf '%s' "$line" | jq -r '.priority // 2')
    status=$(printf '%s' "$line" | jq -r --arg fallback "${PICASTLE_PENDING_STATUS:-needs_triage}" '.status // $fallback')
    labels_args=$(printf '%s' "$line" | jq -r '.labels // [] | join(",")')

    if [ -z "$title" ]; then
      printf '%s\n' "$line" >> "$failed"
      failed_count=$((failed_count + 1))
      echo "  ✗ skipped: missing title"
      continue
    fi

    if peb_cmd create "$title" \
      ${description:+--description "$description"} \
      -t "$type" \
      -s "$status" \
      -p "$priority" \
      ${labels_args:+-l "$labels_args"} \
      >/dev/null; then
      created=$((created + 1))
      echo "  ✓ created: $title"
    else
      printf '%s\n' "$line" >> "$failed"
      failed_count=$((failed_count + 1))
      echo "  ✗ failed: $title"
    fi
  done

  : > "$manifest"
  echo "    $created created, $failed_count failed"
  [ "$failed_count" -gt 0 ] && echo "    failed lines preserved in $failed"
}

apply_comments_in() {
  local dir="$1"
  local manifest="$dir/.picastle/pending-comments.jsonl"
  local failed="$dir/.picastle/pending-comments.failed.jsonl"
  [ -s "$manifest" ] || return 0

  local out=()
  read_jsonl_lines "$manifest"
  local lines=("${out[@]}")
  echo "==> $manifest: applying ${#lines[@]} pending comment(s)"

  local added=0 failed_count=0
  for line in "${lines[@]}"; do
    local id body
    id=$(printf '%s' "$line" | jq -r '.id // ""')
    body=$(printf '%s' "$line" | jq -r '.body // ""')

    if [ -z "$id" ] || [ -z "$body" ]; then
      printf '%s\n' "$line" >> "$failed"
      failed_count=$((failed_count + 1))
      echo "  ✗ skipped: missing id or body"
      continue
    fi

    if peb_cmd comment add "$id" "$body" >/dev/null; then
      added=$((added + 1))
      echo "  ✓ commented on $id"
    else
      printf '%s\n' "$line" >> "$failed"
      failed_count=$((failed_count + 1))
      echo "  ✗ failed: $id"
    fi
  done

  : > "$manifest"
  echo "    $added applied, $failed_count failed"
  [ "$failed_count" -gt 0 ] && echo "    failed lines preserved in $failed"
}

dirs=(".")
if [ -n "${PICASTLE_RUNTIME_DIR:-}" ] && [ -d "$PICASTLE_RUNTIME_DIR/worktrees" ]; then
  while IFS= read -r wt_path; do
    [ -z "$wt_path" ] && continue
    dirs+=("$wt_path")
  done < <(find "$PICASTLE_RUNTIME_DIR/worktrees" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null || true)
else
  while IFS= read -r wt_path; do
    [ -z "$wt_path" ] && continue
    dirs+=("$wt_path")
  done < <(git worktree list --porcelain | awk '/^worktree/{print $2}' | grep '/picastle/.*/worktrees/' || true)
fi

for dir in "${dirs[@]}"; do
  apply_issues_in "$dir"
  apply_comments_in "$dir"
done
