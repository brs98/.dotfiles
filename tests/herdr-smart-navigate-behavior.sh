#!/usr/bin/env bash
set -euo pipefail

if [[ "${HERDR_SMART_NAVIGATE_TEST_FAKE:-}" == 1 ]]; then
  state_dir="${HERDR_SMART_NAVIGATE_TEST_STATE:?}"

  read_state() {
    local name="$1"
    local value
    value="$(<"$state_dir/$name")"
    printf '%s\n' "$value"
  }

  pane_tab() {
    case "$1" in
      w-test:p1 | w-test:p2) printf 'w-test:t1\n' ;;
      w-test:p3 | w-test:p4 | w-test:p5) printf 'w-test:t2\n' ;;
      w-test:p6) printf 'w-test:t3\n' ;;
      *) return 1 ;;
    esac
  }

  tab_focus_file() {
    case "$1" in
      w-test:t1) printf '%s/focus-t1\n' "$state_dir" ;;
      w-test:t2) printf '%s/focus-t2\n' "$state_dir" ;;
      w-test:t3) printf '%s/focus-t3\n' "$state_dir" ;;
      *) return 1 ;;
    esac
  }

  set_focused_pane() {
    local pane_id="$1"
    local tab_id
    local focus_file
    tab_id="$(pane_tab "$pane_id")"
    focus_file="$(tab_focus_file "$tab_id")"
    printf '%s\n' "$pane_id" >"$focus_file"
  }

  printf '%s|%s\n' "${HERDR_SOCKET_PATH:-default}" "$*" >>"$state_dir/commands.log"

  if [[ "${1:-}" == pane && "${2:-}" == current ]]; then
    if [[ "${3:-}" == --current ]]; then
      pane_id="${HERDR_PANE_ID:?}"
      tab_id="$(pane_tab "$pane_id")"
    else
      tab_id="$(read_state active-tab)"
      pane_id="$(<"$(tab_focus_file "$tab_id")")"
    fi

    printf '{"result":{"pane":{"workspace_id":"w-test","tab_id":"%s","pane_id":"%s"}}}\n' \
      "$tab_id" "$pane_id"
    exit 0
  fi

  if [[ "${1:-}" == pane && "${2:-}" == focus && "${3:-}" == --direction && "${5:-}" == --pane ]]; then
    direction="$4"
    pane_id="$6"
    next_pane=""
    case "$direction:$pane_id" in
      right:w-test:p1) next_pane="w-test:p2" ;;
      right:w-test:p3) next_pane="w-test:p4" ;;
      right:w-test:p4) next_pane="w-test:p5" ;;
      left:w-test:p2) next_pane="w-test:p1" ;;
      left:w-test:p4) next_pane="w-test:p3" ;;
      left:w-test:p5) next_pane="w-test:p4" ;;
    esac

    if [[ -n "$next_pane" ]]; then
      set_focused_pane "$next_pane"
      printf '{"result":{"focus":{"changed":true,"focused_pane_id":"%s"}}}\n' "$next_pane"
    else
      printf '{"result":{"focus":{"changed":false,"focused_pane_id":"%s"}}}\n' "$pane_id"
    fi
    exit 0
  fi

  if [[ "${1:-}" == tab && "${2:-}" == list && "${3:-}" == --workspace && "${4:-}" == w-test ]]; then
    printf '%s\n' '{"result":{"tabs":[{"tab_id":"w-test:t1"},{"tab_id":"w-test:t2"},{"tab_id":"w-test:t3"}]}}'
    exit 0
  fi

  if [[ "${1:-}" == tab && "${2:-}" == focus ]]; then
    printf '%s\n' "$3" >"$state_dir/active-tab"
    printf '{"result":{"tab":{"tab_id":"%s"}}}\n' "$3"
    exit 0
  fi

  if [[ "${1:-}" == pane && "${2:-}" == list && "${3:-}" == --workspace && "${4:-}" == w-test ]]; then
    focus_t1="$(read_state focus-t1)"
    focus_t2="$(read_state focus-t2)"
    focus_t3="$(read_state focus-t3)"
    jq -cn \
      --arg focus_t1 "$focus_t1" \
      --arg focus_t2 "$focus_t2" \
      --arg focus_t3 "$focus_t3" \
      '{result:{panes:[
        {tab_id:"w-test:t1",pane_id:"w-test:p1",focused:($focus_t1 == "w-test:p1")},
        {tab_id:"w-test:t1",pane_id:"w-test:p2",focused:($focus_t1 == "w-test:p2")},
        {tab_id:"w-test:t2",pane_id:"w-test:p3",focused:($focus_t2 == "w-test:p3")},
        {tab_id:"w-test:t2",pane_id:"w-test:p4",focused:($focus_t2 == "w-test:p4")},
        {tab_id:"w-test:t2",pane_id:"w-test:p5",focused:($focus_t2 == "w-test:p5")},
        {tab_id:"w-test:t3",pane_id:"w-test:p6",focused:($focus_t3 == "w-test:p6")}
      ]}}'
    exit 0
  fi

  printf 'unexpected fake Herdr command: %s\n' "$*" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fake_herdr="$repo_root/tests/herdr-smart-navigate-behavior.sh"
helper="$repo_root/shared/stow/scripts/.local/bin/herdr-smart-navigate"
config="$repo_root/shared/stow/herdr/.config/herdr/config.toml"
test_root="$(mktemp -d "$repo_root/.tmp-herdr-smart-navigate-behavior.XXXXXX")"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

