# Cross-Platform Dotfiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all shared dotfiles work on both macOS and Linux using a base + platform override pattern.

**Architecture:** Merge `origin/main` into `gnu-stow` to get all new features, then fix each shared config to be self-contained with optional platform overrides sourced via graceful fallbacks. macOS-only scripts move out of `shared/` into `mac/`.

**Tech Stack:** GNU Stow, zsh, tmux, git, ghostty, neovim (Lua), WezTerm (Lua), starship (TOML)

---

### Task 1: Merge origin/main into gnu-stow

**Files:**
- All files from 43 commits on main

**Step 1: Merge main**

```bash
git merge origin/main --no-edit
```

If there are conflicts, resolve them by taking the `origin/main` version for now — subsequent tasks will rewrite the conflicting files anyway.

**Step 2: Verify merge succeeded**

```bash
git log --oneline -3
```

Expected: merge commit at top.

**Step 3: Commit (if conflict resolution was needed)**

```bash
git add -A && git commit -m "Resolve merge conflicts from main"
```

---

### Task 2: Rewrite shared zshrc with tool guards and platform sourcing

**Files:**
- Modify: `shared/stow/zsh/.zshrc`
- Create: `mac/stow/zsh-platform/.config/zsh/platform.zsh`
- Create: `linux/stow/zsh-platform/.config/zsh/platform.zsh`

**Step 1: Write the new shared zshrc**

Replace `shared/stow/zsh/.zshrc` with:

```bash
# Load secrets (API keys, tokens) — machine-local, not in dotfiles
[[ -f ~/.secrets ]] && source ~/.secrets

# Path configuration
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

# Initialize completions
autoload -U compinit && compinit

# Zsh options
setopt AUTO_CD
setopt HIST_IGNORE_DUPS
setopt HIST_SAVE_NO_DUPS
setopt SHARE_HISTORY

# Aliases
alias c="claude --dangerously-skip-permissions"
alias cat="bat --theme=base16"
alias cdc="cd ~/.config/"
alias cdd="cd ~/.dotfiles/"
alias ldk="lazydocker"
alias lg="lazygit"
alias sdf="cd ~/.dotfiles && ./install.sh"
alias v="nvim"
alias vim="nvim"

# Directories
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# Better cd
if command -v zoxide &> /dev/null; then
  alias cd="zd"
  zd() {
    if [ $# -eq 0 ]; then
      builtin cd ~ && return
    elif [ -d "$1" ]; then
      builtin cd "$1"
    else
      z "$@" && printf "\U000F17A9 " && pwd || echo "Error: Directory not found"
    fi
  }
fi

# Better ls
if command -v eza &> /dev/null; then
  alias ls="eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions --group-directories-first"
  alias lsa='ls -a'
  alias lt='eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions --group-directories-first --tree --level=2'
  alias lta='lt -a'
fi

# Fuzzy finder — prefer tv, fall back to fzf
if command -v tv &> /dev/null; then
  eval "$(tv init zsh)"
  alias ff="tv files"
elif command -v fzf &> /dev/null; then
  source <(fzf --zsh)
  alias ff="fzf --preview 'bat --style=numbers --color=always {}'"
fi

# Initialize tools
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
if command -v mise &> /dev/null; then
  eval "$(mise activate zsh)"
fi
if command -v wt &> /dev/null; then
  eval "$(command wt config shell init zsh)"
fi

# Platform overrides (stowed from mac/ or linux/)
[[ -f ~/.config/zsh/platform.zsh ]] && source ~/.config/zsh/platform.zsh

# Machine-local config (never committed)
[[ -f ~/.config/zsh/local.zsh ]] && source ~/.config/zsh/local.zsh
```

**Step 2: Create macOS platform override**

Create `mac/stow/zsh-platform/.config/zsh/platform.zsh`:

