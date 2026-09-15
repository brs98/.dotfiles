#!/bin/bash
# Toggle the shared WezTerm override: fully opaque or configured base opacity.
set -euo pipefail

state_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state_file="$state_dir/wezterm-fullscreen-state.lua"
opaque=true
if [[ -f "$state_file" ]] && grep -Eq 'opaque[[:space:]]*=[[:space:]]*true' "$state_file"; then
    opaque=false
fi

temporary=$(mktemp "$state_file.XXXXXX")
trap 'rm -f "$temporary"' EXIT
printf 'return { opaque = %s }\n' "$opaque" > "$temporary"
mv -f "$temporary" "$state_file"
