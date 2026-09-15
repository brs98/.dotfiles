#!/bin/bash
# Read-only checks; never launch apps, start a trial or restart user sessions.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
pending=0
check() { if "$@" >/dev/null 2>&1; then echo "OK: $*"; else echo "PENDING: $*"; pending=1; fi; }
for cmd in brew codex gh stow starship zoxide eza bat lazygit nvim diffnav tv tmux bun bunx fzf fd tree-sitter delta jq just; do
    check command -v "$cmd"
done
check zsh -n "$HOME/.zshrc"
check /Applications/WezTerm.app/Contents/MacOS/wezterm --config-file "$HOME/.wezterm.lua" show-keys --lua
check codex features list
check gh auth status
check codex login status
check herdr config check
check aerospace list-workspaces --all
check sketchybar --query bar
check pgrep -x borders
for app in Slack Discord DBeaver Bitwarden Spotify Raycast OrbStack 'Google Chrome' RiceKit AeroSpace WezTerm; do
    check test -d "/Applications/$app.app"
done
for file in "$HOME/.config/sketchybar/colors.sh" "$HOME/.config/borders/borders.sh" "$HOME/.config/starship.toml" "$HOME/.config/nvim/colors/ricekit.lua"; do
    check test -f "$file"
done
for dir in "$HOME/.config" "$HOME/.config/ricekit" "$HOME/.agents/skills" "$HOME/.local/share/nvim" "$HOME/Library/LaunchAgents"; do
    if [[ -L "$dir" || ! -d "$dir" ]]; then echo "PENDING: missing or unsafe mutable directory: $dir"; pending=1; fi
done
echo 'Manual verification still required: account sign-ins, Raycast shortcut/login, per-keyboard Caps Lock mapping, login after preferences, and external-display clamshell test.'
[[ $pending == 0 ]] || exit 3
