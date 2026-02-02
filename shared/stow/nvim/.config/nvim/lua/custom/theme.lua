local theme_path = vim.fn.expand("~/Library/Application Support/Ricekit/current/theme/neovim.lua")

local function load_theme()
	dofile(theme_path)
	vim.api.nvim_exec_autocmds("User", { pattern = "ThemeLoaded" })
end

vim.api.nvim_create_autocmd("UIEnter", {
	callback = load_theme,
	once = true,
})

vim.api.nvim_create_autocmd("FocusGained", {
	callback = load_theme,
})
