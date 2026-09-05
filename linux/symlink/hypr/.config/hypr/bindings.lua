-- Personal keybindings loaded after Omarchy's defaults.
-- Most bindings from the previous config are Omarchy 4 defaults now, so only
-- keep the binding that Omarchy does not provide.

o.bind("SUPER + SHIFT + R", "RetroArch", "omarchy-launch-or-focus retroarch")

-- Framework Laptop 13 alternatives for hardware keys absent from its keyboard.
-- Hold Super with the display-brightness keys to adjust the keyboard backlight.
-- Fn+Space also cycles the backlight directly in the laptop firmware.
o.bind("SUPER + CTRL + M", "Mute microphone", "omarchy audio input mute", { locked = true })
o.bind_toggle("SUPER + CTRL + ALT + P", "Toggle touchpad", "touchpad", { locked = true })
o.bind("SUPER + XF86MonBrightnessUp", "Keyboard brightness up", "omarchy brightness keyboard up", { locked = true, repeating = true })
o.bind("SUPER + XF86MonBrightnessDown", "Keyboard brightness down", "omarchy brightness keyboard down", { locked = true, repeating = true })

-- Instant Replay plugin controls. These use shell IPC so they survive plugin
-- updates without depending on the plugin's on-disk path.
o.bind("SUPER + ALT + R", "Arm/disarm instant replay", "omarchy-shell brs98.instant-replay toggleReplay")
o.bind("SUPER + ALT + C", "Save replay clip", "omarchy-shell brs98.instant-replay save")
o.bind("SUPER + ALT + O", "Browse replay clips", "omarchy-shell brs98.instant-replay browse")
o.bind("SUPER + ALT + V", "Open replay clips folder", "omarchy-shell brs98.instant-replay clips")

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
