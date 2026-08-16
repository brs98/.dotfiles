-- Personal keybindings loaded after Omarchy's defaults.
-- Most bindings from the previous config are Omarchy 4 defaults now, so only
-- keep the binding that Omarchy does not provide.

o.bind("SUPER + SHIFT + R", "RetroArch", "omarchy-launch-or-focus retroarch")

-- Tag WezTerm as a terminal. Omarchy's default/hypr/apps/terminals.lua matches
-- the literal "wezterm", but WezTerm's actual app-id is "org.wezfurlong.wezterm"
-- and the class is matched in full, so the tag never applied. Without it,
-- default/hypr/bindings/clipboard.lua treats WezTerm as a non-terminal and sends
-- the wrong copy/paste shortcuts.
o.window("org\\.wezfurlong\\.wezterm", { tag = "+terminal" })
