---
name: setup-dotfiles-macos
description: Install, bootstrap, and verify brs98/.dotfiles on macOS, including Homebrew dependencies, WezTerm, Neovim, bundled skills, AeroSpace, RiceKit, SketchyBar, JankyBorders, and macOS bar hiding. Use for a new Mac or a careful macOS dotfiles reinstall; do not use for Linux or power/battery configuration.
---

# Set Up brs98 Dotfiles on macOS

Bring a macOS machine to a working, verified desktop state using `brs98/.dotfiles`. Preserve existing user data, surface permission prompts, and finish with a repository audit. Do not configure clamshell mode, `caffeinate`, sleep timers, battery optimization, charge limits, or other power settings.

## Operating rules

- Confirm `uname -s` is `Darwin`; stop on other platforms.
- Read the repository's current `install.sh`, `.gitmodules`, and applicable `AGENTS.md` before running installers. Treat this skill's commands as a known-good baseline, but defer to newer repository instructions when they materially changed.
- Inspect existing targets before writing. Do not replace a real file/directory, existing dotfiles checkout, or unrelated user configuration without approval and a recoverable backup.
- Request authorization immediately before downloads, package installs, application launches, service changes, or protected-directory writes.
- Never print, copy into chat, stage, or commit credentials, tokens, RiceKit `license.toml`, or other runtime secrets.
- Use idempotent package/service operations. Do not blindly rerun a partially completed installer: first inspect what it changed and repair any generated move/conflict.

## 1. Discover and prepare

Check the machine and current state:

```bash
uname -s
uname -m
xcode-select -p
command -v git brew gh stow
ls -ld ~/.dotfiles ~/.config ~/.local ~/.agents ~/.claude ~/Library/LaunchAgents 2>/dev/null
```

If `xcode-select -p` fails, run `xcode-select --install`, have the user complete Apple's GUI installer, and recheck before continuing.

If Homebrew is absent, explain that its official installer downloads and executes an external bootstrap script, obtain approval, and use only the command published at `https://brew.sh/`:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After installation, initialize `brew shellenv` using the path printed by the installer and verify `brew --version`. Homebrew is normally `/opt/homebrew` on Apple Silicon and `/usr/local` on Intel, but resolve it with `brew --prefix` rather than hardcoding it in later checks.

Install bootstrap tools before using them:

```bash
brew install gh stow
```

Before creating runtime-owned parents, classify each target. Only create absent paths; preserve real directories, and stop for an existing symlink, file, or incompatible target until its ownership and destination are understood:

```bash
for target in ~/.config ~/.config/ricekit ~/.local ~/.local/bin ~/.local/share \
  ~/.local/share/nvim ~/.local/state ~/.local/state/nvim ~/.agents \
  ~/.agents/skills ~/.claude ~/Library/LaunchAgents; do
  if [ -L "$target" ]; then
    echo "symlink requires review: $target -> $(readlink "$target")"
  elif [ -e "$target" ] && [ ! -d "$target" ]; then
    echo "non-directory requires review: $target"
  elif [ ! -e "$target" ]; then
    mkdir -p "$target"
  fi
done
```

Do not continue while the classification reports an unresolved target. The post-clone Stow gate below must confirm that broad mutable parents and the listed runtime directories remain real directories rather than links into `~/.dotfiles`.

## 2. Authenticate and clone

Use GitHub CLI and verify authentication without exposing the token:

```bash
gh auth status
```

If unauthenticated, have the user complete `gh auth login`. Clone only when `~/.dotfiles` does not exist:

```bash
git clone --recurse-submodules https://github.com/brs98/.dotfiles.git ~/.dotfiles
```

If the main clone exists but the private `game-saves` submodule did not clone, retry after GitHub authentication:

```bash
cd ~/.dotfiles
git submodule sync --recursive
git submodule update --init --recursive
```

Do not handle tokens manually. If HTTPS still prompts unexpectedly, diagnose the configured Git credential helper and `gh auth setup-git`; do not rewrite remotes or SSH host keys without approval.

## 3. Install the Stow configuration

Inspect conflicts with Stow simulation or the repository's current dry-run mechanism before applying. The installer contains force-link and special RetroArch behavior in addition to ordinary Stow packages, so review those sections rather than assuming `stow -n` covers every mutation.

