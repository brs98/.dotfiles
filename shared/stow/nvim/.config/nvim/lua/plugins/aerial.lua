return {
	"stevearc/aerial.nvim",
	commit = "5e687b5a14004fa2dd9eccbee042b96869fe1557",
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
