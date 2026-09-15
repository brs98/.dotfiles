#!/bin/bash
# AeroSpace's binding has already toggled fullscreen. Sync actual state rather
# than toggling a saved flag, which can drift after other fullscreen commands.
set -euo pipefail

window=$(aerospace list-windows --focused --format '%{app-bundle-id} %{window-is-fullscreen}')
case "$window" in
    'com.github.wez.wezterm true') opaque=true ;;
    'com.github.wez.wezterm false') opaque=false ;;
    *) exit 0 ;; # Other applications must not change WezTerm's opacity.
esac

# Installed beside the scripts, including when Stow symlinks this directory.
state_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state_file="$state_dir/wezterm-fullscreen-state.lua"
temporary=$(mktemp "$state_file.XXXXXX")
trap 'rm -f "$temporary"' EXIT
printf 'return { opaque = %s }\n' "$opaque" > "$temporary"
mv -f "$temporary" "$state_file"
