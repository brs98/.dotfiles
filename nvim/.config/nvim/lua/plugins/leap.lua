return {
	"ggandor/leap.nvim",
	config = function(_, opts)
		local leap = require("leap")
		for k, v in pairs(opts) do
			leap.opts[k] = v
		end
		vim.keymap.set({ "n", "v" }, "s", "^", { silent = true, noremap = true })
	end,
}
