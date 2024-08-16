-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

config.color_scheme = "tokyonight_night"
config.font = wezterm.font("Hack Nerd Font")
config.font_size = 16.0
config.window_decorations = "RESIZE"
-- config.window_background_opacity = 0.8
config.enable_kitty_keyboard = true
config.enable_csi_u_key_encoding = false

-- Listen for workspace updates and update the status bar
wezterm.on("update-status", function(window, _)
	-- window:set_right_status(wezterm.pad_right(window:active_workspace(), 8))
	local status = wezterm.format({
		{ Attribute = { Intensity = "Bold" } },
		{ Foreground = { AnsiColor = "Purple" } },
		{ Text = "  " .. window:active_workspace() .. "  " },
	})
	window:set_right_status(status)
end)

-- Handles same key for navigating panes and tabs
local function navigate_pane_or_tab(direction)
	return wezterm.action_callback(function(window, pane)
		local tab = window:mux_window():active_tab()
		if tab:get_pane_direction(direction) ~= nil then
			window:perform_action(wezterm.action.ActivatePaneDirection(direction), pane)
		else
			window:perform_action(wezterm.action.ActivateTabRelative(direction == "Left" and -1 or 1), pane)

			-- activate the non-direction-most pane
			tab = window:mux_window():active_tab()
			local opposite_direction = direction == "Left" and "Right" or "Left"
			while tab:get_pane_direction(opposite_direction) ~= nil do
				window:perform_action(wezterm.action.ActivatePaneDirection(opposite_direction), pane)
				tab = window:mux_window():active_tab()
			end
		end
	end)
end

local act = wezterm.action
config.keys = {
	-- Move tab to the left
	{ key = "LeftArrow", mods = "SUPER|CTRL", action = act.MoveTabRelative(-1) },

	-- Move tab to the right
	{ key = "RightArrow", mods = "SUPER|CTRL", action = act.MoveTabRelative(1) },

	-- Switch to the default workspace
	{
		key = "1",
		mods = "SUPER|ALT",
		action = act.SwitchToWorkspace({
			name = "default",
		}),
	},
	-- Switch to config workspace
	{
		key = "2",
		mods = "SUPER|ALT",
		action = act.SwitchToWorkspace({
			name = "config",
			spawn = {
				args = {
					os.getenv("SHELL"),
					"-c",
					"cd ~/.dotfiles && nvim",
				},
			},
		}),
	},
	-- Switch to remi workspace
	{
		key = "3",
		mods = "SUPER|ALT",
		action = act.SwitchToWorkspace({
			name = "Remi",
			spawn = {
				args = { os.getenv("SHELL"), "-c", "cd ~/remi/roofworx-monorepo && nvim" },
			},
		}),
	},
	-- Prompt for a name to use for a new workspace and switch to it.
	{
		key = "n",
		mods = "SUPER|ALT",
		action = act.PromptInputLine({
			description = wezterm.format({
				{ Attribute = { Intensity = "Bold" } },
				{ Foreground = { AnsiColor = "Purple" } },
				{ Text = "Enter name for new workspace" },
			}),
			action = wezterm.action_callback(function(window, pane, line)
				-- line will be `nil` if they hit escape without entering anything
				-- An empty string if they just hit enter
				-- Or the actual line of text they wrote
				if line then
					window:perform_action(
						act.SwitchToWorkspace({
							name = line,
						}),
						pane
					)
				end
			end),
		}),
	},

	-- Show the launcher in fuzzy selection mode and have it list all workspaces
	-- and allow activating one.
	{
		key = "s",
		mods = "SUPER|ALT",
		action = act.ShowLauncherArgs({
			flags = "FUZZY|WORKSPACES",
		}),
	},

	{ key = "Enter", mods = "ALT", action = act.ToggleFullScreen },

	{ key = "1", mods = "ALT", action = act.ActivateTab(0) },
	{ key = "2", mods = "ALT", action = act.ActivateTab(1) },
	{ key = "3", mods = "ALT", action = act.ActivateTab(2) },
	{ key = "4", mods = "ALT", action = act.ActivateTab(3) },
	{ key = "5", mods = "ALT", action = act.ActivateTab(4) },
	{ key = "6", mods = "ALT", action = act.ActivateTab(5) },
	{ key = "7", mods = "ALT", action = act.ActivateTab(6) },
	{ key = "8", mods = "ALT", action = act.ActivateTab(7) },
	{ key = "9", mods = "ALT", action = act.ActivateTab(8) },
	{ key = "0", mods = "ALT", action = act.ActivateTab(9) },

	{
		key = "LeftArrow",
		mods = "ALT",
		action = navigate_pane_or_tab("Left"),
	},
	{
		key = "RightArrow",
		mods = "ALT",
		action = navigate_pane_or_tab("Right"),
	},
	{
		key = "h",
		mods = "ALT",
		action = navigate_pane_or_tab("Left"),
	},
	{
		key = "l",
		mods = "ALT",
		action = navigate_pane_or_tab("Right"),
	},
	{ key = "DownArrow", mods = "ALT", action = wezterm.action.ActivatePaneDirection("Down") },
	{ key = "UpArrow", mods = "ALT", action = wezterm.action.ActivatePaneDirection("Up") },

	{ key = "RightArrow", mods = "SUPER|ALT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "DownArrow", mods = "SUPER|ALT", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
	{ key = "x", mods = "SUPER|ALT", action = act.CloseCurrentPane({ confirm = true }) },
	{
		key = "k",
		mods = "SUPER",
		action = act.Multiple({
			act.ClearScrollback("ScrollbackAndViewport"),
			act.SendKey({ key = "L", mods = "CTRL" }),
		}),
	},
	{ key = "L", mods = "SHIFT|CTRL", action = act.ShowDebugOverlay },
	{ key = "P", mods = "SHIFT|CTRL", action = act.ActivateCommandPalette },
	{ key = "R", mods = "SHIFT|CTRL", action = act.ReloadConfiguration },

	{ key = "X", mods = "CTRL", action = act.ActivateCopyMode },
	{ key = "f", mods = "SUPER", action = act.Search("CurrentSelectionOrEmptyString") },
	{ key = "v", mods = "SUPER", action = act.PasteFrom("Clipboard") },
	{ key = "w", mods = "SUPER", action = act.CloseCurrentTab({ confirm = true }) },
	{ key = "x", mods = "SHIFT|CTRL", action = act.ActivateCopyMode },

	{ key = "LeftArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Left", 1 }) },
	{ key = "RightArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Right", 1 }) },
	{ key = "UpArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Up", 1 }) },
	{ key = "DownArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Down", 1 }) },
}

-- and finally, return the configuration to wezterm
return config
