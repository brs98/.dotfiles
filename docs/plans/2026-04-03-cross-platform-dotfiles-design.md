# Cross-Platform Dotfiles Design

## Problem

Dotfiles on `main` were refactored around macOS (ricekit theming, WezTerm scripts with osascript, hardcoded macOS paths) and no longer work cleanly on Linux. Need a general strategy so shared configs work on both platforms without duplication.

## Approach: Base + Platform Overrides

Keep GNU Stow. Shared configs contain the full working base, platform dirs only add or override.

## Directory Structure

```
shared/stow/          -> Full, working configs. Must boot clean on bare Linux OR macOS.
shared/symlink/       -> Cross-platform symlinks (retroarch, claude skills, etc.)

mac/stow/             -> Platform override files ONLY (sourced by shared base configs)
mac/symlink/          -> Mac-only symlinks

linux/stow/           -> Platform override files ONLY (sourced by shared base configs)
linux/symlink/        -> Linux-only symlinks (hypr, omarchy, etc.)
```

## Rules

1. **Shared configs must be self-contained.** Deleting `mac/` and `linux/` entirely must leave every config in `shared/` working with sane defaults.
2. **Platform overrides only add or replace, never required.** Base config sources them with graceful fallback (`-q`, `?`, `[[ -f ]]`, `pcall`).
3. **Guard optional tools, don't assume them.** Wrap in `command -v` checks with fallback to a common alternative.

## Per-Config Design

### zsh

**Base** (`shared/stow/zsh/.zshrc`): All cross-platform config. Tool guards inline for small differences:

```bash
if command -v tv &> /dev/null; then
    eval "$(tv init zsh)"
    alias ff="tv files"
elif command -v fzf &> /dev/null; then
    source <(fzf --zsh)
    alias ff="fzf --preview 'bat --style=numbers --color=always {}'"
fi
```

Sources platform overrides at the bottom:

```bash
[[ -f ~/.config/zsh/platform.zsh ]] && source ~/.config/zsh/platform.zsh
[[ -f ~/.config/zsh/local.zsh ]]    && source ~/.config/zsh/local.zsh
```

**Mac override** (`mac/stow/zsh/.config/zsh/platform.zsh`): pnpm path, brew plugin paths.

**Linux override** (`linux/stow/zsh/.config/zsh/platform.zsh`): linux plugin paths, `open()` xdg-open wrapper.

**local.zsh**: Never committed. Machine-local for work repo paths, SSH aliases, secrets.

### tmux

**Base** (`shared/stow/tmux/.tmux.conf`): Full working config restored -- shell, keybindings, copy mode, pane nav, status bar, mouse. Sources optional theme at the top:

```tmux
source-file -q ~/.config/tmux/theme.conf
# ... full working config ...
```

Platform or ricekit writes to `~/.config/tmux/theme.conf`. Without it, tmux defaults apply.

### git

**Base** (`shared/stow/git/.gitconfig`): Shared aliases, credential helpers (`!gh` not `/usr/bin/gh`), delta config, `diffnav` pager (installed on both platforms). Uses conditional includes:

```gitconfig
[include]
    path = ~/.config/git/platform
    path = ~/.config/git/local
```

### ghostty

**Base** (`shared/stow/ghostty/.config/ghostty/config`): Font, padding, cursor, opacity. Optional theme include:

```
config-file = ?~/.config/ghostty/theme.conf
```

No hardcoded `command =` line -- ghostty uses `$SHELL` by default.

### nvim

**Theme loading** (`lua/custom/theme.lua`): pcall with built-in fallback:

```lua
local ok = pcall(vim.cmd.colorscheme, "ricekit")
if not ok then
    vim.cmd.colorscheme("habamax")
end
```

Bufferline transparency, plugin changes -- all cross-platform, no changes needed.

### wezterm

**Base** (`shared/stow/wezterm/.wezterm.lua`): Already has `wezterm.target_triple` platform detection for font sizes and macOS settings. Add pcall fallbacks for ricekit colors and aerospace state:

```lua
local ok, colors = pcall(dofile, ricekit_colors)
if ok then config.colors = colors end
```

**Move macOS-only scripts**: `new-wez`, `checkout-wez`, `claude-wezterm-status` move from `shared/stow/scripts/` to `mac/stow/scripts/`.

### starship

Ricekit palette block is self-contained color definitions. Works on both platforms as-is. No changes needed.

### claude

`claude-wezterm-status` hook in settings.json -- the script already exits cleanly when `$WEZTERM_UNIX_SOCKET` is unset. No changes needed.

## Ricekit / Theme Strategy

Ricekit is optional everywhere:

- Every config has "source theme file if it exists" pattern
- Without ricekit: each tool falls back to defaults or built-in colorscheme
- When ricekit comes to Linux, just set up symlinks -- configs already reference the right paths

## New Package Requirements

Install on both platforms: `diffnav`, `tv` (television)
