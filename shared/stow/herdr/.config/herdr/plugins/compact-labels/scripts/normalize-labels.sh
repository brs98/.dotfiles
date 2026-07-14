#!/bin/sh

set -eu

herdr_bin=${HERDR_BIN_PATH:-herdr}
dry_run=${HERDR_COMPACT_LABELS_DRY_RUN:-0}
state_dir=${HERDR_PLUGIN_STATE_DIR:-"${TMPDIR:-/tmp}/herdr-compact-labels-${USER:-user}"}
lock_dir="$state_dir/normalize.lock"

if ! command -v jq >/dev/null 2>&1; then
	echo "compact-labels: jq is required" >&2
	exit 1
fi

mkdir -p "$state_dir"
if ! mkdir "$lock_dir" 2>/dev/null; then
	exit 0
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT HUP INT TERM

# Several lifecycle events can describe one UI operation. Let the first hook
# wait until the operation settles; concurrent hooks exit on the lock above.
sleep "${HERDR_COMPACT_LABELS_DEBOUNCE_SECONDS:-0.15}"

trim_and_collapse() {
	awk '{$1=$1; print}'
}

workspace_base() {
	printf '%s\n' "$1" |
		sed -E 's/^[[:space:]]*[0-9]+([[:space:]]+|$)//; s/^[WP]([[:space:]]*(·|-|:)[[:space:]]*|[[:space:]]+)//' |
		trim_and_collapse
}

tab_base() {
	base=$(printf '%s\n' "$1" |
		sed -E 's/^[[:space:]]*[0-9]+([[:space:]]+|$)//; s/^[Aa][Gg][Ee][Nn][Tt]([[:space:]]*(·|-|:)[[:space:]]*|[[:space:]]+|$)//' |
		trim_and_collapse)

	case "$base" in
		"" | *[!0-9]*) printf '%s\n' "$base" ;;
		*) printf '\n' ;;
	esac
}

agent_base() {
	printf '%s\n' "$1" |
		sed -E 's/^[[:space:]]*[0-9]+([[:space:]]+|$)//' |
		trim_and_collapse
}

directory_class() {
	case "$1" in
		"$HOME/work" | "$HOME/work/"*) printf 'W\n' ;;
		"$HOME/personal" | "$HOME/personal/"*) printf 'P\n' ;;
		*) printf '\n' ;;
	esac
}

directory_name() {
	cwd=$1
	if [ -n "$cwd" ]; then
		common_dir=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
		if [ -n "$common_dir" ]; then
			common_name=${common_dir%/}
			common_name=${common_name##*/}
			if [ "$common_name" = ".git" ]; then
				top_level=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)
				if [ -n "$top_level" ]; then
					printf '%s\n' "${top_level##*/}"
					return
				fi
			else
				printf '%s\n' "${common_name%.git}"
				return
			fi
		fi

		cwd=${cwd%/}
		printf '%s\n' "${cwd##*/}"
		return
	fi

	printf '\n'
}

use_directory_name() {
	lower=$(printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]')
	case "$lower" in
		"" | main | master | work | personal | workspace | space) return 0 ;;
		*) return 1 ;;
	esac
}

rename_workspace() {
	id=$1
	current=$2
	desired=$3
	[ "$current" = "$desired" ] && return

	if [ "$dry_run" = 1 ]; then
		printf 'workspace %s: %s -> %s\n' "$id" "$current" "$desired"
	else
		"$herdr_bin" workspace rename "$id" "$desired" >/dev/null
	fi
}

rename_tab() {
	id=$1
	current=$2
	desired=$3
	[ "$current" = "$desired" ] && return

	if [ "$dry_run" = 1 ]; then
		printf 'tab %s: %s -> %s\n' "$id" "$current" "$desired"
	else
		"$herdr_bin" tab rename "$id" "$desired" >/dev/null
	fi
}

rename_agent() {
	id=$1
	current=$2
	desired=$3
	[ "$current" = "$desired" ] && return

	if [ "$dry_run" = 1 ]; then
		printf 'agent %s: %s -> %s\n' "$id" "$current" "$desired"
	else
		"$herdr_bin" agent rename "$id" "$desired" >/dev/null
	fi
}

workspaces=$("$herdr_bin" workspace list)
workspace_count=$(printf '%s\n' "$workspaces" | jq '.result.workspaces | length')
workspace_index=1

while [ "$workspace_index" -le "$workspace_count" ]; do
	record=$(printf '%s\n' "$workspaces" | jq -c --argjson index "$((workspace_index - 1))" '.result.workspaces[$index]')
	workspace_id=$(printf '%s\n' "$record" | jq -r '.workspace_id')
	current_label=$(printf '%s\n' "$record" | jq -r '.label // ""')
	panes=$("$herdr_bin" pane list --workspace "$workspace_id")
	cwd=$(printf '%s\n' "$panes" | jq -r '[.result.panes[] | select((.foreground_cwd // .cwd // "") != "")][0] | (.foreground_cwd // .cwd // "")')
	base=$(workspace_base "$current_label")
	if use_directory_name "$base"; then
		base=$(directory_name "$cwd")
	fi
	class=$(directory_class "$cwd")

	if [ -n "$class" ] && [ -n "$base" ]; then
		desired_label="$workspace_index $class $base"
	elif [ -n "$base" ]; then
		desired_label="$workspace_index $base"
	else
		desired_label="$workspace_index"
	fi
	rename_workspace "$workspace_id" "$current_label" "$desired_label"

	tabs=$("$herdr_bin" tab list --workspace "$workspace_id")
	tab_count=$(printf '%s\n' "$tabs" | jq '.result.tabs | length')
	tab_index=1
	while [ "$tab_index" -le "$tab_count" ]; do
		tab_record=$(printf '%s\n' "$tabs" | jq -c --argjson index "$((tab_index - 1))" '.result.tabs[$index]')
		tab_id=$(printf '%s\n' "$tab_record" | jq -r '.tab_id')
		current_tab_label=$(printf '%s\n' "$tab_record" | jq -r '.label // ""')
		base=$(tab_base "$current_tab_label")
		if [ -n "$base" ]; then
			desired_tab_label="$tab_index $base"
		else
			desired_tab_label="$tab_index"
		fi
		rename_tab "$tab_id" "$current_tab_label" "$desired_tab_label"
		tab_index=$((tab_index + 1))
	done

	workspace_index=$((workspace_index + 1))
done

agents=$("$herdr_bin" agent list)
agent_count=$(printf '%s\n' "$agents" | jq '.result.agents | length')
agent_index=1

while [ "$agent_index" -le "$agent_count" ]; do
	record=$(printf '%s\n' "$agents" | jq -c --argjson index "$((agent_index - 1))" '.result.agents[$index]')
	terminal_id=$(printf '%s\n' "$record" | jq -r '.terminal_id')
	current_name=$(printf '%s\n' "$record" | jq -r '.name // ""')
	base=$(agent_base "$current_name")
	if [ -n "$base" ]; then
		desired_name="$agent_index $base"
	else
		desired_name="$agent_index"
	fi
	rename_agent "$terminal_id" "$current_name" "$desired_name"
	agent_index=$((agent_index + 1))
done
