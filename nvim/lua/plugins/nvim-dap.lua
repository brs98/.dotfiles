return {
	{
		"mxsdev/nvim-dap-vscode-js",
		requires = { "mfussenegger/nvim-dap" },
		dependencies = {
			"microsoft/vscode-js-debug",
			opt = true,
			run = "npm install --legacy-peer-deps && npx gulp vsDebugServerBundle && mv dist out",
		},
	},

	{
		"mfussenegger/nvim-dap",
		dependencies = {
			"rcarriga/nvim-dap-ui",
			"nvim-neotest/nvim-nio",
		},
		init = function()
			vim.keymap.set("n", "<leader>dc", "<cmd>lua require('dap').continue()<cr>", { desc = "Continue" })
			vim.keymap.set(
				"n",
				"<leader>db",
				"<cmd>lua require('dap').toggle_breakpoint()<cr>",
				{ desc = "Toggle breakpoint" }
			)
			vim.keymap.set("n", "<leader>dr", "<cmd>lua require('dap').repl.toggle()<cr>", { desc = "Toggle REPL" })
			vim.keymap.set("n", "<leader>ds", "<cmd>lua require('dap').step_over()<cr>", { desc = "Step over" })
			vim.keymap.set("n", "<leader>di", "<cmd>lua require('dap').step_into()<cr>", { desc = "Step into" })
			vim.keymap.set("n", "<leader>do", "<cmd>lua require('dap').step_out()<cr>", { desc = "Step out" })
			vim.keymap.set("n", "<leader>dl", "<cmd>lua require('dap').run_last()<cr>", { desc = "Run last" })
		end,
		config = function()
			require("dap-vscode-js").setup({
				node_path = "node", -- Path of node executable. Defaults to $NODE_PATH, and then "node"
				debugger_path = vim.fn.resolve(vim.fn.stdpath("data") .. "/lazy/vscode-js-debug"),
				debugger_cmd = { "js-debug-adapter" }, -- Command to use to launch the debug server. Takes precedence over `node_path` and `debugger_path`.
				adapters = { "pwa-node", "pwa-chrome", "pwa-msedge", "node-terminal", "pwa-extensionHost" }, -- which adapters to register in nvim-dap
				log_file_path = "(stdpath cache)/dap_vscode_js.log", -- Path for file logging
				log_file_level = false, -- Logging level for output to file. Set to false to disable file logging.
				log_console_level = vim.log.levels.ERROR, -- Logging level for output to console. Set to false to disable console output.
			})

			for _, language in ipairs({ "typescript", "javascript", "typescriptreact" }) do
				require("dap").configurations[language] = {
					-- Debug single nodejs files
					{
						name = "Launch file",
						type = "pwa-node",
						request = "launch",
						program = "${file}",
						rootPath = "${workspaceFolder}",
						cwd = "${workspaceFolder}",
						sourceMaps = true,
						port = 8123,
						skipFiles = { "<node_internals>/**" },
						protocol = "inspector",
						console = "integratedTerminal",
						runtimeArgs = { "--loader=ts-node/esm" },
						runtimeExecutable = "node",
					},
					-- Debug node processes (make sure to add --inspect when you run the process)
					{
						name = "Attach to node process",
						type = "pwa-node",
						request = "attach",
						rootPath = "${workspaceFolder}",
						processId = require("dap.utils").pick_process,
						cwd = "${workspaceFolder}",
						port = 8123,
						sourceMaps = true,
						runtimeArgs = { "--loader=ts-node/esm" },
						program = "${file}",
						runtimeExecutable = "node",
					},
					-- Debug web applications (client-side)
					{
						name = "Launch & Debug Chrome",
						type = "pwa-chrome",
						request = "launch",
						url = function()
							local co = coroutine.running()
							return coroutine.create(function()
								vim.ui.input({
									prompt = "Enter URL: ",
									default = "http://localhost:3000",
								}, function(url)
									if url == nil or url == "" then
										return
									else
										coroutine.resume(co, url)
									end
								end)
							end)
						end,
						webRoot = "${workspaceFolder}",
						skipFiles = { "<node_internals>/**" },
						protocol = "inspector",
						port = 8123,
						sourceMaps = true,
						userDataDir = false,
						runtimeArgs = { "--loader=ts-node/esm" },
						program = "${file}",
						runtimeExecutable = "node",
					},
				}
			end
		end,
	},
	{
		"rcarriga/nvim-dap-ui",
		event = "VeryLazy",
		dependencies = "mfussenegger/nvim-dap",
		config = function()
			local dap = require("dap")
			local dapui = require("dapui")
			require("dapui").setup()
			dap.listeners.after.event_initialized["dapui_config"] = function()
				dapui.open()
			end
			dap.listeners.before.event_terminated["dapui_config"] = function()
				dapui.close()
			end
			dap.listeners.before.event_exited["dapui_config"] = function()
				dapui.close()
			end
		end,
	},
}
