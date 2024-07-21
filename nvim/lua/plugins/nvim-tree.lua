return {
	"nvim-tree/nvim-tree.lua",
	version = "*",
	lazy = false,
	dependencies = "nvim-tree/nvim-web-devicons",
	init = function()
		vim.keymap.set("n", "<leader>e", "<cmd>NvimTreeFindFileToggle<CR>", { desc = "Toggle file explorer" }) -- toggle file explorer on current file
	end,
	config = function()
		require("nvim-tree").setup({
			sort = {
				sorter = "case_sensitive",
			},
			view = {
				width = 45,
				relativenumber = true,
				side = "right",
			},
			git = {
				ignore = false,
			},
			filters = {
				dotfiles = true,
				custom = { ".DS_Store", "node_modules" },
			},
		})
	end,
}
