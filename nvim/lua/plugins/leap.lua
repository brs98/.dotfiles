return {
	"ggandor/leap.nvim",
	config = function(_, opts)
		local leap = require("leap")
		for k, v in pairs(opts) do
			leap.opts[k] = v
		end
		leap.add_default_mappings()
		vim.keymap.del({ "x", "o" }, "x")
		vim.keymap.del({ "x", "o" }, "X")
		vim.keymap.set({ "n", "v" }, "s", "^", { silent = true, noremap = true })
	end,
}
