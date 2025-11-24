return {
	{
		"bjarneo/hackerman.nvim",
		name = "hackerman",
		lazy = false,
		dependencies = { "bjarneo/aether.nvim" }, -- Ensure aether is loaded first
		priority = 1000,
		config = function()
			vim.cmd("colorscheme hackerman")
		end,
	},
}
