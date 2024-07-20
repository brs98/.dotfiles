return {
	"michaelrommel/nvim-silicon",
	lazy = true,
	cmd = "Silicon",
	init = function()
		vim.keymap.set("v", "<leader>SS", ":Silicon<cr>", { desc = "[S]creen[S]hot" })
	end,
	config = function()
		require("silicon").setup({
			-- Configuration here, or leave empty to use defaults
			font = "Hack Nerd Font=34",
			theme = "TwoDark",
			background_image = "/Users/brandonsouthwick/Pictures/gradient-background.jpeg",
			to_clipboard = true,
			window_title = function()
				return vim.fn.fnamemodify(vim.api.nvim_buf_get_name(vim.api.nvim_get_current_buf()), ":t")
			end,
		})
	end,
}