```bash
# macOS zsh platform overrides

# Zsh plugins via Homebrew
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source $(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac

# Worktree helpers (create WezTerm workspace + git worktree)
new() {
  local worktree_name="" cwd=~/work/fluid-mono-with-backend/fluid-mono.git default_branch=main

  while [[ $# -gt 0 ]]; do
    case $1 in
      -f|--frontend) cwd=~/work/fluid-mono-with-backend/fluid-mono.git; default_branch=main; shift ;;
      -b|--backend) cwd=~/work/fluid-mono-with-backend/fluid.git; default_branch=master; shift ;;
      --cwd) cwd="$2"; shift 2 ;;
      *) worktree_name="$1"; shift ;;
    esac
  done

  if [[ -z "$worktree_name" ]]; then
    echo "Usage: new <worktree-name> [-f|--frontend] [-b|--backend] [--cwd <dir>]"
    return 1
  fi

  builtin cd "$cwd/$default_branch" || { echo "Error: could not cd to $cwd/$default_branch"; return 1; }
  git checkout "$default_branch" || return 1
  git pull origin "$default_branch" || return 1
  builtin cd "$cwd" || return 1
  git worktree add "$worktree_name" || { echo "Error: could not create worktree '$worktree_name'"; return 1; }
  builtin cd "$worktree_name" || return 1
  git push -u || return 1
  echo "Created git worktree '$worktree_name'"
}

checkout() {
  local branch_name="" cwd=~/work/fluid-mono-with-backend/fluid-mono.git default_branch=main

  while [[ $# -gt 0 ]]; do
    case $1 in
      -f|--frontend) cwd=~/work/fluid-mono-with-backend/fluid-mono.git; default_branch=main; shift ;;
      -b|--backend) cwd=~/work/fluid-mono-with-backend/fluid.git; default_branch=master; shift ;;
      --cwd) cwd="$2"; shift 2 ;;
      *) branch_name="$1"; shift ;;
    esac
  done

  if [[ -z "$branch_name" ]]; then
    echo "Usage: checkout <branch-name> [-f|--frontend] [-b|--backend] [--cwd <dir>]"
    return 1
  fi

  builtin cd "$cwd/$default_branch" || { echo "Error: could not cd to $cwd/$default_branch"; return 1; }
  git fetch origin '+refs/heads/*:refs/remotes/origin/*' || return 1
  builtin cd "$cwd" || return 1
  git worktree add "$branch_name" "origin/$branch_name" || { echo "Error: could not create worktree '$branch_name'"; return 1; }
  builtin cd "$branch_name" || return 1
  git checkout -b "$branch_name" || return 1
  git branch -u "origin/$branch_name" || return 1
  echo "Created git worktree '$branch_name' tracking origin/$branch_name"
}

# SSH alias
alias mizu="ssh mizu@100.121.123.91"
```

**Step 3: Create Linux platform override**

Create `linux/stow/zsh-platform/.config/zsh/platform.zsh`:

```bash
# Linux zsh platform overrides

# Zsh plugins from system packages
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# xdg-open wrapper (macOS has native `open`)
open() {
  xdg-open "$@" >/dev/null 2>&1 &
}
```

**Step 4: Verify directory structure**

```bash
ls mac/stow/zsh-platform/.config/zsh/platform.zsh
ls linux/stow/zsh-platform/.config/zsh/platform.zsh
```

**Step 5: Commit**

```bash
git add shared/stow/zsh/.zshrc mac/stow/zsh-platform/ linux/stow/zsh-platform/
git commit -m "Rewrite zshrc with base + platform override pattern"
```

---

### Task 3: Restore tmux base config with optional theme

**Files:**
- Modify: `shared/stow/tmux/.tmux.conf`

**Step 1: Write the full tmux config**

Replace `shared/stow/tmux/.tmux.conf` with the full working config from `gnu-stow` (pre-merge), but with the omarchy theme source replaced by an optional theme include:

