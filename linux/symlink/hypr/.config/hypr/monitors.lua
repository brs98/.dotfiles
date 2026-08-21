-- Personal monitor overrides loaded after Omarchy's defaults.

hl.env("GDK_SCALE", "2")
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = 2 })

-- Office monitors.
hl.monitor({ output = "DP-3", mode = "preferred", position = "auto", scale = 2 })
hl.monitor({ output = "DP-4", mode = "preferred", position = "auto", scale = 1.5 })

-- Mirror the AeroSpace layout: numbered workspaces live on the primary
-- external display. DP-4 is the connected Samsung Odyssey G5.
for workspace = 1, 9 do
	hl.workspace_rule({ workspace = tostring(workspace), monitor = "DP-4" })
end

-- Workspace 10 is intentionally left unpinned while only one external
-- display is connected. Pin it to the right-hand external once it is
-- connected and its Hyprland connector is known.
