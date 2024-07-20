-- Highlight when yanking (copying) text
vim.api.nvim_create_autocmd("TextYankPost", {
	desc = "Highlight when yanking (copying) text",
	group = vim.api.nvim_create_augroup("highlight-yank", { clear = true }),
	callback = function()
		vim.highlight.on_yank()
	end,
})

-- Use a single statusline for all windows
-- This is only in an autocommand because it needs to be set after the statusline is set
-- vim.api.nvim_create_autocmd("WinEnter", {
-- 	desc = "Set statusline",
-- 	group = vim.api.nvim_create_augroup("set-statusline", { clear = true }),
-- 	callback = function()
-- 		vim.opt.laststatus = 3
-- 	end,
-- })