```tmux
# Optional theme (ricekit, omarchy, or platform-specific)
source-file -q ~/.config/tmux/theme.conf

# Shell — use default $SHELL (works on both macOS and Linux)
set-option -g prefix C-b
bind-key C-b send-prefix

# Base settings
set -g base-index 1
setw -g pane-base-index 1
set-option -g renumber-windows on
set -g escape-time 0
set -g history-limit 10000
set -g default-terminal "tmux-256color"
set -s escape-time 0
set -g mouse on
set-option -g default-terminal "screen-256color"
set-option -ga terminal-overrides ',*-256color*:RGB'
setw -g mode-keys vi

# Status bar
set -g status-position bottom
set -g status-left-length 100
set -g status-left "#[bold]  #S  | "
set -g status-right ""
set -g window-status-current-format "#[bold]  #W"
set -g window-status-format " #I|#W"

# Copy mode
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle

# Platform-specific clipboard commands
if-shell "uname | grep -q Darwin" \
    "bind-key -T copy-mode-vi y send-keys -X copy-pipe 'pbcopy'; \
     bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'pbcopy'" \
    "bind-key -T copy-mode-vi y send-keys -X copy-pipe 'wl-copy || xclip -selection clipboard'; \
     bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'wl-copy || xclip -selection clipboard'"

bind-key -T copy-mode-vi Escape send-keys -X cancel

# Better pane splits
bind-key - split-window -v
bind-key | split-window -h
bind -n C-M-Down split-window -v
bind -n C-M-Right split-window -h
bind -n C-M-x kill-pane
bind -n M-Left if-shell -F '#{pane_at_left}' 'previous-window' 'select-pane -L'
bind -n M-Right if-shell -F '#{pane_at_right}' 'next-window' 'select-pane -R'
bind -n M-Up select-pane -U
bind -n M-Down select-pane -D

# Open panes in current directory
bind h split-window -v -c "#{pane_current_path}"
bind v split-window -h -c "#{pane_current_path}"

# Clear screen override for vim-tmux-navigator
bind C-l send-keys 'C-l'

# Better navigation
bind -n M-0 select-window -t 0
bind -n M-1 select-window -t 1
bind -n M-2 select-window -t 2
bind -n M-3 select-window -t 3
bind -n M-4 select-window -t 4
bind -n M-5 select-window -t 5
bind -n M-6 select-window -t 6
bind -n M-7 select-window -t 7
bind -n M-8 select-window -t 8
bind -n M-9 select-window -t 9

# Better windows
bind -n C-t new-window
bind -n C-w kill-window

# Reload config
bind r source-file ~/.tmux.conf

# User overrides
source-file -q ~/.tmux-overrides.conf
```

Note: The `set-option -g default-shell "/usr/bin/zsh"` line is removed — tmux uses `$SHELL` by default, which is correct on both platforms.

Note: The status bar uses plain formatting without omarchy theme variables (`@foreground`, `@accent`, etc.). When `theme.conf` is present it can override these styles.

**Step 2: Commit**

```bash
git add shared/stow/tmux/.tmux.conf
git commit -m "Restore full tmux base config with optional theme sourcing"
```

---

### Task 4: Fix gitconfig with portable paths and includes

**Files:**
- Modify: `shared/stow/git/.gitconfig` (was renamed from `.config/git/config` on main)

**Step 1: Write the gitconfig**

Replace `shared/stow/git/.gitconfig` with:

```gitconfig
[user]
	name = Brandon Southwick
	email = southwick.brandon21@gmail.com

[core]
    editor = nvim
    ignorecase = false

[credential "https://github.com"]
	helper =
	helper = !gh auth git-credential
[credential "https://gist.github.com"]
	helper =
	helper = !gh auth git-credential

[pull]
    rebase = false

[push]
    autoSetupRemote = true

[init]
    defaultBranch = main

[rebase]
    updateRefs = true

[alias]
    co = checkout
    br = branch
    st = status
    f = fetch
    a = add
    c = commit
    cm = commit -m
    p = push

[protocol "file"]
	allow = always

[pager]
    diff = diffnav

[delta]
    navigate = true
    line-numbers = true
    side-by-side = true
    syntax-theme = ansi

[interactive]
    diffFilter = delta --color-only

[merge]
    conflictstyle = diff3

[diff]
    colorMoved = default

[include]
    path = ~/.config/git/local
```

Note: The `[include]` at the bottom lets any machine add local overrides via `~/.config/git/local` (never committed). The credential helper uses `!gh` (PATH lookup) instead of `/usr/bin/gh`.

**Step 2: Verify old path is gone**

```bash
ls shared/stow/git/.config/git/config 2>/dev/null && echo "OLD FILE STILL EXISTS — delete it" || echo "OK"
```

If the old file exists, delete it:

```bash
rm -f shared/stow/git/.config/git/config
rmdir -p shared/stow/git/.config/git 2>/dev/null
```

