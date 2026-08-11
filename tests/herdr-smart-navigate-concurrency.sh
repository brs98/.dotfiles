#!/usr/bin/env bash
set -euo pipefail

if [[ "${HERDR_SMART_NAVIGATE_TEST_FAKE:-}" == 1 ]]; then
  state_dir="${HERDR_SMART_NAVIGATE_TEST_STATE:?}"

  if [[ "${1:-}" == pane && "${2:-}" == current && "${3:-}" == --current ]]; then
    if [[ -f "$state_dir/block" ]]; then
      printf '%s\n' "$$" >"$state_dir/child-pid"
      touch "$state_dir/entered"
      while [[ ! -f "$state_dir/release" ]]; do
        sleep 0.01
      done
    else
      marker="$state_dir/active.$$"
      mkdir "$marker"
      active_count=0
      for active in "$state_dir"/active.*; do
        [[ -d "$active" ]] || continue
        active_count=$((active_count + 1))
      done
      if (( active_count > 1 )); then
        touch "$state_dir/overlap"
      fi
      touch "$state_dir/visited.$$"
      sleep 0.05
      rmdir "$marker"
    fi

    printf '{"result":{"pane":{}}}\n'
    exit 0
  fi

  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$repo_root/shared/stow/scripts/.local/bin/herdr-smart-navigate"
test_root="$(mktemp -d "$repo_root/.tmp-herdr-smart-navigate.XXXXXX")"
holder_pid=""
child_pid=""

cleanup() {
  [[ -z "$holder_pid" ]] || kill -9 "$holder_pid" 2>/dev/null || true
  [[ -z "$child_pid" ]] || kill -9 "$child_pid" 2>/dev/null || true
  rm -rf "$test_root"
}
trap cleanup EXIT

touch "$test_root/block"
env \
  HERDR_BIN_PATH="$0" \
  HERDR_SMART_NAVIGATE_TEST_FAKE=1 \
  HERDR_SMART_NAVIGATE_TEST_STATE="$test_root" \
  HERDR_SOCKET_PATH="concurrency-regression" \
  TMPDIR="$test_root" \
  "$helper" right &
holder_pid=$!

for _ in {1..500}; do
  [[ -f "$test_root/entered" ]] && break
  sleep 0.01
done
[[ -f "$test_root/entered" ]] || {
  printf 'holder did not enter the Herdr executable\n' >&2
  exit 1
}

child_pid="$(<"$test_root/child-pid")"
kill -9 "$holder_pid" 2>/dev/null || true
kill -9 "$child_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
holder_pid=""
child_pid=""
rm -f "$test_root/block" "$test_root/entered" "$test_root/child-pid"

pids=()
invocation_count=24
for ((invocation = 0; invocation < invocation_count; invocation++)); do
  (
    while [[ ! -f "$test_root/go" ]]; do
      sleep 0.001
    done
    exec env \
      HERDR_BIN_PATH="$0" \
      HERDR_SMART_NAVIGATE_TEST_FAKE=1 \
      HERDR_SMART_NAVIGATE_TEST_STATE="$test_root" \
      HERDR_SOCKET_PATH="concurrency-regression" \
      TMPDIR="$test_root" \
      "$helper" right
  ) &
  pids+=("$!")
done
touch "$test_root/go"

result=0
for pid in "${pids[@]}"; do
  wait "$pid" || result=1
done

if [[ -f "$test_root/overlap" ]]; then
  printf 'concurrent helper invocations entered Herdr simultaneously\n' >&2
  exit 1
fi

visited_count=0
for visited in "$test_root"/visited.*; do
  [[ -f "$visited" ]] || continue
  visited_count=$((visited_count + 1))
done
if (( visited_count != invocation_count )); then
  printf 'expected %s completed navigations, got %s\n' "$invocation_count" "$visited_count" >&2
  exit 1
fi

exit "$result"
