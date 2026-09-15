#!/bin/bash
# Optional desktop phase. Exit 3 means manual action is pending; 1 means failure.
set -euo pipefail
apply=false
onboarded=false
for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --dry-run) apply=false ;;
    --onboarding-complete) onboarded=true ;;
    -h|--help) echo 'Usage: desktop.sh [--dry-run|--apply] [--onboarding-complete]'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done
[[ $(uname -s) == Darwin ]] || { echo 'Desktop bootstrap requires macOS.' >&2; exit 1; }
pending() { echo "PENDING: $*"; exit 3; }
fail() { echo "ERROR: $*" >&2; exit 1; }
app=/Applications/RiceKit.app
ricekit="$app/Contents/MacOS/ricekit"
if ! $apply; then
  echo 'Plan: install RiceKit only if absent; verify official signature, notarization and Gatekeeper.'
  echo 'Plan: launch AeroSpace/RiceKit; onboarding and Accessibility permission require manual completion.'
  echo 'Plan: after --onboarding-complete, preserve current theme (default catppuccin-mocha), enable six integrations and render.'
  echo 'Plan: validate generated scripts, start SketchyBar and corrected custom JankyBorders LaunchAgent; verify services.'
  exit 0
fi
command -v brew >/dev/null || fail 'Install Brewfile dependencies first.'
command -v jq >/dev/null || fail 'Install jq first.'
if [[ ! -e "$app" && ! -L "$app" ]]; then
  scratch=$(mktemp -d "${TMPDIR:-/tmp}/ricekit-bootstrap.XXXXXX")
  mounted=false
  cleanup() {
    if $mounted; then hdiutil detach "$scratch/mount" >/dev/null || true; fi
    rm -rf "$scratch"
  }
  trap cleanup EXIT
  curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
    https://download.ricekit.app/latest -o "$scratch/RiceKit.dmg"
  mkdir "$scratch/mount"
  hdiutil attach -readonly -nobrowse -mountpoint "$scratch/mount" "$scratch/RiceKit.dmg" >/dev/null
  mounted=true
  candidate="$scratch/mount/RiceKit.app"
  [[ -d "$candidate" ]] || fail 'Official disk image has no RiceKit.app.'
  codesign --verify --deep --strict "$candidate"
  identity=$(codesign -dv --verbose=2 "$candidate" 2>&1)
  grep -qx 'Identifier=com.ricekit.app' <<< "$identity" || fail 'Unexpected RiceKit bundle identifier.'
  grep -qx 'TeamIdentifier=D9RL5KV998' <<< "$identity" || fail 'Unexpected RiceKit signing team.'
  xcrun stapler validate "$candidate"
  spctl --assess --type execute --verbose=2 "$candidate"
  [[ -w /Applications ]] || pending 'Install the verified RiceKit download in /Applications with administrator authorization, then rerun.'
  [[ ! -e "$app" && ! -L "$app" ]] || fail 'RiceKit appeared during download; refusing to overwrite it.'
  ditto "$candidate" "$app"
  hdiutil detach "$scratch/mount" >/dev/null
  mounted=false
  cleanup
  trap - EXIT
fi
[[ -x "$ricekit" ]] || fail 'Existing RiceKit app is incomplete; preserved without replacement.'
[[ -d /Applications/AeroSpace.app ]] || pending 'Install AeroSpace from the Brewfile first.'
open /Applications/AeroSpace.app
if ! $onboarded; then
  open "$app"
  pending 'Complete RiceKit onboarding/license or trial and AeroSpace Accessibility permission, then rerun with --apply --onboarding-complete. No RiceKit CLI was invoked; its first call can activate the trial.'
fi
# Only the explicit onboarding flag allows CLI calls that can initialize licensing.
current=$("$ricekit" current --json)
jq -e 'type == "object" and (.theme == null or (.theme | type == "string")) and (.active_configs | type == "array")' <<< "$current" >/dev/null || fail 'Unrecognized RiceKit current JSON; refusing to guess the active theme.'
theme=$(jq -r '.theme // "catppuccin-mocha" | if . == "" then "catppuccin-mocha" else . end' <<< "$current")
installed=$("$ricekit" config list --json)
jq -e 'type == "array" and all(.[]; .name | type == "string")' <<< "$installed" >/dev/null || fail 'Unrecognized RiceKit config list JSON.'
for config in sketchybar-colors jankyborders-colors wezterm-colors wezterm-config neovim-colors starship-prompt; do
  if ! jq -e --arg name "$config" 'any(.[]; .name == $name)' <<< "$installed" >/dev/null; then
    case "$config" in
      jankyborders-colors|starship-prompt) pending "Stow the repository RiceKit custom config $config first." ;;
      *) "$ricekit" marketplace install "$config" ;;
    esac
  fi
  if ! jq -e --arg name "$config" '.active_configs | index($name) != null' <<< "$current" >/dev/null; then
    "$ricekit" config enable "$config"
  fi
done
echo "Applying RiceKit theme: $theme"
"$ricekit" apply "$theme"
for script in "$HOME/.config/sketchybar/colors.sh" "$HOME/.config/sketchybar/sketchybarrc" "$HOME/.config/borders/borders.sh"; do
  [[ -f "$script" ]] || fail "Missing generated desktop script: $script; services were not started."
  bash -n "$script" || fail "Invalid desktop script: $script; services were not started."
done
plist="$HOME/Library/LaunchAgents/com.user.jankyborders.plist"
[[ -f "$plist" ]] || pending 'Stow the corrected JankyBorders LaunchAgent first.'
plutil -lint "$plist" >/dev/null
[[ $(/usr/libexec/PlistBuddy -c 'Print :Label' "$plist") == com.user.jankyborders ]] || fail 'Unexpected border LaunchAgent label.'
[[ $(/usr/libexec/PlistBuddy -c 'Print :AbandonProcessGroup' "$plist") == true ]] || pending 'Update JankyBorders LaunchAgent to include AbandonProcessGroup=true.'
brew services start FelixKratz/formulae/sketchybar
# Avoid two login mechanisms competing for the same borders process.
if launchctl print "gui/$(id -u)/homebrew.mxcl.borders" >/dev/null 2>&1; then
  brew services stop FelixKratz/formulae/borders
fi
job="gui/$(id -u)/com.user.jankyborders"
if launchctl print "$job" >/dev/null 2>&1; then
  # Reload the exact job so a previously loaded plist gains AbandonProcessGroup.
  launchctl bootout "$job"
fi
launchctl bootstrap "gui/$(id -u)" "$plist"
# A RiceKit reload can leave a short-lived child: launchd owns the final startup.
launchctl kickstart -k "$job"
sleep 1
pgrep -x borders >/dev/null || fail 'JankyBorders is not running; inspect /tmp/jankyborders.err.log.'
sketchybar --query bar >/dev/null || fail 'SketchyBar did not respond.'
aerospace list-workspaces --all >/dev/null || pending 'Allow AeroSpace Accessibility permission and restart it; workspace query failed.'
echo 'Desktop theme and services verified. Confirm the visual result in WezTerm and on the desktop.'
