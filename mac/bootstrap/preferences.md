# Mac preferences

Preview Brandon's requested settings as the logged-in user:

```sh
python3 mac/bootstrap/preferences.py
```

Apply them with `python3 mac/bootstrap/preferences.py --apply`. Do not run the
whole script through sudo: user preferences belong to your login account. Only
pending `pmset` commands request administrator authentication. Use `--skip-power`
if you want to configure power settings later; the script reports that phase as
pending. `--dry-run` is an explicit alias for the default preview.

The script compares existing values before writing, then verifies stored values
after application. Rerunning on the configured Mac produces no writes. It uses
`defaults` through macOS preference services, not direct edits to live plist files.
Close System Settings before applying, then log out and back in so running apps
and input services load the changes. The script does not kill apps or log you out.

## Settings included

| Setting | Stored preference |
| --- | --- |
| Fastest standard key repeat | Global `KeyRepeat = 2` |
| Shortest standard repeat delay | Global `InitialKeyRepeat = 15` |
| Traditional/inverted scrolling | Global `com.apple.swipescrolldirection = false` |
| Hide native menu bar | Global `_HIHideMenuBar = true` |
| Hide Dock | `com.apple.dock` → `autohide = true` |
| Tap to click | `Clicking = true` in internal and Bluetooth trackpad domains; current-host global `com.apple.mouse.tapBehavior = 1` |
| Three-finger drag | `TrackpadThreeFingerDrag = true` in both trackpad domains; internal `Dragging = false`, `DragLock = false` for the alternative drag modes |
| Free Command-Shift-3/4/5 for AeroSpace | Disable symbolic hotkey IDs 28, 30, 184 |
| Free Command-Space for Raycast | Disable symbolic hotkey ID 64 |
| Never automatically turn displays off | `pmset -b displaysleep 0` when battery profile exists; `pmset -c displaysleep 0` |
| Prevent automatic system sleep on AC | `pmset -c sleep 0` |

The numeric keyboard and trackpad values match those observed after configuring
the macOS 26.5.1 GUI. Readback verifies persistence, not event delivery. Check
trackpad gestures and shortcut behavior after your next login, especially when
using a different macOS release.

Hotkey updates use `defaults write … AppleSymbolicHotKeys -dict-add`, changing only
the four selected entries. Existing key combinations and additional fields within
those entries survive. Clipboard screenshot shortcuts, Finder search, and all other
entries survive. XML values retain nested Boolean and integer types. If a selected
entry is absent on a fresh Mac, the script supplies its recorded standard binding
with `enabled = false`. Unexpected non-dictionary values cause an error rather
than replacement.

Battery **system** sleep and any UPS power profile remain unchanged. This does not
override lid-close behavior. Explicit Apple menu → Sleep or `pmset displaysleepnow`
remains available.

## Manual steps

- **Caps Lock → Control:** System Settings → Keyboard → Keyboard Shortcuts →
  Modifier Keys. Select each connected keyboard and change only Caps Lock to
  Control. macOS persists this per keyboard. Hardware IDs and the relationship
  between HID devices and persistent preference keys have not been established
  reliably for arbitrary new keyboards, so this script does not guess or copy
  this Mac's ID. Repeat when connecting a new external keyboard.
- **Raycast:** Finish onboarding, set Command-Space as its hotkey, and enable
  Open at Login. Disabling Spotlight alone does not configure Raycast.
- **Clamshell:** Connect power, an external display, and external keyboard/mouse
  or trackpad. Approve new accessories while the lid is open, then test closing
  the lid. This needs a hardware check; it cannot be validated by preferences.

## Backups and verification

Before any changes, the script writes a timestamped JSON file under
`~/.local/state/mac-bootstrap/preferences/` (override with `--state-dir`). It
contains only changed preference keys, their previous and desired values, exact
commands, and the prior `pmset` settings. It does not save the full global defaults
domain. Files are mode 0600. If a command fails, earlier successful writes are
retained and the backup remains available; rerun after addressing the error.
There is no automatic rollback. Original values can be restored with `defaults`
and `pmset`, using the recorded domain/key/current-host/entry identity. A null
`before` means the key or selected dictionary entry was previously absent.

Validation:

```sh
python3 -m unittest discover -s mac/tests -p test_preferences.py -v
python3 mac/bootstrap/preferences.py --dry-run
```

Tests cover no-op reruns, missing settings, preservation of custom/unrelated
shortcuts, malformed shortcut rejection, battery sleep and UPS preservation,
preview without writes, and scoped backups. On macOS an isolated temporary plist
fixture additionally validates `defaults -dict-add` and nested value types. Tests
do not change live user preferences. The live dry-run on Brandon's configured Mac
reported all stored values already matched on September 11, 2026.

Screenshots save to the current user’s `~/Downloads` using
`com.apple.screencapture location`; the path is resolved on each Mac.
