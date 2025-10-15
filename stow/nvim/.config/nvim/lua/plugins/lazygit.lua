return {
	"kdheepak/lazygit.nvim",
	init = function()
		vim.keymap.set("n", "<leader>gg", "<cmd>LazyGit<cr>", { desc = "Open [G]it [G]ui" })
	end,
	cmd = {
		"LazyGit",
		"LazyGitConfig",
		"LazyGitCurrentFile",
		"LazyGitFilter",
		"LazyGitFilterCurrentFile",
	},
	-- optional for floating window border decoration
	dependencies = {
		"nvim-lua/plenary.nvim",
	},
}
