return {
	"folke/tokyonight.nvim",
	lazy = false,
	priority = 1000,
	config = function()
		require("tokyonight").setup({
			transparent = true,
			styles = {
				sidebars = "transparent",
				floats = "transparent",
			},
			on_highlights = function(highlights, colors)
				highlights.LineNrAbove = { fg = colors.dark3 }
				highlights.LineNrBelow = { fg = colors.dark3 }
				highlights.CursorLineNr = { fg = colors.blue }
				highlights.WinSeparator = { fg = colors.blue }
			end,
		})
		vim.cmd([[colorscheme tokyonight]])
	end,
}
