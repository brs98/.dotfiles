return {
	"nvim-lualine/lualine.nvim",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		require("lualine").setup({
			sections = {
				lualine_x = {
					{
						require("noice").api.statusline.mode.get,
						cond = require("noice").api.statusline.mode.has,
						color = function()
							local hl = vim.api.nvim_get_hl(0, { name = "CursorLineNr", link = false })
							return { fg = hl.fg and string.format("#%06x", hl.fg) or "#ff9e64" }
						end,
					},
				},
			},
		})
	end,
}
