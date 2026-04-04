local utils = require("../utils")
local default_keymap_opts = utils.default_keymap_opts
local addDescription = utils.addDescription

return {
	"akinsho/bufferline.nvim",
	opts = {
		highlights = {
			fill = { bg = "NONE" },
			background = { bg = "NONE" },
			buffer_visible = { bg = "NONE" },
			buffer_selected = { bg = "NONE" },
			close_button = { bg = "NONE" },
			close_button_visible = { bg = "NONE" },
			close_button_selected = { bg = "NONE" },
			separator = { bg = "NONE" },
			separator_visible = { bg = "NONE" },
			separator_selected = { bg = "NONE" },
			duplicate = { bg = "NONE" },
			duplicate_visible = { bg = "NONE" },
			duplicate_selected = { bg = "NONE" },
			modified = { bg = "NONE" },
			modified_visible = { bg = "NONE" },
			modified_selected = { bg = "NONE" },
			diagnostic = { bg = "NONE" },
			diagnostic_visible = { bg = "NONE" },
			diagnostic_selected = { bg = "NONE" },
			indicator_visible = { bg = "NONE" },
			indicator_selected = { bg = "NONE" },
			tab = { bg = "NONE" },
			tab_selected = { bg = "NONE" },
			tab_separator = { bg = "NONE" },
			tab_separator_selected = { bg = "NONE" },
			tab_close = { bg = "NONE" },
			numbers = { bg = "NONE" },
			numbers_visible = { bg = "NONE" },
			numbers_selected = { bg = "NONE" },
			offset_separator = { bg = "NONE" },
			trunc_marker = { bg = "NONE" },
		},
		options = {
			close_command = function(n)
				require("mini.bufremove").delete(n, false)
			end,
			right_mouse_command = function(n)
				require("mini.bufremove").delete(n, false)
			end,
			diagnostics = "nvim_lsp",
			always_show_bufferline = true,
			diagnostics_indicator = function(_, _, diag)
				local icons = { Error = "🐛", Warn = "⚠", Info = "ℹ" }
				local ret = (diag.error and icons.Error .. diag.error .. " " or "")
					.. (diag.warning and icons.Warn .. diag.warning or "")
				return vim.trim(ret)
			end,
			offsets = {
				{
					filetype = "neo-tree",
					text = "Neo-tree",
					highlight = "Directory",
					text_align = "left",
				},
			},
		},
	},
	dependencies = "nvim-tree/nvim-web-devicons",
	init = function()
		vim.keymap.set("n", "<S-Left>", ":BufferLineCyclePrev<cr>", default_keymap_opts)
		vim.keymap.set("n", "<S-Right>", ":BufferLineCycleNext<cr>", default_keymap_opts)
		vim.keymap.set("n", "H", ":BufferLineCyclePrev<cr>", default_keymap_opts)
		vim.keymap.set("n", "L", ":BufferLineCycleNext<cr>", default_keymap_opts)
		vim.keymap.set("n", "<leader>bb", ":bdelete<cr>", addDescription("Close [B]uffer"))
		vim.keymap.set("n", "<leader>bp", ":BufferLineTogglePin<cr>", addDescription("[P]in Buffer"))
		vim.keymap.set(
			"n",
			"<leader>bP",
			":BufferLineGroupClose ungrouped<cr>",
			addDescription("Close Un[P]inned Buffers")
		)
		vim.keymap.set("n", "<leader>bo", ":BufferLineCloseOthers<cr>", addDescription("Close [O]ther Buffers"))
		vim.keymap.set("n", "<leader>br", ":BufferLineCloseRight<cr>", addDescription("Closer Buffers to the [R]ight"))
		vim.keymap.set("n", "<leader>bl", ":BufferLineCloseLeft<cr>", addDescription("Closer Buffers to the [L]eft"))
		vim.keymap.set("n", "<S-h>", ":BufferLineCyclePrev<cr>", default_keymap_opts)
		vim.keymap.set("n", "<S-l>", ":BufferLineCycleNext<cr>", default_keymap_opts)
	end,
}
