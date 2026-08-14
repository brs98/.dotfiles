-- Personal monitor overrides loaded after Omarchy's defaults.

hl.env("GDK_SCALE", "2")
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })

-- Office monitor.
hl.monitor({ output = "DP-3", mode = "preferred", position = "auto", scale = 2 })

-- Keep workspaces 6-10 on the office monitor when it is connected.
for workspace = 6, 10 do
  hl.workspace_rule({ workspace = tostring(workspace), monitor = "DP-3" })
end
