return {
	"stevearc/aerial.nvim",
	opts = {},
	dependencies = {
		"nvim-treesitter/nvim-treesitter",
		"nvim-tree/nvim-web-devicons",
	},
	init = function()
		vim.keymap.set("n", "<leader>a", "<cmd>AerialToggle!<CR>", { silent = true })
	end,
	config = function()
		require("aerial").setup()
	end,
}