new_case() {
  local name="$1"
  case_dir="$test_root/$name"
  mkdir -p "$case_dir"
  printf 'w-test:t1\n' >"$case_dir/active-tab"
  printf 'w-test:p1\n' >"$case_dir/focus-t1"
  printf 'w-test:p4\n' >"$case_dir/focus-t2"
  printf 'w-test:p6\n' >"$case_dir/focus-t3"
  : >"$case_dir/commands.log"
}

invoke_helper() {
  local direction="$1"
  local origin_pane="$2"
  local socket_path="${3:-}"

  if [[ -n "$socket_path" ]]; then
    env \
      HERDR_BIN_PATH="$fake_herdr" \
      HERDR_PANE_ID="$origin_pane" \
      HERDR_SMART_NAVIGATE_TEST_FAKE=1 \
      HERDR_SMART_NAVIGATE_TEST_STATE="$case_dir" \
      HERDR_SOCKET_PATH="$socket_path" \
      TMPDIR="$case_dir" \
      "$helper" "$direction"
  else
    env -u HERDR_SOCKET_PATH \
      HERDR_BIN_PATH="$fake_herdr" \
      HERDR_PANE_ID="$origin_pane" \
      HERDR_SMART_NAVIGATE_TEST_FAKE=1 \
      HERDR_SMART_NAVIGATE_TEST_STATE="$case_dir" \
      TMPDIR="$case_dir" \
      "$helper" "$direction"
  fi
}

assert_state() {
  local expected_tab="$1"
  local expected_pane="$2"
  local actual_tab
  local actual_pane
  local focus_file
  actual_tab="$(<"$case_dir/active-tab")"
  case "$actual_tab" in
    w-test:t1) focus_file="$case_dir/focus-t1" ;;
    w-test:t2) focus_file="$case_dir/focus-t2" ;;
    w-test:t3) focus_file="$case_dir/focus-t3" ;;
    *) printf 'unexpected active tab: %s\n' "$actual_tab" >&2; exit 1 ;;
  esac
  actual_pane="$(<"$focus_file")"

  if [[ "$actual_tab" != "$expected_tab" || "$actual_pane" != "$expected_pane" ]]; then
    printf 'expected focus %s/%s, got %s/%s\n' \
      "$expected_tab" "$expected_pane" "$actual_tab" "$actual_pane" >&2
    exit 1
  fi
}

assert_session_routing() {
  local expected_socket="$1"
  if awk -F '|' -v expected="$expected_socket" '$1 != expected { exit 1 }' "$case_dir/commands.log"; then
    return
  fi
  printf 'one or more Herdr calls escaped session %s\n' "$expected_socket" >&2
  exit 1
}

python3 - "$config" <<'PY'
import pathlib
import sys
import tomllib

config = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())
keys = config["keys"]
assert keys["focus_pane_left"] == ""
assert keys["focus_pane_right"] == ""

commands = {
    (entry["key"], entry["type"], entry["command"])
    for entry in keys["command"]
}
expected = {
    ("prefix+h", "shell", "$HOME/.local/bin/herdr-smart-navigate left"),
    ("prefix+l", "shell", "$HOME/.local/bin/herdr-smart-navigate right"),
    ("alt+left", "shell", "$HOME/.local/bin/herdr-smart-navigate left"),
    ("alt+right", "shell", "$HOME/.local/bin/herdr-smart-navigate right"),
}
assert commands == expected
PY

printf 'CONFIG  prefix+h/prefix+l and direct alt+left/alt+right -> smart navigator\n'

new_case pane-first
invoke_helper right w-test:p1
assert_state w-test:t1 w-test:p2
assert_session_routing default
printf 'DEFAULT pane-first: t1/p1 --right--> t1/p2\n'

new_case named-next-edge
printf 'w-test:p2\n' >"$case_dir/focus-t1"
invoke_helper right w-test:p2 team-alpha
assert_state w-test:t2 w-test:p3
assert_session_routing team-alpha
printf 'NAMED   next+edge:  t1/p2 --right--> t2/p3 (leftmost)\n'

new_case previous-edge
printf 'w-test:t2\n' >"$case_dir/active-tab"
printf 'w-test:p3\n' >"$case_dir/focus-t2"
invoke_helper left w-test:p3
assert_state w-test:t1 w-test:p2
assert_session_routing default
printf 'DEFAULT prev+edge:  t2/p3 --left-->  t1/p2 (rightmost)\n'

new_case modulo-left
invoke_helper left w-test:p1
assert_state w-test:t3 w-test:p6
assert_session_routing default
printf 'DEFAULT modulo-left:  t1/p1 --left-->  t3/p6\n'

new_case modulo-right
printf 'w-test:t3\n' >"$case_dir/active-tab"
invoke_helper right w-test:p6
assert_state w-test:t1 w-test:p1
assert_session_routing default
printf 'DEFAULT modulo-right: t3/p6 --right--> t1/p1\n'

new_case rapid-repeat
invoke_helper right w-test:p1 repeat-session &
first_pid=$!
invoke_helper right w-test:p1 repeat-session &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
assert_state w-test:t2 w-test:p3
assert_session_routing repeat-session
printf 'RAPID   repeat x2: t1/p1 --right,right--> t2/p3 (both presses applied)\n'
