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

	-- split color is already set by ricekit ({{border}} with accent tint)
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
	font_size = 16.0 -- Slightly larger on macOS
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

-- WezTerm's file-watcher reload doesn't repaint panes outside the active
-- workspace; performing ReloadConfiguration after the switch refreshes them.
local function switch_with_reload(name, spawn)
	local switch_args = { name = name }
	if spawn then
		switch_args.spawn = spawn
	end
	return act.Multiple({
		act.SwitchToWorkspace(switch_args),
		act.ReloadConfiguration,
	})
end

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
		action = switch_with_reload("default"),
	},
	-- Switch to .dotfiles workspace
	{
		key = "2",
		mods = "SUPER|ALT",
		action = switch_with_reload(".dotfiles", {
			cwd = wezterm.home_dir .. "/.dotfiles",
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
				if line and line ~= "" then
					window:perform_action(switch_with_reload(line), pane)
				end
			end),
		}),
	},

	-- Fuzzy workspace picker. act.ShowLauncherArgs can't be intercepted to
	-- chain a post-selection action, so build the picker via InputSelector
	-- instead (lets us reload config after switching — see switch_with_reload).
	{
		key = "s",
		mods = "SUPER|ALT",
		action = wezterm.action_callback(function(window, pane)
			local current = window:active_workspace()
			-- config.colors is absent when the ricekit file didn't load
			local palette = config.colors or {}
			local ansi = palette.ansi or {}
			local accent = ansi[6] or "#d399c6"
			local muted = ansi[8] or "#808080"
			local fg = palette.foreground or "#c0c0c0"
			local bg = palette.background or "#000000"

			local tab_counts = {}
			for _, mw in ipairs(wezterm.mux.all_windows()) do
				local ws = mw:get_workspace()
				tab_counts[ws] = (tab_counts[ws] or 0) + #mw:tabs()
			end

			local names = wezterm.mux.get_workspace_names()
			local max_len = 0
			for _, ws in ipairs(names) do
				if #ws > max_len then
					max_len = #ws
				end
			end

			local choices = {}
			for _, ws in ipairs(names) do
				local is_current = (ws == current)
				local count = tab_counts[ws] or 0
				local padded = ws .. string.rep(" ", max_len - #ws + 2)
				local label = wezterm.format({
					{ Foreground = { Color = is_current and accent or fg } },
					{ Text = "▌ " },
					{ Foreground = { Color = is_current and accent or fg } },
					{ Attribute = { Intensity = is_current and "Bold" or "Normal" } },
					{ Text = padded },
					{ Attribute = { Intensity = "Normal" } },
					{ Foreground = { Color = is_current and accent or muted } },
					{ Text = "󰓩 " .. count .. (count == 1 and " tab" or " tabs") },
				})
				table.insert(choices, { id = ws, label = label })
			end

			table.insert(choices, {
				id = "__create_new__",
				label = wezterm.format({
					{ Foreground = { Color = accent } },
					{ Attribute = { Intensity = "Bold" } },
					{ Text = "  + " },
					{ Attribute = { Intensity = "Normal" } },
					{ Foreground = { Color = accent } },
					{ Text = "Create new workspace…" },
				}),
			})

			-- OSC 10 = bg makes the InputSelector's hardcoded leading 4 spaces
			-- invisible (cell-bg becomes bg color, matching the row surface) on
			-- the cursor row. The visible cursor highlight then comes from the
			-- label cells via Reverse — and my Foreground colors drive whether
			-- accent or cream shows. Per-row OSC was attempted but parse_status_text
			-- strips OSC from labels, so we set this once globally via description.
			local function hex2rgb(hex)
				return tonumber(hex:sub(2, 3), 16), tonumber(hex:sub(4, 5), 16), tonumber(hex:sub(6, 7), 16)
			end
			local fg_r, fg_g, fg_b = hex2rgb(fg)
			local bg_r, bg_g, bg_b = hex2rgb(bg)
			local description = string.format(
				"\x1b]10;rgba:00/00/00/00\x07\x1b[38;2;%d;%d;%d;48;2;%d;%d;%dm  Workspaces\x1b[0m",
				fg_r,
				fg_g,
				fg_b,
				bg_r,
				bg_g,
				bg_b
			)

			window:perform_action(
				act.InputSelector({
					action = wezterm.action_callback(function(inner_window, inner_pane, id)
						if id == "__create_new__" then
							inner_window:perform_action(
								act.PromptInputLine({
									description = wezterm.format({
										{ Attribute = { Intensity = "Bold" } },
										{ Foreground = { Color = accent } },
										{ Text = "Enter name for new workspace" },
									}),
									action = wezterm.action_callback(function(w, p, line)
										if line and line ~= "" then
											w:perform_action(switch_with_reload(line), p)
										end
									end),
								}),
								inner_pane
							)
						elseif id then
							inner_window:perform_action(switch_with_reload(id), inner_pane)
						end
					end),
					title = "  Workspaces",
					description = description,
					choices = choices,
					fuzzy = true,
				}),
				pane
			)
		end),
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
