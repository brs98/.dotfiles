return {
	"ibhagwan/fzf-lua",
	-- optional for icon support
	dependencies = { "nvim-tree/nvim-web-devicons" },
	-- or if using mini.icons/mini.nvim
	-- dependencies = { "nvim-mini/mini.icons" },
	config = function()
		-- Configure fzf-lua
		local fzf = require("fzf-lua")

		fzf.setup({
			-- Global defaults
			defaults = {
				formatter = "path.filename_first", -- Show filename first
			},
			-- Keybindings
			keymap = {
				builtin = {
					["<C-q>"] = "select-all+accept", -- Send all to quickfix
				},
				fzf = {
					["ctrl-q"] = "select-all+accept", -- Send all to quickfix
					["ctrl-a"] = "toggle-all", -- Select/deselect all
				},
			},
			-- Actions for different pickers
			actions = {
				files = {
					["default"] = require("fzf-lua.actions").file_edit,
					["ctrl-s"] = require("fzf-lua.actions").file_split,
					["ctrl-v"] = require("fzf-lua.actions").file_vsplit,
					["ctrl-t"] = require("fzf-lua.actions").file_tabedit,
					["ctrl-q"] = require("fzf-lua.actions").file_sel_to_qf,
					["alt-q"] = require("fzf-lua.actions").file_sel_to_ll, -- Send to location list
				},
			},
			-- Preview configuration
			previewers = {
				builtin = {
					-- Limit preview file size
					limit = 100000, -- 100KB
				},
			},
			-- File picker configuration
			files = {
				-- Use fd for better performance
				cmd = "fd --type f --hidden --follow --exclude .git --exclude node_modules --exclude expo",
				-- Follow symlinks
				follow = true,
			},
			-- Grep configuration
			grep = {
				rg_opts = "--hidden --column --line-number --no-heading --color=always --smart-case "
					.. "--max-columns=4096 -e",
				-- Ignore patterns
				rg_glob = true,
				glob_flag = "--iglob",
				glob_separator = "%s%-%-",
			},
		})

		-- Key mappings
		local builtin = fzf

		-- Help and documentation
		vim.keymap.set("n", "<leader>sh", builtin.helptags, { desc = "[S]earch [H]elp" })
		vim.keymap.set("n", "<leader>sm", builtin.manpages, { desc = "[S]earch [M]an pages" })

		-- Neovim internals
		vim.keymap.set("n", "<leader>sk", builtin.keymaps, { desc = "[S]earch [K]eymaps" })
		vim.keymap.set("n", "<leader>sc", builtin.commands, { desc = "[S]earch [C]ommands" })
		vim.keymap.set("n", "<leader>st", builtin.builtin, { desc = "[S]earch [T]elescope Select" })

		-- Search
		vim.keymap.set("n", "<leader>sw", builtin.grep_cword, { desc = "[S]earch current [W]ord" })
		vim.keymap.set("n", "<leader>sd", builtin.diagnostics_document, { desc = "[S]earch [D]iagnostics" })
		vim.keymap.set("n", "<leader>sr", builtin.resume, { desc = "[S]earch [R]esume" })

		-- Files
		vim.keymap.set("n", "<leader>s.", builtin.oldfiles, { desc = '[S]earch Recent Files ("." for repeat)' })
		vim.keymap.set("n", "<leader>sb", builtin.buffers, { desc = "[S]earch [B]uffers" })

		-- Live grep with ignore patterns
		vim.keymap.set("n", "<leader>sg", function()
			builtin.live_grep({
				cmd = "rg --column --line-number --no-heading --color=always --smart-case "
					.. "--iglob !expo/ --iglob !node_modules/ -e",
			})
		end, { desc = "[S]earch by [G]rep" })

		-- Find files with ignore patterns
		vim.keymap.set("n", "<leader><leader>", function()
			builtin.files({
				cmd = "fd --type f --follow --exclude expo --exclude node_modules",
			})
		end, { desc = "[S]earch Files" })

		-- Find files including hidden
		vim.keymap.set("n", "<leader>sf", function()
			builtin.files({
				cmd = "fd --type f --hidden --follow --exclude .git --exclude .DS_Store --exclude expo --exclude node_modules",
			})
		end, { desc = "[S]earch Hidden [F]iles" })

		-- Search in current buffer
		vim.keymap.set("n", "<leader>/", builtin.lgrep_curbuf, { desc = "[/] Search in current buffer" })

		-- Live grep in open buffers
		vim.keymap.set("n", "<leader>s/", function()
			builtin.lines({
				prompt = "Live Grep in Open Files> ",
			})
		end, { desc = "[S]earch [/] in Open Files" })

		-- Search neovim config files
		vim.keymap.set("n", "<leader>sn", function()
			builtin.files({ cwd = "~/.dotfiles/nvim" })
		end, { desc = "[S]earch [N]eovim files" })

		-- Git commands
		vim.keymap.set("n", "<leader>gd", builtin.git_diff, { desc = "[G]it [D]iff" })
		vim.keymap.set("n", "<leader>gw", builtin.git_worktrees, { desc = "[G]it [W]orktrees" })
		vim.keymap.set("n", "<leader>gs", builtin.git_status, { desc = "[G]it [S]tatus" })
		vim.keymap.set("n", "<leader>gc", builtin.git_commits, { desc = "[G]it [C]ommits" })
		vim.keymap.set("n", "<leader>gb", builtin.git_branches, { desc = "[G]it [B]ranches" })

		-- Zoxide - jump to recent directories
		vim.keymap.set("n", "<leader>sz", builtin.zoxide, { desc = "[S]earch [Z]oxide directories" })
	end,
}