**Step 3: Commit**

```bash
git add shared/stow/git/
git commit -m "Fix gitconfig with portable credential paths and local includes"
```

---

### Task 5: Fix ghostty config with optional theme and no hardcoded shell

**Files:**
- Modify: `shared/stow/ghostty/.config/ghostty/config`

**Step 1: Write the ghostty config**

Replace `shared/stow/ghostty/.config/ghostty/config` with:

```
# Optional theme (ricekit or other)
config-file = ?~/.config/ghostty/theme.conf

# Window
window-decoration = "none"
background-opacity = 0.5

# Font
font-family = "CaskaydiaMono Nerd Font"
font-style = Regular
font-size = 9

# Window
window-padding-x = 14
window-padding-y = 14
confirm-close-surface = false
resize-overlay = never

# Cursor styling
cursor-style = "block"
cursor-style-blink = false
shell-integration-features = no-cursor

# Keyboard bindings
keybind = f11=toggle_fullscreen
keybind = shift+insert=paste_from_clipboard
keybind = control+insert=copy_to_clipboard

# Slowdown mouse scrolling
mouse-scroll-multiplier = 0.95
keybind = shift+enter=text:\x1b\r
```

Note: Removed `command = /usr/bin/zsh` (ghostty uses `$SHELL`) and removed `async-backend = epoll` (only needed for Hyprland — should go in a linux override if needed). Changed theme path from `ricekit-theme` to `theme.conf` for consistency.

**Step 2: Create Linux ghostty override for Hyprland**

Create `linux/stow/ghostty/.config/ghostty/platform.conf`:

```
# Hyprland performance fix (https://github.com/ghostty-org/ghostty/discussions/3224)
async-backend = epoll
```

Then add to the shared config at the bottom:

```
# Platform overrides
config-file = ?~/.config/ghostty/platform.conf
```

**Step 3: Commit**

```bash
git add shared/stow/ghostty/ linux/stow/ghostty/
git commit -m "Fix ghostty config with optional theme and platform overrides"
```

---

### Task 6: Fix nvim theme loading with pcall fallback

**Files:**
- Create: `shared/stow/nvim/.config/nvim/lua/custom/theme.lua`
- Modify: `shared/stow/nvim/.config/nvim/init.lua` (should already have the require from main merge)
- Verify: `shared/stow/nvim/.config/nvim/lua/plugins/theme.lua` symlink is deleted (from main)
- Verify: `shared/stow/nvim/.config/nvim/colors/ricekit.lua` symlink exists (from main)
- Verify: `shared/stow/nvim/.config/nvim/plugin/after/transparency.lua` has updated version from main
- Verify: `shared/stow/nvim/.config/nvim/lua/plugins/bufferline.lua` has transparency highlights from main

**Step 1: Write theme.lua with fallback**

Create/replace `shared/stow/nvim/.config/nvim/lua/custom/theme.lua`:

```lua
-- Load ricekit theme if available, otherwise fall back to built-in
local ok = pcall(vim.cmd.colorscheme, "ricekit")
if not ok then
    vim.cmd.colorscheme("habamax")
end
```

**Step 2: Verify init.lua has the require**

Check that `shared/stow/nvim/.config/nvim/init.lua` contains `require("custom.theme")` before `require("custom.globals")`. If not, add it.

**Step 3: Verify plugins/theme.lua symlink is removed**

```bash
ls -la shared/stow/nvim/.config/nvim/lua/plugins/theme.lua 2>/dev/null && echo "DELETE THIS" || echo "OK — already gone"
```

**Step 4: Commit**

```bash
git add shared/stow/nvim/
git commit -m "Add nvim theme loading with pcall fallback for missing ricekit"
```

---

### Task 7: Fix WezTerm config with pcall fallbacks

**Files:**
- Modify: `shared/stow/wezterm/.wezterm.lua`

**Step 1: Fix ricekit and aerospace dofile calls**

In `shared/stow/wezterm/.wezterm.lua`, replace the lines that unconditionally `dofile()` ricekit colors and aerospace state with pcall-guarded versions.

Find:
```lua
config.colors = dofile(ricekit_colors)
```

Replace with:
```lua
local ok, colors = pcall(dofile, ricekit_colors)
if ok and colors then
    config.colors = colors
end
```

