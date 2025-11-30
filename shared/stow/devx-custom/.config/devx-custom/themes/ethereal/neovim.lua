return {
	{
		"bjarneo/ethereal.nvim",
		name = "ethereal",
		lazy = false,
		priority = 1000,
		config = function()
			vim.cmd("colorscheme ethereal")
		end,
	},
}
