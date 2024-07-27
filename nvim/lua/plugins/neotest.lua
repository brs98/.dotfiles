return {
	"nvim-neotest/neotest",
	dependencies = {
		"nvim-neotest/nvim-nio",
		"nvim-lua/plenary.nvim",
		"antoinemadec/FixCursorHold.nvim",
		"nvim-treesitter/nvim-treesitter",
		"marilari88/neotest-vitest",
	},
	config = function()
		require("neotest").setup({
			adapters = {
				require("neotest-vitest")({
					filter_dir = function(name, rel_path, root)
						print("Checking directory:", rel_path) -- Debug logging
						return not string.match(rel_path, "^%.")
							and string.match(rel_path, "tests")
							and string.match(rel_path, ".*%.ts$")
					end,
					is_test_file = function(file_path)
						local result = string.match(file_path, "tests")
						if result then
							print("File is a test file", file_path) -- Debug logging
							return true
						end
						return false
					end,
				}),
			},
		})
		vim.keymap.set("n", "<leader>tf", function()
			require("neotest").run.run({
				vim.fn.expand("%"),
				vitestCommand = "dotenv -e .env.development -e .env -- node_modules/.bin/vitest --watch",
				suite = false,
			})
		end, { desc = "[T]est [F]ile" })
		vim.keymap.set("n", "<leader>tr", function()
			require("neotest").run.run({
				vim.fn.expand("%"),
				vitestCommand = "dotenv -e .env.development -e .env -- node_modules/.bin/vitest --watch",
				suite = false,
			})
		end, { desc = "[T]est [R]un Nearest" })
		vim.keymap.set("n", "<leader>tl", function()
			require("neotest").run.run_last()
		end, { desc = "[T]est [L]ast" })
		vim.keymap.set("n", "<leader>ts", function()
			require("neotest").summary.toggle()
		end, { desc = "[T]est [S]ummary" })
		vim.keymap.set("n", "<leader>to", function()
			require("neotest").output.open({ enter = true, auto_close = true })
		end, { desc = "[T]est [O]utput" })
		vim.keymap.set("n", "<leader>tO", function()
			require("neotest").output_panel.toggle()
		end, { desc = "[T]est [O]utput Panel" })
		vim.keymap.set("n", "<leader>tS", function()
			require("neotest").run.stop({
				interactive = false,
				vitestCommand = "dotenv -e .env.development -e .env -- node_modules/.bin/vitest --watch",
			})
		end, { desc = "[T]est [S]top" })
		vim.keymap.set("n", "<leader>tw", function()
			require("neotest").watch.toggle({
				vim.fn.expand("%"),
				vitestCommand = "dotenv -e .env.development -e .env -- node_modules/.bin/vitest --watch",
				suite = false,
			})
		end, { desc = "[T]est [W]atch" })
		--debug test
		vim.keymap.set("n", "<leader>td", function()
			require("neotest").run.run({
				vim.fn.expand("%"),
				vitestCommand = "dotenv -e .env.development -e .env -- node_modules/.bin/vitest --watch",
				suite = false,
				strategy = "dap",
			})
		end, { desc = "[T]est [D]ebug" })
	end,
}
