return {
	"catppuccin/nvim",
	priority = 1000,
	name = "catppuccin",
	init = function()
		vim.cmd.colorscheme("catppuccin")

		-- You can configure highlights by doing something like
		vim.cmd.hi("Comment gui=none")
	end,
	opts = {
		transparent_background = true,
		highlight_overrides = {
			all = function(colors)
				return {
					LineNr = { fg = colors.subtext1 },
					CursorLineNr = { fg = colors.rosewater },
					WinSeparator = { fg = colors.flamingo },
				}
			end,
		},
	},
}