Find the tab_bar block that references `config.colors.ansi` and `config.colors.selection_bg` — wrap the entire block:

```lua
if config.colors then
    -- Fix tab bar contrast ...
    config.colors.tab_bar = { ... }
    -- Pane borders ...
    config.colors.split = config.colors.ansi[5]
end
```

Find the aerospace state `dofile` in the `window-config-reloaded` handler:

```lua
local ok, state = pcall(dofile, wezterm_state_file)
```

This is already using pcall — no change needed.

**Step 2: Commit**

```bash
git add shared/stow/wezterm/.wezterm.lua
git commit -m "Guard WezTerm ricekit/aerospace loads with pcall fallbacks"
```

---

### Task 8: Move macOS-only scripts from shared to mac

**Files:**
- Move: `shared/stow/scripts/.local/bin/checkout-wez` -> `mac/stow/scripts/.local/bin/checkout-wez`
- Move: `shared/stow/scripts/.local/bin/new-wez` -> `mac/stow/scripts/.local/bin/new-wez`
- Move: `shared/stow/scripts/.local/bin/claude-wezterm-status` -> `mac/stow/scripts/.local/bin/claude-wezterm-status`

**Step 1: Create mac scripts directory and move files**

```bash
mkdir -p mac/stow/scripts/.local/bin
git mv shared/stow/scripts/.local/bin/checkout-wez mac/stow/scripts/.local/bin/
git mv shared/stow/scripts/.local/bin/new-wez mac/stow/scripts/.local/bin/
git mv shared/stow/scripts/.local/bin/claude-wezterm-status mac/stow/scripts/.local/bin/
```

**Step 2: Clean up empty shared scripts directory if empty**

```bash
rmdir shared/stow/scripts/.local/bin shared/stow/scripts/.local shared/stow/scripts 2>/dev/null || true
```

If the shared/stow/scripts directory is now empty, stow won't try to stow it (good). If other scripts exist there, leave it.

**Step 3: Commit**

```bash
git add -A
git commit -m "Move macOS-only scripts (osascript-based) from shared to mac"
```

---

### Task 9: Update install.sh with diffnav and tv in tool check

**Files:**
- Modify: `install.sh`

**Step 1: Add diffnav and tv to the tool requirements output**

Find the tool requirements echo block at the bottom of `install.sh` and add `diffnav` and `tv` to the shared tools list (before the platform-specific block):

```bash
echo "  - diffnav (git diff pager)"
echo "  - tv (television fuzzy finder)"
```

**Step 2: Commit**

```bash
git add install.sh
git commit -m "Add diffnav and tv to install.sh tool requirements"
```

---

### Task 10: Install missing tools on this Linux machine

**Step 1: Install tv (television)**

```bash
# Check AUR or cargo
pacman -Si television 2>/dev/null || cargo install television
```

Or if using an AUR helper:

```bash
yay -S television
```

**Step 2: Install diffnav**

```bash
yay -S diffnav
```

Or via cargo:

```bash
cargo install diffnav
```

**Step 3: Verify both tools work**

```bash
command -v tv && echo "tv OK" || echo "tv MISSING"
command -v diffnav && echo "diffnav OK" || echo "diffnav MISSING"
```

---

### Task 11: Test the full setup

**Step 1: Run install.sh**

```bash
cd ~/.dotfiles && ./install.sh
```

Expected: No errors. Should see stowing messages for shared, then linux.

**Step 2: Start a new zsh shell and verify no errors**

```bash
zsh -l -c 'echo "Shell started OK"'
```

Expected: No errors about missing commands, no broken sources.

**Step 3: Verify key tools work**

```bash
zsh -c 'type ff'       # Should show tv or fzf alias
zsh -c 'type open'     # Should show function (linux override)
git diff --help | head -1  # Should use diffnav pager
nvim --headless -c 'echo "colorscheme: " .. vim.g.colors_name' -c 'qa' 2>&1  # Should show ricekit or habamax
tmux new-session -d -s test && tmux kill-session -t test && echo "tmux OK"
```

**Step 4: Commit any final adjustments**

```bash
git add -A && git commit -m "Final cross-platform dotfiles adjustments"
```
