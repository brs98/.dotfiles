-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()
local is_macos = wezterm.target_triple:find("darwin") ~= nil
local is_linux = wezterm.target_triple:find("linux") ~= nil
local primary_mods = is_linux and "CTRL|SHIFT" or "SUPER"
local primary_alt_mods = is_linux and "CTRL|ALT" or "SUPER|ALT"
local move_tab_mods = is_linux and "CTRL|SHIFT" or "SUPER|CTRL"
local move_tab_previous_key = is_linux and "PageUp" or "LeftArrow"
local move_tab_next_key = is_linux and "PageDown" or "RightArrow"

-- Use the native compositor on Omarchy while leaving the macOS backend alone.
if is_linux then
	config.enable_wayland = true
end

if is_macos then
	-- Ricekit v2 WezTerm integration.
	local ricekit_colors = wezterm.home_dir .. "/.config/ricekit/active/wezterm/ricekit-colors.lua"
	wezterm.add_to_config_reload_watch_list(ricekit_colors)

	-- Watch AeroSpace state for fullscreen and opacity toggles.
	local wezterm_state_file = wezterm.home_dir .. "/.config/aerospace/wezterm-fullscreen-state.lua"
	wezterm.add_to_config_reload_watch_list(wezterm_state_file)

	local ok, colors = pcall(dofile, ricekit_colors)
	if ok and colors then
		config.colors = colors

		-- Fix tab bar contrast (Ricekit's tab_bar colors have poor contrast).
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

		-- Split color is already set by Ricekit ({{border}} with accent tint).
	end

	wezterm.on("window-config-reloaded", function(window, _)
		local state_ok, state = pcall(dofile, wezterm_state_file)
		local overrides = window:get_config_overrides() or {}
		if state_ok and state and state.opaque then
			overrides.window_background_opacity = 1.0
		else
			overrides.window_background_opacity = nil
		end
		window:set_config_overrides(overrides)
	end)
end

-- Omarchy generates this Lua color table from the active theme whenever its
-- theme is changed. Keep it Linux-only so macOS continues to use Ricekit.
if is_linux then
	local omarchy_colors = wezterm.home_dir .. "/.local/state/omarchy/current/theme/wezterm.lua"
	wezterm.add_to_config_reload_watch_list(omarchy_colors)

	local ok, colors = pcall(dofile, omarchy_colors)
	if ok and colors then
		config.colors = colors
	end
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

if is_linux then
	-- Match Omarchy's installed terminal font family.
	config.font = wezterm.font("CaskaydiaMono Nerd Font Mono")
else
	config.font = wezterm.font("Hack Nerd Font")
end

-- Linux is running under Hyprland's display scaling, so a smaller point size
-- matches the visual scale of the macOS configuration.
local font_size = 14.0
if is_macos then
	font_size = 16.0 -- Slightly larger on macOS
elseif is_linux then
	font_size = 12.0
end
config.font_size = font_size

-- Hyprland controls Linux window geometry; these dimensions are useful on macOS.
if is_macos then
	config.initial_cols = 120
	config.initial_rows = 35
end

-- Hyprland supplies window management, including resize gestures, so omit
-- WezTerm's client-side titlebar and its close/maximize controls on Linux.
config.window_decorations = is_linux and "NONE" or "RESIZE"
config.window_background_opacity = 0.75
-- Herdr currently drops Escape when WezTerm enables Kitty keyboard reporting.
config.enable_kitty_keyboard = false
config.enable_csi_u_key_encoding = false

-- macOS-specific improvements
if is_macos then
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

local function is_herdr(pane)
	local process_path = pane:get_foreground_process_name() or ""
	local process_name = process_path:match("([^/\\]+)$") or process_path
	local pane_title = (pane:get_title() or ""):lower()
	return process_name == "herdr" or process_name == "herdr.exe" or pane_title == "herdr"
end

-- Keep the same physical WezTerm shortcuts while Herdr owns the inner panes.
-- Raw prefix sequences remain unambiguous with Kitty keyboard reporting off.
local function route_to_herdr(default_action, herdr_key)
	return wezterm.action_callback(function(window, pane)
		if is_herdr(pane) then
			pane:send_text("\x02" .. herdr_key)
			return
		end

		window:perform_action(default_action, pane)
	end)
end

local function route_key_to_herdr(default_action, key, mods)
	return wezterm.action_callback(function(window, pane)
		if is_herdr(pane) then
			window:perform_action(act.SendKey({ key = key, mods = mods }), pane)
			return
		end

		window:perform_action(default_action, pane)
	end)
end

local function resolve_herdr_cli()
	local candidates = {
		wezterm.home_dir .. "/.local/bin/herdr",
		"/opt/homebrew/bin/herdr",
		"/usr/local/bin/herdr",
		"/usr/bin/herdr",
	}

	for _, candidate in ipairs(candidates) do
		local file = io.open(candidate, "r")
		if file then
			file:close()
			return candidate
		end
	end

	-- This still supports installations exposed through the GUI app's PATH.
	return "herdr"
end

local herdr_cli = resolve_herdr_cli()

local function focus_herdr_index(default_action, kind, index)
	return wezterm.action_callback(function(window, pane)
		if not is_herdr(pane) then
			window:perform_action(default_action, pane)
			return
		end

		local ok, stdout, stderr = wezterm.run_child_process({ herdr_cli, kind, "list" })
		if not ok then
			wezterm.log_error("Failed to list Herdr " .. kind .. "s: " .. stderr)
			return
		end

		local result = wezterm.json_parse(stdout).result
		local items = kind == "workspace" and result.workspaces or result.agents
		local item = items[index]
		if not item then
			return
		end

		local target = kind == "workspace" and item.workspace_id or item.terminal_id
		local focused, _, focus_stderr = wezterm.run_child_process({ herdr_cli, kind, "focus", target })
		if not focused then
			wezterm.log_error("Failed to focus Herdr " .. kind .. ": " .. focus_stderr)
		end
	end)
end

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
		action = route_to_herdr(act.SpawnTab("CurrentPaneDomain"), "c"),
	},
	{
		key = "t",
		mods = primary_mods,
		action = route_to_herdr(act.SpawnTab("CurrentPaneDomain"), "c"),
	},
	{ key = "Enter", mods = "SHIFT", action = wezterm.action({ SendString = "\x1b\r" }) },
	-- Close tab
	{
		key = "w",
		mods = "CTRL",
		action = route_to_herdr(act.CloseCurrentTab({ confirm = true }), "X"),
	},
	-- Move tab to the left
	{ key = move_tab_previous_key, mods = move_tab_mods, action = act.MoveTabRelative(-1) },

	-- Move tab to the right
	{ key = move_tab_next_key, mods = move_tab_mods, action = act.MoveTabRelative(1) },

	-- Switch to default workspace
	{
		key = "1",
		mods = primary_alt_mods,
		action = switch_with_reload("default"),
	},
	-- Switch to .dotfiles workspace
	{
		key = "2",
		mods = primary_alt_mods,
		action = switch_with_reload(".dotfiles", {
			cwd = wezterm.home_dir .. "/.dotfiles",
		}),
	},
	-- Switch to work workspace
	-- {
	-- 	key = "3",
	-- 	mods = primary_alt_mods,
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
		mods = primary_alt_mods,
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
		mods = primary_alt_mods,
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

	{ key = "phys:1", mods = "ALT", action = focus_herdr_index(act.ActivateTab(0), "agent", 1) },
	{ key = "phys:2", mods = "ALT", action = focus_herdr_index(act.ActivateTab(1), "agent", 2) },
	{ key = "phys:3", mods = "ALT", action = focus_herdr_index(act.ActivateTab(2), "agent", 3) },
	{ key = "phys:4", mods = "ALT", action = focus_herdr_index(act.ActivateTab(3), "agent", 4) },
	{ key = "phys:5", mods = "ALT", action = focus_herdr_index(act.ActivateTab(4), "agent", 5) },
	{ key = "phys:6", mods = "ALT", action = focus_herdr_index(act.ActivateTab(5), "agent", 6) },
	{ key = "phys:7", mods = "ALT", action = focus_herdr_index(act.ActivateTab(6), "agent", 7) },
	{ key = "phys:8", mods = "ALT", action = focus_herdr_index(act.ActivateTab(7), "agent", 8) },
	{ key = "phys:9", mods = "ALT", action = focus_herdr_index(act.ActivateTab(8), "agent", 9) },
	{ key = "0", mods = "ALT", action = act.ActivateTab(9) },

	-- Option+number focuses Herdr agents. Primary+Option+number switches
	-- workspaces in panel order (Command on macOS, Control on Linux).
	{ key = "phys:1", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "1", mods = primary_alt_mods }), "workspace", 1) },
	{ key = "phys:2", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "2", mods = primary_alt_mods }), "workspace", 2) },
	{ key = "phys:3", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "3", mods = primary_alt_mods }), "workspace", 3) },
	{ key = "phys:4", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "4", mods = primary_alt_mods }), "workspace", 4) },
	{ key = "phys:5", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "5", mods = primary_alt_mods }), "workspace", 5) },
	{ key = "phys:6", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "6", mods = primary_alt_mods }), "workspace", 6) },
	{ key = "phys:7", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "7", mods = primary_alt_mods }), "workspace", 7) },
	{ key = "phys:8", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "8", mods = primary_alt_mods }), "workspace", 8) },
	{ key = "phys:9", mods = primary_alt_mods, action = focus_herdr_index(act.SendKey({ key = "9", mods = primary_alt_mods }), "workspace", 9) },

	{
		key = "LeftArrow",
		mods = "ALT",
		action = route_to_herdr(navigate_pane_or_tab("Left"), "h"),
	},
	{
		key = "RightArrow",
		mods = "ALT",
		action = route_to_herdr(navigate_pane_or_tab("Right"), "l"),
	},
	{
		key = "h",
		mods = "ALT",
		action = route_to_herdr(navigate_pane_or_tab("Left"), "h"),
	},
	{
		key = "l",
		mods = "ALT",
		action = route_to_herdr(navigate_pane_or_tab("Right"), "l"),
	},
	{
		key = "DownArrow",
		mods = "ALT",
		action = route_to_herdr(act.ActivatePaneDirection("Down"), "j"),
	},
	{
		key = "UpArrow",
		mods = "ALT",
		action = route_to_herdr(act.ActivatePaneDirection("Up"), "k"),
	},

	{
		key = "RightArrow",
		mods = primary_alt_mods,
		action = route_to_herdr(act.SplitHorizontal({ domain = "CurrentPaneDomain" }), "v"),
	},
	{
		key = "DownArrow",
		mods = primary_alt_mods,
		action = route_to_herdr(act.SplitVertical({ domain = "CurrentPaneDomain" }), "-"),
	},
	{
		key = "x",
		mods = primary_alt_mods,
		action = route_to_herdr(act.CloseCurrentPane({ confirm = true }), "x"),
	},
	{
		key = "k",
		mods = primary_mods,
		action = route_key_to_herdr(
			act.Multiple({
				act.ClearScrollback("ScrollbackAndViewport"),
				act.SendKey({ key = "L", mods = "CTRL" }),
			}),
			"L",
			"CTRL"
		),
	},
	-- Scrollback controls for compact keyboards without Page Up/Page Down.
	{ key = "UpArrow", mods = "CTRL|SHIFT", action = act.ScrollByPage(-1) },
	{ key = "DownArrow", mods = "CTRL|SHIFT", action = act.ScrollByPage(1) },
	{ key = "Home", mods = "CTRL|SHIFT", action = act.ScrollToTop },
	{ key = "End", mods = "CTRL|SHIFT", action = act.ScrollToBottom },
	{ key = "L", mods = "SHIFT|CTRL", action = act.ShowDebugOverlay },
	{ key = "P", mods = "SHIFT|CTRL", action = act.ActivateCommandPalette },
	{ key = "R", mods = "SHIFT|CTRL", action = act.ReloadConfiguration },

	{ key = "X", mods = "CTRL", action = act.ActivateCopyMode },
	{ key = "f", mods = primary_mods, action = act.Search("CurrentSelectionOrEmptyString") },
	{
		-- Herdr cannot preserve Command while WezTerm's modern keyboard protocols
		-- are disabled, so use Neovim's equivalent Ctrl+S mapping in Herdr panes.
		key = "s",
		mods = primary_mods,
		action = route_key_to_herdr(act.SendKey({ key = "s", mods = primary_mods }), "s", "CTRL"),
	},
	{ key = "v", mods = primary_mods, action = act.PasteFrom("Clipboard") },
	{
		key = "w",
		mods = primary_mods,
		action = route_to_herdr(act.CloseCurrentTab({ confirm = true }), "X"),
	},
	{
		key = "Z",
		mods = "SHIFT|CTRL",
		action = route_to_herdr(act.TogglePaneZoomState, "z"),
	},
	{ key = "x", mods = "SHIFT|CTRL", action = act.ActivateCopyMode },

	{ key = "LeftArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Left", 1 }) },
	{ key = "RightArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Right", 1 }) },
	{ key = "UpArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Up", 1 }) },
	{ key = "DownArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Down", 1 }) },
}

