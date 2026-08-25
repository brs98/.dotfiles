local ensure_installed = {
	"bash",
	"c",
	"html",
	"lua",
	"markdown",
	"vim",
	"vimdoc",
	"css",
	"csv",
	"dockerfile",
	"hoon",
	"javascript",
	"json",
	"kdl",
	"nix",
	"prisma",
	"python",
	"ruby",
	"embedded_template",
	"rust",
	"scss",
	"slim",
	"sql",
	"svelte",
	"tsx",
	"typescript",
	"yaml",
}

return { -- Highlight, edit, and navigate code
	"nvim-treesitter/nvim-treesitter",
	branch = "main",
	lazy = false,
	build = ":TSUpdate",
	config = function()
		local treesitter = require("nvim-treesitter")
		treesitter.setup()

		local installed = {}
		for _, parser in ipairs(treesitter.get_installed("parsers")) do
			installed[parser] = true
		end

		local missing = vim.tbl_filter(function(parser)
			return not installed[parser]
		end, ensure_installed)

		if #missing > 0 then
			treesitter.install(missing, { summary = true })
		end

		vim.api.nvim_create_autocmd("FileType", {
			group = vim.api.nvim_create_augroup("nvim_treesitter", { clear = true }),
			callback = function(event)
				local lang = vim.treesitter.language.get_lang(vim.bo[event.buf].filetype)
				if not lang or not vim.treesitter.language.add(lang) then
					return
				end
				vim.treesitter.start(event.buf, lang)

				vim.keymap.set({ "n", "x" }, "<C-Space>", function()
					vim.treesitter.select("parent")
				end, { buffer = event.buf, silent = true, desc = "Select parent syntax node" })

				vim.keymap.set("x", "<BS>", function()
					vim.treesitter.select("child")
				end, { buffer = event.buf, silent = true, desc = "Select child syntax node" })
			end,
		})
	end,
}
