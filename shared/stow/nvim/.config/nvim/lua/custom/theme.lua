-- Load ricekit theme if available, otherwise fall back to built-in
local ok = pcall(vim.cmd.colorscheme, "ricekit")
if not ok then
    vim.cmd.colorscheme("habamax")
end