-- Omarchy's SUPER+C / SUPER+V "universal clipboard" bindings don't paste on
-- their own — default/hypr/bindings/clipboard.lua synthesizes a chord, and picks
-- which one from the window's "terminal" tag: tagged windows get Ctrl+Insert /
-- Shift+Insert, everything else gets Ctrl+C / Ctrl+V.
--
-- Those Insert chords only reach the CLIPBOARD because Omarchy ships a foot.ini
-- that remaps them. Every terminal's stock binding sends them to the PRIMARY
-- selection instead — WezTerm, Ghostty and Alacritty all do. Omarchy tags foot,
-- ghostty, kitty and wezterm as terminals but only ships that config for foot,
-- so tagging WezTerm (see hypr/bindings.lua) routes SUPER+C/V onto chords that
-- would otherwise hit PRIMARY. Mirror foot's [key-bindings] block here:
--
--   clipboard-copy=Control+Insert Control+Shift+c XF86Copy
--   primary-paste=none
--   clipboard-paste=Shift+Insert Control+Shift+v XF86Paste
if is_linux then
	table.insert(config.keys, { key = "Insert", mods = "SHIFT", action = act.PasteFrom("Clipboard") })
	table.insert(config.keys, { key = "Insert", mods = "CTRL", action = act.CopyTo("Clipboard") })

	-- foot's `primary-paste=none` also unbinds middle-click. Drop this block to
	-- keep WezTerm's stock middle-click-pastes-PRIMARY behaviour.
	config.mouse_bindings = {
		{ event = { Down = { streak = 1, button = "Middle" } }, mods = "NONE", action = act.Nop },
	}
end

-- and finally, return the configuration to wezterm
return config
