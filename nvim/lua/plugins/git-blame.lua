return {
	"f-person/git-blame.nvim",
	init = function()
		vim.keymap.set("n", "<leader>gb", "<cmd>GitBlameToggle<cr>", { desc = "Toggle [G]it [B]lame" })
	end,
}
