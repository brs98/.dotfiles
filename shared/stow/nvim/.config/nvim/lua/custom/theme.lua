-- Theme is set by:
--   macOS: ricekit symlink at colors/ricekit.lua
--   Linux: omarchy plugin at plugins/theme.lua (stowed from linux/stow/nvim-theme)
-- This fallback only fires if neither is present.
local ok = pcall(vim.cmd.colorscheme, "ricekit")
if not ok then
    vim.cmd.colorscheme("habamax")
end
