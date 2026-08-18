-- Personal keybindings loaded after Omarchy's defaults.
-- Most bindings from the previous config are Omarchy 4 defaults now, so only
-- keep the binding that Omarchy does not provide.

o.bind("SUPER + SHIFT + R", "RetroArch", "omarchy-launch-or-focus retroarch")

-- Clear the clipboard (cliptail). No restart bind: clicking the bar widget
-- restarts the daemon, and SUPER + SHIFT + R is RetroArch above.
o.bind("SUPER + SHIFT + V", "Clear clipboard", "omarchy-shell cliptail clear")

-- Tag WezTerm as a terminal. Omarchy's default/hypr/apps/terminals.lua matches
-- the literal "wezterm", but WezTerm's actual app-id is "org.wezfurlong.wezterm"
-- and the class is matched in full, so the tag never applied.
--
-- This tag is load-bearing in a non-obvious way. default/hypr/bindings/clipboard.lua
-- sends tagged windows Ctrl+Insert / Shift+Insert and everything else Ctrl+C /
-- Ctrl+V. Those Insert chords only reach the CLIPBOARD because Omarchy ships a
-- foot.ini that remaps them; stock, every terminal sends Shift+Insert to the
-- PRIMARY selection. So tagging WezTerm REQUIRES the matching remap in
-- ~/.wezterm.lua (see the is_linux clipboard block there) -- without it SUPER+V
-- pastes PRIMARY and SUPER+C copies to PRIMARY. Remove one, remove both.
o.window("org\\.wezfurlong\\.wezterm", { tag = "+terminal" })
