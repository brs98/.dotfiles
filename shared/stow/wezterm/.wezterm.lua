-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

config.enable_wayland = false

-- Ricekit v2 WezTerm integration (macOS only, pcall guards for Linux)
local ricekit_colors = wezterm.home_dir .. "/.config/ricekit/active/wezterm/ricekit-colors.lua"
wezterm.add_to_config_reload_watch_list(ricekit_colors)

-- Watch AeroSpace state file for fullscreen and opacity toggles
local wezterm_state_file = wezterm.home_dir .. "/.config/aerospace/wezterm-fullscreen-state.lua"
wezterm.add_to_config_reload_watch_list(wezterm_state_file)

local ok, colors = pcall(dofile, ricekit_colors)
if ok and colors then
	config.colors = colors

	-- Fix tab bar contrast (Ricekit's tab_bar colors have poor contrast)
	config.colors.tab_bar = {
		background = "transparent",
		active_tab = {
			bg_color = "transparent",
			fg_color = config.colors.ansi[7],
		},
		inactive_tab = {
			bg_color = "transparent",
			fg_color = config.colors.ansi[8],
		},
		inactive_tab_hover = {
			bg_color = config.colors.selection_bg,
			fg_color = config.colors.ansi[8],
		},
		new_tab = {
			bg_color = "transparent",
			fg_color = config.colors.ansi[7],
		},
		new_tab_hover = {
			bg_color = config.colors.selection_bg,
			fg_color = config.colors.ansi[8],
		},
	}

	config.colors.split = config.colors.ansi[5]
end

-- Dim inactive panes (useful with or without ricekit)
config.inactive_pane_hsb = {
	saturation = 0.7,
	brightness = 0.5,
}

config.use_fancy_tab_bar = false
config.tab_bar_at_bottom = true
config.tab_max_width = 32
config.audible_bell = "Disabled"

-- Claude Code alert: toast notification when waiting for input
wezterm.on("user-var-changed", function(window, pane, name, value)
	if name == "claude_status" and value ~= "" then
		local messages = {
			permission = "Needs permission approval",
			idle = "Waiting for your input",
		}
		window:toast_notification("Claude Code", messages[value] or "Needs attention", nil, 5000)
	end
end)

-- Toggle opacity based on the opaque flag in the state file.
-- Both fullscreen-toggle.sh and opacity-toggle.sh write to this flag.
wezterm.on("window-config-reloaded", function(window, pane)
	local ok, state = pcall(dofile, wezterm_state_file)
	local overrides = window:get_config_overrides() or {}
	if ok and state and state.opaque then
		overrides.window_background_opacity = 1.0
	else
		overrides.window_background_opacity = nil
	end
	window:set_config_overrides(overrides)
end)

-- Custom tab title: "1 → zsh" (respects explicitly set tab titles)
wezterm.on("format-tab-title", function(tab, _, _, _, _, max_width)
	local title = tab.tab_title
	if not title or title == "" then
		title = tab.active_pane.title
	end
	local index = tab.tab_index + 1
	local formatted = index .. " → " .. title
	if #formatted > max_width - 2 then
		formatted = wezterm.truncate_right(formatted, max_width - 3) .. "…"
	end
	return " " .. formatted .. " "
end)

config.font = wezterm.font("Hack Nerd Font")

-- Adaptive font size based on platform and screen
local font_size = 14.0
if wezterm.target_triple:find("darwin") then
	font_size = 18.0 -- Slightly larger on macOS
elseif wezterm.target_triple:find("linux") then
	font_size = 14.0 -- Standard size on Linux with DPI scaling
end
config.font_size = font_size

-- Better default window size
config.initial_cols = 120
config.initial_rows = 35

-- Window configuration
config.window_decorations = "RESIZE"
config.window_background_opacity = 0.75
config.enable_kitty_keyboard = true
config.enable_csi_u_key_encoding = false

-- macOS-specific improvements
if wezterm.target_triple:find("darwin") then
	config.native_macos_fullscreen_mode = false
	config.use_dead_keys = false
	-- Treat Option as raw modifier for keybindings (disables special character input via Option+key)
	config.send_composed_key_when_left_alt_is_pressed = false
	config.send_composed_key_when_right_alt_is_pressed = false
end

-- Better text rendering
config.freetype_load_target = "Normal"
config.freetype_render_target = "HorizontalLcd"

-- Listen for workspace updates and update the status bar
-- wezterm.on("update-status", function(window, _)
-- 	local status = wezterm.format({
-- 		{ Attribute = { Intensity = "Bold" } },
-- 		{ Foreground = { AnsiColor = "Purple" } },
-- 		{ Text = "  " .. window:active_workspace() .. "  " },
-- 	})
-- 	window:set_right_status(status)
-- end)

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
config.keys = { -- Create new tab
	{
		key = "t",
		mods = "CTRL",
		action = act.SpawnTab("CurrentPaneDomain"),
	},
	{ key = "Enter", mods = "SHIFT", action = wezterm.action({ SendString = "\x1b\r" }) },
	-- Close tab
	{
		key = "w",
		mods = "CTRL",
		action = wezterm.action.CloseCurrentTab({ confirm = true }),
	},
	-- Move tab to the left
	{ key = "LeftArrow", mods = "SUPER|CTRL", action = act.MoveTabRelative(-1) },

	-- Move tab to the right
	{ key = "RightArrow", mods = "SUPER|CTRL", action = act.MoveTabRelative(1) },

	-- Switch to default workspace
	{
		key = "1",
		mods = "SUPER|ALT",
		action = act.SwitchToWorkspace({
			name = "default",
		}),
	},
	-- Switch to .dotfiles workspace
	{
		key = "2",
		mods = "SUPER|ALT",
		action = act.SwitchToWorkspace({
			name = ".dotfiles",
			spawn = {
				cwd = wezterm.home_dir .. "/.dotfiles",
			},
		}),
	},
	-- Switch to work workspace
	-- {
	-- 	key = "3",
	-- 	mods = "SUPER|ALT",
	-- 	action = act.SwitchToWorkspace({
	-- 		name = "Work",
	-- 		spawn = {
	-- 			args = { os.getenv("SHELL"), "-c", "cd ~/work && nvim" },
	-- 		},
	-- 	}),
	-- },
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
