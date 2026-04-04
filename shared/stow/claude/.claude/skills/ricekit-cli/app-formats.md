# Ricekit App-Specific File Formats

Reference for creating app-specific theme files from scratch.

## theme.json (Required)

The core theme definition. All colors use `#RRGGBB` hex format.

```json
{
  "name": "Theme Name",
  "author": "Your Name",
  "description": "Theme description",
  "version": "1.0.0",
  "colors": {
    "background": "#1e1e2e",
    "foreground": "#cdd6f4",
    "cursor": "#f5e0dc",
    "selection": "#585b70",
    "accent": "#89b4fa",
    "border": "#585b70",
    "black": "#45475a",
    "red": "#f38ba8",
    "green": "#a6e3a1",
    "yellow": "#f9e2af",
    "blue": "#89b4fa",
    "magenta": "#f5c2e7",
    "cyan": "#94e2d5",
    "white": "#bac2de",
    "brightBlack": "#585b70",
    "brightRed": "#f38ba8",
    "brightGreen": "#a6e3a1",
    "brightYellow": "#f9e2af",
    "brightBlue": "#89b4fa",
    "brightMagenta": "#f5c2e7",
    "brightCyan": "#94e2d5",
    "brightWhite": "#a6adc8"
  }
}
```

## sketchybar-colors.sh

SketchyBar uses `0xAARRGGBB` format (alpha + RGB). Convert: `#RRGGBB` → `0xffRRGGBB`

```bash
#!/bin/bash
export COLOR_BACKGROUND="0xff1e1e2e"
export COLOR_FOREGROUND="0xffcdd6f4"
export COLOR_ACCENT="0xff89b4fa"
export COLOR_SELECTION="0xff585b70"
export COLOR_BORDER="0xff585b70"
export BAR_COLOR="0xff1e1e2e"
export BAR_BORDER_COLOR="0xff585b70"
export ITEM_BG_COLOR="0xff585b70"
export ICON_COLOR="0xff89b4fa"
export LABEL_COLOR="0xffcdd6f4"
export COLOR_BLACK="0xff45475a"
export COLOR_RED="0xfff38ba8"
export COLOR_GREEN="0xffa6e3a1"
export COLOR_YELLOW="0xfff9e2af"
export COLOR_BLUE="0xff89b4fa"
export COLOR_MAGENTA="0xfff5c2e7"
export COLOR_CYAN="0xff94e2d5"
export COLOR_WHITE="0xffbac2de"
export COLOR_BRIGHT_BLACK="0xff585b70"
export COLOR_BRIGHT_RED="0xfff38ba8"
export COLOR_BRIGHT_GREEN="0xffa6e3a1"
export COLOR_BRIGHT_YELLOW="0xfff9e2af"
export COLOR_BRIGHT_BLUE="0xff89b4fa"
export COLOR_BRIGHT_MAGENTA="0xfff5c2e7"
export COLOR_BRIGHT_CYAN="0xff94e2d5"
export COLOR_BRIGHT_WHITE="0xffa6adc8"
export COLOR_TRANSPARENT="0x801e1e2e"
export COLOR_SEMI_TRANSPARENT="0xcc1e1e2e"
```

Reload after changes: `sketchybar --reload`

## aerospace-borders.sh

JankyBorders for AeroSpace window manager. Also uses `0xAARRGGBB` format.

```bash
#!/bin/bash
ACTIVE_COLOR="0xff89b4fa"
INACTIVE_COLOR="0xff585b70"
BORDER_WIDTH="5.0"

pkill -x borders 2>/dev/null || true
sleep 0.2

BORDERS_BIN=""
if [ -x "/opt/homebrew/bin/borders" ]; then
  BORDERS_BIN="/opt/homebrew/bin/borders"
elif [ -x "/usr/local/bin/borders" ]; then
  BORDERS_BIN="/usr/local/bin/borders"
elif command -v borders >/dev/null 2>&1; then
  BORDERS_BIN="borders"
fi

if [ -n "$BORDERS_BIN" ]; then
  nohup "$BORDERS_BIN" active_color="$ACTIVE_COLOR" inactive_color="$INACTIVE_COLOR" width="$BORDER_WIDTH" >/dev/null 2>&1 &
  disown
fi
```

## kitty.conf

Kitty terminal uses `#RRGGBB` format with `colorN` for ANSI colors.

```conf
background #1e1e2e
foreground #cdd6f4
cursor #f5e0dc
selection_background #585b70
selection_foreground #cdd6f4

# Black
color0 #45475a
color8 #585b70

# Red
color1 #f38ba8
color9 #f38ba8

# Green
color2 #a6e3a1
color10 #a6e3a1

# Yellow
color3 #f9e2af
color11 #f9e2af

# Blue
color4 #89b4fa
color12 #89b4fa

# Magenta
color5 #f5c2e7
color13 #f5c2e7

# Cyan
color6 #94e2d5
color14 #94e2d5

# White
color7 #bac2de
color15 #a6adc8
```

