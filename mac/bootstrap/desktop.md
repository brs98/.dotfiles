# Desktop phase

Run `bash mac/bootstrap/desktop.sh` to print the plan without launching apps,
reading RiceKit state, downloading files, or changing services. Run with `--apply`
to install a missing RiceKit and open AeroSpace/RiceKit for onboarding. After
finishing RiceKit onboarding and macOS Accessibility prompts, rerun with
`--apply --onboarding-complete`. This explicit flag matters because the first
RiceKit CLI call can start its trial. It is not a purchase authorization.

Exit codes: `0` verified (or dry run); `3` manual action pending; `1` failed.
The outer bootstrap can continue independent phases on exit 3. Existing RiceKit
apps are preserved, including incomplete installs, which require manual repair.
Downloads use the official HTTPS latest endpoint and must pass signature,
bundle ID `com.ricekit.app`, signing team `D9RL5KV998`, stapled notarization, and
Gatekeeper checks. The download is not version-pinned. A changed signing team or
verification failure stops installation. `/Applications` must already be writable.

Install the Brewfile and Stow configs first. Required CLI tools include jq,
SketchyBar, borders, and AeroSpace. The script preserves RiceKit's selected theme,
using `catppuccin-mocha` only if none exists. It enables sketchybar-colors,
jankyborders-colors, wezterm-colors, wezterm-config, neovim-colors, and
starship-prompt. The latter and jankyborders-colors must come from this repository;
the other missing integrations come from RiceKit's marketplace. The rejected
upstream starship-colors reload hook is not used. Applying the selected theme on
rerun refreshes generated files, including template edits; it can also update
the wallpaper and run integration reload hooks. Themes remain user-selectable.

Only start login services once generated scripts exist and pass shell syntax
validation. Use the tracked custom border LaunchAgent, whose shell expands
`$HOME` at runtime; it contains no machine-specific home path. The added
`AbandonProcessGroup=true` keeps its background borders process alive after the
shell exits. Every apply reloads only this exact job so updated plist settings
are picked up. The generic Homebrew borders login service is stopped if loaded;
SketchyBar uses its Homebrew service. If the old setup's real local plist blocks
Stow, reconcile it through the outer bootstrap's backup/conflict handling rather
than deleting it. No secrets or RiceKit license files are read by this script.

Verify the visual theme and bar in the actual desktop afterward. Account sign-ins,
RiceKit onboarding, AeroSpace Accessibility permission, and other native consent
prompts remain manual. Wallpaper permission errors reported by RiceKit should be
resolved in the app. A nonzero apply exit stops the phase, even if some config
files rendered successfully. Service verification uses actual borders process,
SketchyBar query, and AeroSpace workspaces instead of assuming app launch succeeded.

Checks: `python3 mac/tests/test_desktop_bootstrap.py` exercises no-op dry runs,
onboarding gating, theme preservation, and refusal to start services without
valid generated scripts using disposable fake apps/commands. It does not download
RiceKit or change live desktop state. Run `bash -n mac/bootstrap/desktop.sh` and
`plutil -lint mac/stow/jankyborders/Library/LaunchAgents/com.user.jankyborders.plist`.
