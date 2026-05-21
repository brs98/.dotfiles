---
name: ricekit
description: Use when managing RiceKit themes, config templates, wallpapers, schedules, marketplace content, HTTP integrations, licensing, or the ricekit CLI in the local RiceKit repository.
---

# RiceKit CLI Reference

RiceKit is a commercial macOS desktop customization toolkit. It applies one resolved palette to active config templates, wallpapers, and opt-in HTTP integrations.

This skill matches the CLI in `crates/ricekit-cli/src/main.rs` and command modules as of the current repo. Prefer `ricekit <command> --help` when exact flags matter.

## Current command model

Do **not** use old commands like `ricekit apps ...`, `ricekit plugins ...`, `ricekit theme apply`, `ricekit theme current`, `ricekit theme get`, `ricekit theme duplicate`, or `ricekit theme export`; they are not in the current CLI.

Top-level commands:

```bash
ricekit apply <theme> [--json]        # apply a theme to all active configs/integrations
ricekit current [--json]              # current theme + active state entries
ricekit list [--json]                 # available themes across custom/installed/bundled (alias: ls)
ricekit init                          # interactive first-run/app setup wizard
ricekit pick                          # interactive theme picker (alias: p)
ricekit status [--json]               # dashboard (alias: s)
ricekit doctor [--json]               # version drift diagnostics
ricekit completions <shell>           # shell completions
```

Licensing commands are always available; most other commands are license-gated and auto-start the 7-day trial on first paid command:

```bash
ricekit license
ricekit trial
ricekit activate <license-key>
ricekit deactivate
```

## Themes

Themes are TOML, not JSON. On disk:

- Bundled/extracted: `~/.config/ricekit/themes/<slug>/theme.toml`
- Marketplace: `~/.config/ricekit/installed-themes/<slug>/theme.toml`
- User-owned: `~/.config/ricekit/custom-themes/<slug>/theme.toml`

Resolution order is custom → installed → bundled. Bundled theme slugs in this repo are currently: `catppuccin-latte`, `catppuccin-mocha`, `gruvbox-dark`, `tokyo-night`.

Theme commands:

```bash
ricekit theme list [--json]
ricekit theme show <name> [--json] [--contrast]
ricekit theme create <name>                 # writes a custom theme scaffold
ricekit theme edit <name>                   # opens custom/bundled theme.toml in $EDITOR (not installed-themes)
ricekit theme set-color <name> <key> <hex> [--json]
ricekit theme delete <name>                 # custom themes only
ricekit theme extend <base> <name>          # custom overlay inheriting from base
ricekit theme import <image> [--apply|--preview] [--json] [--no-fix-contrast] \
  [--name <name>] [--dark|--light|--both] [--tint-strength <float>]
ricekit theme fix-contrast <name> [--target 7.0] [--json]
```

`set-color` and `fix-contrast` require a custom theme. Use `extend` for small overrides of a base theme.

Minimal `theme.toml` shape:

```toml
[metadata]
name = "My Theme"
author = "Me"
version = "1.0.0"
variant = "dark" # or "light"
description = "Optional"
# extends = "tokyo-night" # optional overlay base

[colors.ansi]
foreground = "#c0caf5"
background = "#1a1b26"
black = "#15161e"
red = "#f7768e"
green = "#9ece6a"
yellow = "#e0af68"
blue = "#7aa2f7"
magenta = "#bb9af7"
cyan = "#7dcfff"
white = "#a9b1d6"
bright_black = "#414868"
bright_red = "#f7768e"
bright_green = "#9ece6a"
bright_yellow = "#e0af68"
bright_blue = "#7aa2f7"
bright_magenta = "#bb9af7"
bright_cyan = "#7dcfff"
bright_white = "#c0caf5"

[colors.semantic]
accent = "#7aa2f7" # all semantic fields are optional
```

Semantic fields: `accent`, `error`, `warning`, `success`, `info`, `surface`, `border`, `muted`. Missing semantic colors are derived from ANSI colors.

## Config templates

RiceKit no longer expects app-specific files inside each theme. Active configs are separate template packages. Applying a theme renders each active config's `templates/` files with the resolved palette, then writes/symlinks them to the configured target and runs reload hooks.

```bash
ricekit config list [--json]
ricekit config enable <name>
ricekit config disable <name>
ricekit config delete <name>       # user custom-configs only; marketplace content uses uninstall
```

