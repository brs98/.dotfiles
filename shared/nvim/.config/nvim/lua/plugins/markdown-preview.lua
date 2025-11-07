return {
	"ellisonleao/glow.nvim",
	config = function()
		require("glow").setup({
			border = "single",
		})
	end,
	cmd = "Glow",
}
