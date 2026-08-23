-- Match the apparent size of UI and text across the 1440p and 4K displays.

local omarchy_gdk_scale = 2

hl.env("GDK_SCALE", tostring(omarchy_gdk_scale))
hl.monitor({ output = "DP-2", mode = "2560x1440@164.83", position = "0x0", scale = 1.333333 })
hl.monitor({ output = "DP-3", mode = "3840x2160@60", position = "1920x0", scale = 2 })
