# RiceKit Content Authoring Reference

RiceKit applies themes through **config templates** and **HTTP integrations**. Do not put app-specific files inside a theme directory; themes only define palettes and optional wallpapers.

## Config package layout

User configs live in `~/.config/ricekit/custom-configs/<name>/`. Marketplace configs are installed under `installed-configs/`.

```text
my-config/
  config.toml
  templates/
    theme.conf        # one or more template files
```

`config.toml` shape:

```toml
[metadata]
name = "my-config"
author = "Me"
version = "1.0.0"
description = "Optional"
setup_instructions = "Optional text printed after enabling"
app = "MyApp"
category = "terminal" # terminal|editor|statusbar|wm|system|browser
type = "colors"       # colors (default)|config|integration

[requires]
colors = ["background", "foreground", "accent"]

[target.macos]
path = "~/.config/myapp/theme.conf" # file target, or directory when multiple templates
strategy = "symlink"                # direct (default) or symlink

[reload.macos]
command = "myapp --reload"
```

Rendering rules:

- If `templates/` has one file and target `path` has an extension, that file renders to exactly `path`.
- Otherwise target `path` is treated as a directory and each template file keeps its filename.
- `direct` writes the rendered file directly to the target.
- `symlink` writes the active file to `~/.config/ricekit/active/<app>/<template-file>` and symlinks the target to that active file.
- After a successful write, RiceKit also saves debug copies under `~/.config/ricekit/rendered/<config-name>/<template-file>` for both strategies.

## Theme template syntax

Template expressions use `{{...}}`.

Palette variables:

```text
foreground background
black red green yellow blue magenta cyan white
bright_black bright_red bright_green bright_yellow bright_blue bright_magenta bright_cyan bright_white
accent error warning success info surface border muted
muted_foreground primary_foreground destructive_foreground accent_surface
chart_1 chart_2 chart_3 chart_4 chart_5
```

Color functions:

```text
{{darken(background, 10%)}}
{{lighten(foreground, 5%)}}
{{alpha(background, 0.8)}}
{{blend(foreground, background, 50%)}}
{{contrast(background)}}
```

Integration/body-template functions also available from the same engine:

```text
{{r(accent)}} {{g(accent)}} {{b(accent)}}      # decimal RGB components
{{to_json_string(accent)}}                    # quoted JSON string, e.g. "#7aa2f7"
{{rgb_int(accent)}}                           # 24-bit packed integer
{{rgb_int_for(accent, @srgb)}}                # profile-aware int; @self uses integration [device_profile]
{{rgb_for(accent, @srgb)}}                    # profile-aware #rrggbb
{{now_millis()}}                              # Unix epoch milliseconds
```

## Theme package layout

User themes live in `~/.config/ricekit/custom-themes/<slug>/`.

```text
my-theme/
  theme.toml
  wallpapers/
    optional.jpg
```

Full themes define every ANSI color. Overlay themes set `metadata.extends` and may define only the colors they override.

```toml
[metadata]
name = "My Theme"
author = "Me"
version = "1.0.0"
variant = "dark" # dark|light
# extends = "tokyo-night"

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
accent = "#7aa2f7"
```

## Integration package layout

Integrations resolve from `custom-integrations/` → `installed-integrations/` → `integrations/` and use `integration.toml` plus optional body templates. They do not render files; they fire HTTP requests during CLI/desktop apply.

```toml
[metadata]
name = "my-webhook"
author = "Me"
version = "1.0.0"
app = "My Service"
category = "system"
description = "Optional"

[requires]
colors = ["accent"]

[secrets.api_key]
keychain = "api_key"
prompt = "API key"

[on_apply]
method = "POST"
url = "https://example.invalid/theme?key=@@secret:api_key@@"
headers = { Content-Type = "application/json" }
body = "body.json"
timeout_ms = 5000

[on_apply.retry]
attempts = 3
backoff_ms = 250
```

Secrets use `@@secret:KEY@@` and are substituted only at request time. Store values with `ricekit secrets set <integration> <key>`.

Optional per-user condition overrides are managed by `ricekit integration condition ...` and stored separately in `~/.config/ricekit/integration-overrides/<name>.toml`.
