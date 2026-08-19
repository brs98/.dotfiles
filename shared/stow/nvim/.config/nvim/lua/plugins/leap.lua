return {
	"https://codeberg.org/andyg/leap.nvim",
	config = function(_, opts)
		local leap = require("leap")
		for k, v in pairs(opts) do
			leap.opts[k] = v
		end

		local function ft(args)
			leap.leap(vim.tbl_deep_extend("keep", args, {
				inputlen = 1,
				inclusive = true,
				opts = {
					labels = "",
					-- Preserve Flit's labeled_modes = "nx": labels in Normal
					-- and Visual modes, but not in Operator-pending mode.
					safe_labels = vim.fn.mode(1):match("o") and "" or nil,
					-- Keep f/t motions case-sensitive without the removed option.
					vim_opts = { ["go.ignorecase"] = false },
				},
			}))
		end

		vim.keymap.set({ "n", "x", "o" }, "f", function()
			ft({})
		end, { desc = "f" })

		vim.keymap.set({ "n", "x", "o" }, "F", function()
			ft({ backward = true })
		end, { desc = "F" })

		vim.keymap.set({ "n", "x", "o" }, "t", function()
			ft({ offset = -1 })
		end, { desc = "t" })

		vim.keymap.set({ "n", "x", "o" }, "T", function()
			ft({ backward = true, offset = 1 })
		end, { desc = "T" })

		vim.keymap.set({ "n", "v" }, "s", "^", { silent = true, noremap = true })
	end,
}
