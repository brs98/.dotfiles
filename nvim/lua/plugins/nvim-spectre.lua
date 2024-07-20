return {
	"nvim-pack/nvim-spectre",
	opts = { open_cmd = "noswapfile vnew" },
	init = function()
		vim.keymap.set("n", "<leader>sR", "<cmd>lua require('spectre').open()<cr>", { desc = "[S]earch and [R]eplace" })
	end,
}
