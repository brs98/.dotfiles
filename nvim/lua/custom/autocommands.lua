-- Highlight when yanking (copying) text
vim.api.nvim_create_autocmd("TextYankPost", {
	desc = "Highlight when yanking (copying) text",
	group = vim.api.nvim_create_augroup("highlight-yank", { clear = true }),
	callback = function()
		vim.highlight.on_yank()
	end,
})

-- Auto create dir when saving a file, in case some intermediate directory does not exist
vim.api.nvim_create_autocmd({ "BufWritePre" }, {
	group = vim.api.nvim_create_augroup("auto_create_dir", { clear = true }),
	callback = function(event)
		if event.match:match("^%w%w+:[\\/][\\/]") then
			return
		end
		local file = vim.uv.fs_realpath(event.match) or event.match
		vim.fn.mkdir(vim.fn.fnamemodify(file, ":p:h"), "p")
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