Config lookup order is `custom-configs/` → `installed-configs/` → `configs/`. Community configs are installed through the marketplace and auto-enabled on install. Enabling a config auto-disables an already-active sibling with the same app + type.

Template variables/functions are documented in `app-formats.md` in this skill directory.

## Marketplace and community content

Community release content provides themes, configs, and integrations at runtime.

```bash
ricekit community status [--json]
ricekit community refresh [--json]

ricekit marketplace refresh [--json]
ricekit marketplace list [--installed] [--json]
ricekit marketplace install <name> [--json]
ricekit marketplace uninstall <name> [--json]
```

Install behavior: configs auto-enable; integrations do **not** auto-enable because secrets usually need to be configured first.

## HTTP integrations and secrets

Integrations are resolved from `custom-integrations/` → `installed-integrations/` → `integrations/`. They fire HTTP requests after config rendering on CLI/desktop theme apply. Daemon-scheduled applies skip integrations to avoid unattended Keychain prompts.

```bash
ricekit integration list [--json]
ricekit integration info <name>
ricekit integration enable <name>
ricekit integration disable <name>
ricekit integration state <name> [--json]
ricekit integration condition <name> \
  [--ssid <ssid>] [--gateway-mac <mac|auto>] [--local-cidr <cidr>] \
  [--host-reachable <host:port[:timeout_ms]>] [--clear]

ricekit secrets set <integration> <key>     # hidden prompt; macOS Keychain
ricekit secrets list <integration>          # never prints values
ricekit secrets unset <integration> <key>
```

Condition overrides live at `~/.config/ricekit/integration-overrides/<name>.toml`. Secret substitution uses `@@secret:KEY@@` in integration URL/header/body templates; secret values are never written to rendered config files.

Use `RICEKIT_DRY_RUN=1 ricekit apply <theme>` to preview integration behavior without firing real HTTP requests.

## Wallpapers

CLI wallpaper changes prefer `desktoppr` when found on `$PATH` or Homebrew paths, then fall back to AppleScript (`osascript`). The desktop app uses its bundled `desktoppr` when available.

```bash
ricekit wallpaper list [theme] [--json]
ricekit wallpaper current [--json]
ricekit wallpaper apply <path> [--display <n>]
ricekit wallpaper add <paths...> [--theme <theme>]
ricekit wallpaper remove <filename> [--theme <theme>]
ricekit wallpaper next [--theme <theme>]
ricekit wallpaper auto-cycle [<seconds>|off]
ricekit wallpaper pick <dir> [--no-fix-contrast] [--name <name>] \
  [--dark|--light|--both] [--tint-strength <float>]
```

Wallpaper files for user themes live under `custom-themes/<theme>/wallpapers/`; per-theme wallpaper preference is stored in `state.toml`.

## Scheduling and daemon

```bash
ricekit schedule show [--json]
ricekit schedule add --name <name> --theme <theme> --time HH:MM
ricekit schedule remove <name>
ricekit schedule enable
ricekit schedule disable
ricekit schedule toggle

ricekit daemon install
ricekit daemon uninstall
ricekit daemon status [--json]
ricekit daemon logs [-n <lines>] [-f]
```

Do not run `ricekit daemon install` with `sudo`; it registers a per-user LaunchAgent. Daemon-scheduled applies update themes/configs/wallpaper but skip HTTP integrations. A CLI-triggered schedule catch-up may use the normal apply path.

## Browser integration

```bash
ricekit browser setup
```

Registers the native messaging host for detected Firefox, Zen Browser, Google Chrome, and Chromium installs. `ricekit browser host` is internal and launched by browsers, not users.

## Data directory

Default data dir is `~/.config/ricekit/`; override with `RICEKIT_DATA_DIR` for tests/sandboxes.

Important files/dirs: `state.toml`, `preferences.toml`, `schedule.toml`, `license.toml`, `trial.toml`, `themes/`, `custom-themes/`, `installed-themes/`, `custom-configs/`, `installed-configs/`, `custom-integrations/`, `installed-integrations/`, `integration-overrides/`, `rendered/`, `active/`, `logs/`.

## JSON guidance

Only commands with a `--json` flag emit structured JSON. Do not assume every command supports it. For scripts, prefer:

```bash
ricekit list --json
ricekit current --json
ricekit status --json
ricekit config list --json
ricekit integration list --json
ricekit marketplace list --json
```

Errors are generally printed by `anyhow`/CLI error handling and are not guaranteed to be JSON unless that specific command path implements JSON output.
