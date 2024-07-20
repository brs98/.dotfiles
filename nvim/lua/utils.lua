local default_keymap_opts = { silent = true, noremap = true }

-- Function to merge two tables
local function mergeTables(t1, t2)
	local t = {}
	for k, v in pairs(t1) do
		t[k] = v
	end
	for k, v in pairs(t2) do
		t[k] = v
	end
	return t
end

local addDescription = function(desc)
	return mergeTables(default_keymap_opts, { desc = desc })
end

local utils = {
	default_keymap_opts = default_keymap_opts,
	mergeTables = mergeTables,
	addDescription = addDescription,
}

return utils
