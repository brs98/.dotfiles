#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
herdr_config="$repo_root/shared/stow/herdr/.config/herdr/config.toml"
wezterm_config="$repo_root/shared/stow/wezterm/.wezterm.lua"

python3 - "$herdr_config" <<'PY'
import pathlib
import sys
import tomllib

config = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())
assert config["keys"]["focus_agent"] == "alt+1..9"
assert set(config["keys"]["switch_workspace"]) == {
    "super+alt+1..9",
    "ctrl+alt+1..9",
}
PY

lua - "$wezterm_config" <<'LUA'
local config_path = arg[1]
local callbacks = {}
local child_process_calls = {}

local action = setmetatable({}, {
	__index = function(table, name)
		local factory = function(value)
			return { kind = name, value = value }
		end
		rawset(table, name, factory)
		return factory
	end,
	__call = function(_, value)
		return { kind = "action", value = value }
	end,
})

local wezterm = {
	action = action,
	home_dir = "/nonexistent-herdr-routing-test-home",
	mux = {
		all_windows = function() return {} end,
		get_workspace_names = function() return {} end,
	},
	target_triple = "aarch64-apple-darwin",
}

function wezterm.action_callback(callback)
	return { kind = "callback", callback = callback }
end

function wezterm.add_to_config_reload_watch_list(_) end
function wezterm.config_builder() return {} end
function wezterm.font(value) return value end
function wezterm.format(_) return "" end
function wezterm.json_parse(_) return {} end
function wezterm.log_error(_) end
function wezterm.on(name, callback) callbacks[name] = callback end
function wezterm.truncate_right(value, _) return value end
function wezterm.run_child_process(arguments)
	table.insert(child_process_calls, arguments)
	return false, "", "unexpected child process"
end

package.preload["wezterm"] = function() return wezterm end
local config = dofile(config_path)

local binding
for _, candidate in ipairs(config.keys) do
	if candidate.key == "phys:2" and candidate.mods == "ALT" then
		binding = candidate
		break
	end
end
assert(binding, "Alt+2 binding is missing")

local performed = {}
local window = {}
function window:perform_action(requested_action, pane)
	table.insert(performed, { action = requested_action, pane = pane })
end

local pane = {}
function pane:get_foreground_process_name() return "/usr/local/bin/herdr" end
function pane:get_title() return "herdr" end

binding.action.callback(window, pane)

assert(#child_process_calls == 0, "Alt+2 must not launch a session-ambiguous Herdr CLI process")
assert(#performed == 1, "Alt+2 must forward one action to the focused Herdr client")
assert(performed[1].pane == pane, "Alt+2 must target the focused Herdr pane")
assert(performed[1].action.kind == "SendKey", "Alt+2 must forward a key event")
assert(performed[1].action.value.key == "2", "Alt+2 must preserve the selected index")
assert(performed[1].action.value.mods == "ALT", "Alt+2 must preserve the Alt modifier")

local shell_pane = {}
function shell_pane:get_foreground_process_name() return "/bin/zsh" end
function shell_pane:get_title() return "zsh" end

performed = {}
binding.action.callback(window, shell_pane)

assert(#performed == 1, "Alt+2 must preserve its fallback outside Herdr")
assert(performed[1].pane == shell_pane, "Alt+2 fallback must target the focused terminal pane")
assert(performed[1].action.kind == "ActivateTab", "Alt+2 must keep switching WezTerm tabs outside Herdr")
assert(performed[1].action.value == 1, "Alt+2 must keep selecting WezTerm tab 2 outside Herdr")

local workspace_binding
for _, candidate in ipairs(config.keys) do
	if candidate.key == "phys:3" and candidate.mods == "SUPER|ALT" then
		workspace_binding = candidate
		break
	end
end
assert(workspace_binding, "Super+Alt+3 binding is missing")

performed = {}
child_process_calls = {}
workspace_binding.action.callback(window, pane)

assert(#child_process_calls == 0, "Super+Alt+3 must not launch a session-ambiguous Herdr CLI process")
assert(#performed == 1, "Super+Alt+3 must forward one action to the focused Herdr client")
assert(performed[1].pane == pane, "Super+Alt+3 must target the focused Herdr pane")
assert(performed[1].action.kind == "SendKey", "Super+Alt+3 must forward a key event")
assert(performed[1].action.value.key == "3", "Super+Alt+3 must preserve the selected index")
assert(performed[1].action.value.mods == "SUPER|ALT", "Super+Alt+3 must preserve its modifiers")
LUA

printf 'herdr index routing tests passed\n'