## wezterm.lua

WezTerm uses Lua table format with `#RRGGBB` strings.

```lua
return {
  foreground = "#cdd6f4",
  background = "#1e1e2e",
  cursor_bg = "#f5e0dc",
  cursor_fg = "#1e1e2e",
  cursor_border = "#f5e0dc",
  selection_bg = "#585b70",
  selection_fg = "#cdd6f4",
  scrollbar_thumb = "#585b70",
  split = "#585b70",

  ansi = {
    "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af",
    "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
  },
  brights = {
    "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af",
    "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
  },

  tab_bar = {
    background = "#1e1e2e",
    active_tab = { bg_color = "#585b70", fg_color = "#cdd6f4" },
    inactive_tab = { bg_color = "#1e1e2e", fg_color = "#585b70" },
    inactive_tab_hover = { bg_color = "#585b70", fg_color = "#cdd6f4" },
    new_tab = { bg_color = "#1e1e2e", fg_color = "#585b70" },
    new_tab_hover = { bg_color = "#585b70", fg_color = "#cdd6f4" },
  },
}
```

## neovim.lua

Neovim highlight groups using vim.cmd.

```lua
vim.cmd([[
  hi Normal guibg=#1e1e2e guifg=#cdd6f4
  hi Cursor guibg=#f5e0dc
  hi Visual guibg=#585b70
  hi LineNr guifg=#585b70
  hi CursorLine guibg=#585b70
  hi Comment guifg=#585b70
  hi String guifg=#a6e3a1
  hi Function guifg=#89b4fa
  hi Keyword guifg=#f5c2e7
  hi Type guifg=#f9e2af
  hi Constant guifg=#94e2d5
]])
```

## starship.toml

Starship prompt uses TOML with `#RRGGBB` strings in style fields.

```toml
format = """
[┌───────────────────>](#89b4fa)
[│](#89b4fa)$directory$git_branch$git_status
[└─>](#89b4fa) """

[directory]
style = "#89b4fa"
truncation_length = 3
truncate_to_repo = true

[git_branch]
symbol = " "
style = "#f5c2e7"

[git_status]
style = "#f38ba8"
```

## cursor.json / vscode.json

VS Code/Cursor color customizations. Uses `#RRGGBB` format.

```json
{
  "workbench.colorTheme": "Generated Theme",
  "workbench.colorCustomizations": {
    "editor.background": "#1e1e2e",
    "editor.foreground": "#cdd6f4",
    "editorCursor.foreground": "#f5e0dc",
    "editor.selectionBackground": "#585b70",
    "editorLineNumber.foreground": "#585b70",
    "editorLineNumber.activeForeground": "#cdd6f4",
    "editor.lineHighlightBackground": "#585b70",
    "sideBar.background": "#1e1e2e",
    "sideBar.foreground": "#cdd6f4",
    "activityBar.background": "#1e1e2e",
    "activityBar.foreground": "#cdd6f4",
    "statusBar.background": "#1e1e2e",
    "statusBar.foreground": "#cdd6f4",
    "titleBar.activeBackground": "#1e1e2e",
    "titleBar.activeForeground": "#cdd6f4",
    "tab.activeBackground": "#585b70",
    "tab.activeForeground": "#cdd6f4",
    "tab.inactiveBackground": "#1e1e2e",
    "tab.inactiveForeground": "#585b70",
    "terminal.background": "#1e1e2e",
    "terminal.foreground": "#cdd6f4",
    "terminalCursor.foreground": "#f5e0dc",
    "terminal.ansiBlack": "#45475a",
    "terminal.ansiRed": "#f38ba8",
    "terminal.ansiGreen": "#a6e3a1",
    "terminal.ansiYellow": "#f9e2af",
    "terminal.ansiBlue": "#89b4fa",
    "terminal.ansiMagenta": "#f5c2e7",
    "terminal.ansiCyan": "#94e2d5",
    "terminal.ansiWhite": "#bac2de",
    "terminal.ansiBrightBlack": "#585b70",
    "terminal.ansiBrightRed": "#f38ba8",
    "terminal.ansiBrightGreen": "#a6e3a1",
    "terminal.ansiBrightYellow": "#f9e2af",
    "terminal.ansiBrightBlue": "#89b4fa",
    "terminal.ansiBrightMagenta": "#f5c2e7",
    "terminal.ansiBrightCyan": "#94e2d5",
    "terminal.ansiBrightWhite": "#a6adc8",
    "input.background": "#585b70",
    "input.foreground": "#cdd6f4",
    "focusBorder": "#89b4fa",
    "list.activeSelectionBackground": "#585b70",
    "list.activeSelectionForeground": "#cdd6f4",
    "button.background": "#89b4fa",
    "button.foreground": "#1e1e2e",
    "badge.background": "#89b4fa",
    "badge.foreground": "#1e1e2e"
  }
}
```
