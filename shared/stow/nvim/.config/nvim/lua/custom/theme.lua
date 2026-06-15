local ok = pcall(vim.cmd.colorscheme, "ricekit")
if not ok then
	vim.cmd.colorscheme("habamax")
end