This is a hard pre-install gate: use the cloned package layout to simulate every shared and macOS Stow package and prove that `~/.config/ricekit`, Neovim data/state, `~/.agents/skills`, Claude runtime state, and `~/Library/LaunchAgents` will not become broad links into `~/.dotfiles`. If a mutable subtree can still fold, first try the repository's documented non-mutating flag or precreate the exact absent runtime directory. Otherwise stop and ask before patching `install.sh` or changing package layout; installation authorization alone does not authorize source edits.

Build a concrete manifest of every existing destination that the Stow packages, `shared/symlink`, `mac/symlink`, Herdr preparation, Claude skills link, and RetroArch special handling can touch. Before invoking the installer:

1. Show the conflicts and planned replacements to the user.
2. Obtain approval for those exact targets.
3. Copy approved existing targets to a timestamped directory such as `~/.dotfiles-backups/YYYYMMDD-HHMMSS/`, preserving their relative paths and symlink metadata.
4. Write a plain-text manifest beside the backup and verify every backup exists.
5. Stop if the installer cannot selectively preserve an unapproved target.

Do not place backups inside `~/.dotfiles`. The backup directory and manifest are the rollback path; report them in the handoff.

Run the installer once from its checkout:

```bash
cd ~/.dotfiles
./install.sh
```

Protected paths such as `~/.agents`, `~/.codex`, or `~/.claude` may require explicit authorization in a sandboxed agent environment.

If a permission failure causes a partial run, inspect `git status` and live symlinks before retrying. In particular, an older installer could see the just-stowed Herdr config through a directory symlink and move the tracked `config.toml` to a timestamped backup on a rerun. Restore the tracked config and remove only the installer-generated duplicate after verifying their contents; preserve genuinely pre-existing user config backups.

Verify the essential links and shell syntax:

```bash
ls -l ~/.zshrc ~/.gitconfig ~/.wezterm.lua ~/.config/nvim ~/.claude/skills
zsh -n ~/.zshrc
git -C ~/.dotfiles submodule status
git -C ~/.dotfiles status --short --branch
```

The installer reconciles repository skills into `~/.agents/skills` and links Claude's skills directory. If neither `npx` nor `bunx` existed during installation, install Bun below and run the repository's `skills-sync sync` command or documented skill reconciliation once; do not rerun the entire installer solely for this.

## 4. Install terminal and CLI dependencies

Install the packages used by the checked-in shell, Git, terminal, and editor configs:

```bash
brew install neovim tree-sitter-cli bat diffnav starship zoxide eza lazygit \
  television tmux bun fzf fd zsh-autosuggestions zsh-syntax-highlighting

brew install --cask wezterm font-hack-nerd-font \
  font-caskaydia-mono-nerd-font
```

The macOS WezTerm branch selects `Hack Nerd Font`; Caskaydia Mono is also installed because the shared/Linux branch and related configs use it.

Bootstrap Neovim only after `tree-sitter-cli` exists, allowing its first-run GitHub downloads:

```bash
nvim --headless '+qa'
```

Neovim may continue installing parsers on its first interactive launch. Do not mistake download progress for a configuration failure; do treat nonzero exits or missing Lua modules as failures.

Verify executables and configuration loading:

```bash
for cmd in starship zoxide eza bat lazygit nvim diffnav tv tmux gh bun bunx fzf fd tree-sitter wezterm; do
  command -v "$cmd" || echo "missing: $cmd"
done
zsh -lic 'alias cat; alias ls'
wezterm --config-file ~/.wezterm.lua show-keys --lua >/dev/null
nvim --headless '+qa'
```

Ignore Starship's expected warning when a noninteractive test uses `TERM=dumb`. Launch WezTerm for visual confirmation only with user approval.

## 5. Install the macOS desktop stack

Use the upstream taps and icon font:

```bash
brew install --cask nikitabobko/tap/aerospace
brew install FelixKratz/formulae/sketchybar FelixKratz/formulae/borders
brew install --cask font-sketchybar-app-font
```

Install RiceKit from its official trial download because it is not a Homebrew cask:

