local utils = require("../utils")
local addDescription = utils.addDescription
return {
	"mgierada/lazydocker.nvim",
	init = function()
		vim.keymap.set("n", "<leader>l", "<cmd>Lazydocker<cr>", addDescription("Lazydocker"))
	end,
	dependencies = { "akinsho/toggleterm.nvim" },
	config = function()
		require("lazydocker").setup({})
	end,
	event = "VimEnter", -- or any other event you might want to use.
}