1. Resolve and download `https://download.ricekit.app/latest` to a temporary DMG.
2. Mount it read-only with `hdiutil`.
3. Inspect the app with `codesign -dv --verbose=2` and `spctl -a -vv`. Require bundle identifier `com.ricekit.app`, TeamIdentifier `D9RL5KV998`, a stapled notarization ticket, and an accepted Gatekeeper assessment. If any check is unavailable or differs, stop and ask the user rather than improvising acceptance.
4. Copy `RiceKit.app` to `/Applications` only if the user approved installing the trial and an existing app will not be overwritten unexpectedly.
5. Detach the DMG and launch RiceKit.

The expected bundle identifier is `com.ricekit.app`, and the expected release source currently redirects to `brs98/ricekit-releases`. Re-resolve rather than hardcoding a release version.

Launch AeroSpace and RiceKit. The user must complete RiceKit onboarding/trial activation and macOS permission prompts. AeroSpace requires Accessibility permission; open the Accessibility pane when needed and reverify after the user toggles permission or restarts the app.

## 6. Wire RiceKit themes and services

After the user applies a RiceKit theme, inspect active configs:

```bash
ricekit current
ricekit config list
ricekit marketplace list
```

If `ricekit` is not on `PATH`, use `/Applications/RiceKit.app/Contents/MacOS/ricekit` for these commands.

Install/enable the desktop templates when absent, then reapply the user's current theme:

```bash
ricekit marketplace install sketchybar-colors
ricekit config enable jankyborders-colors
ricekit apply <current-theme-slug>
```

Do not guess the theme slug; obtain it from `ricekit current`. A wallpaper AppleScript warning does not invalidate successful config rendering, but report it separately.

Do not start dependent services until both generated files exist and parse:

```bash
test -f ~/.config/sketchybar/colors.sh
test -f ~/.config/borders/borders.sh
bash -n ~/.config/sketchybar/sketchybarrc ~/.config/borders/borders.sh
```

Start SketchyBar at login:

```bash
brew services start FelixKratz/formulae/sketchybar
```

Use the dotfiles' custom JankyBorders LaunchAgent because it sources RiceKit's generated `borders.sh`; do not substitute Homebrew's generic service unless the current dotfiles changed their design:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.user.jankyborders.plist
```

If already loaded, use an idempotent `kickstart` or carefully boot out that exact label before re-bootstrap. The wrapper LaunchAgent may exit successfully after spawning `borders`; verify the actual `borders` process rather than requiring the wrapper to remain running.

Verify:

```bash
brew services list
pgrep -fl 'AeroSpace|sketchybar|borders|RiceKit'
sketchybar --query bar
aerospace list-workspaces --all
```

If AeroSpace is running but its CLI reports `Operation not permitted`, return to Privacy & Security → Accessibility and restart/toggle AeroSpace. Do not claim success until workspaces are returned.

## 7. Hide native macOS chrome

With approval, enable auto-hide for the native menu bar and Dock:

```bash
osascript -e 'tell application "System Events" to set autohide menu bar of dock preferences to true'
osascript -e 'tell application "System Events" to set autohide of dock preferences to true'
```

Verify both settings:

```bash
osascript -e 'tell application "System Events" to get autohide menu bar of dock preferences'
osascript -e 'tell application "System Events" to get autohide of dock preferences'
```

The native bar and Dock remain available at their screen edges.

## 8. Final audit and handoff

Run a final status pass covering:

- GitHub authentication without token output.
- Dotfile links and `zsh -n`.
- Every expected executable.
- WezTerm config load and correct font availability.
- Neovim headless startup.
- AeroSpace workspace response.
- RiceKit current theme and active integrations.
- SketchyBar and JankyBorders processes/services.
- Private submodule initialization.
- `git -C ~/.dotfiles status --short --branch`.

Treat runtime files appearing inside `~/.dotfiles` as a Stow layout problem, not normal source changes. Common offenders are RiceKit state/cache/license data, Neovim `~/.local/share` and `~/.local/state`, agent pools, Claude runtime links, and generated LaunchAgent plists. Never recommend `git add -A` while those are present. Report the exact affected paths, protect secrets, and ask before relocating data or changing the installer/Stow package layout.

Finish by telling the user what is installed, what needs a logout/restart or direct permission click, and whether the checkout is clean. Suggest `exec zsh` to reload the shell; do not execute it from the agent session because it replaces the active shell.
