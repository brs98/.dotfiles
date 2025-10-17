return {
	"goolord/alpha-nvim",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		require("alpha").setup(require("alpha.themes.dashboard").config)
		local dashboard = require("alpha.themes.dashboard")

		-- Define and set highlight groups for each logo line
		vim.api.nvim_set_hl(0, "NeovimDashboardLogo1", { fg = "#b4befe" }) 
		vim.api.nvim_set_hl(0, "NeovimDashboardLogo2", { fg = "#89b4fa" }) 
		vim.api.nvim_set_hl(0, "NeovimDashboardLogo3", { fg = "#74c7ec" }) 
		vim.api.nvim_set_hl(0, "NeovimDashboardLogo4", { fg = "#89dceb" }) 
		vim.api.nvim_set_hl(0, "NeovimDashboardLogo5", { fg = "#94e2d5" }) 
		vim.api.nvim_set_hl(0, "NeovimDashboardLogo6", { fg = "#a6e3a1" }) 
		vim.api.nvim_set_hl(0, "NeovimDashboardUsername", { fg = "#a6e3a1" }) 
		dashboard.section.header.type = "group"
		dashboard.section.header.val = {
			{
				type = "text",
				val = "██████╗ ███████╗██╗   ██╗██╗  ██╗██████╗ ███████╗██████╗ ██╗███████╗███╗   ██╗ ██████╗███████╗",
				opts = { hl = "NeovimDashboardLogo1", shrink_margin = false, position = "center" },
			},
			{
				type = "text",
				val = "██╔══██╗██╔════╝██║   ██║╚██╗██╔╝██╔══██╗██╔════╝██╔══██╗██║██╔════╝████╗  ██║██╔════╝██╔════╝",
				opts = { hl = "NeovimDashboardLogo2", shrink_margin = false, position = "center" },
			},
			{
				type = "text",
				val = "██║  ██║█████╗  ██║   ██║ ╚███╔╝ ██████╔╝█████╗  ██████╔╝██║█████╗  ██╔██╗ ██║██║     █████╗  ",
				opts = { hl = "NeovimDashboardLogo3", shrink_margin = false, position = "center" },
			},
			{
				type = "text",
				val = "██║  ██║██╔══╝  ╚██╗ ██╔╝ ██╔██╗ ██╔═══╝ ██╔══╝  ██╔══██╗██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  ",
				opts = { hl = "NeovimDashboardLogo4", shrink_margin = false, position = "center" },
			},
			{
				type = "text",
				val = "██████╔╝███████╗ ╚████╔╝ ██╔╝ ██╗██║     ███████╗██║  ██║██║███████╗██║ ╚████║╚██████╗███████╗",
				opts = { hl = "NeovimDashboardLogo5", shrink_margin = false, position = "center" },
			},
			{
				type = "text",
				val = "╚═════╝ ╚══════╝  ╚═══╝  ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝",
				opts = { hl = "NeovimDashboardLogo6", shrink_margin = false, position = "center" },
			},
			{
				type = "padding",
				val = 1,
			},
		}
		-- ascii art for "DevXPerience"
		--   ██████╗ ███████╗██╗   ██╗██╗  ██╗██████╗ ███████╗██████╗ ██╗███████╗███╗   ██╗ ██████╗███████╗
		--   ██╔══██╗██╔════╝██║   ██║╚██╗██╔╝██╔══██╗██╔════╝██╔══██╗██║██╔════╝████╗  ██║██╔════╝██╔════╝
		--   ██║  ██║█████╗  ██║   ██║ ╚███╔╝ ██████╔╝█████╗  ██████╔╝██║█████╗  ██╔██╗ ██║██║     █████╗  
		--   ██║  ██║██╔══╝  ╚██╗ ██╔╝ ██╔██╗ ██╔═══╝ ██╔══╝  ██╔══██╗██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
		--   ██████╔╝███████╗ ╚████╔╝ ██╔╝ ██╗██║     ███████╗██║  ██║██║███████╗██║ ╚████║╚██████╗███████╗
		--   ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
  -- stylua: ignore
  dashboard.section.buttons.val = {
    dashboard.button("f", " " .. " Find file",       "<cmd> Telescope find_files <cr>"),
    dashboard.button("n", " " .. " New file",        "<cmd> ene <BAR> startinsert <cr>"),
    dashboard.button("r", " " .. " Recent files",    "<cmd> Telescope oldfiles <cr>"),
    dashboard.button("g", " " .. " Find text",       "<cmd> Telescope live_grep <cr>"),
    dashboard.button("s", " " .. " Restore Session", "<cmd> lua require('persistence').load({ last = true }) <cr>"),
    dashboard.button("d", "⛃ " .. " Database", "<cmd> DBUI <cr> <cmd> only <cr>"),
    dashboard.button("l", "󰒲 " .. " Lazy",            "<cmd> Lazy <cr>"),
    dashboard.button("q", " " .. " Quit",            "<cmd> qa <cr>"),
  }

		vim.api.nvim_set_hl(0, "AlphaButtons", { fg = "#8aa9f9" })
		vim.api.nvim_set_hl(0, "AlphaShortcut", { fg = "#5fcfe5" })

		for _, button in ipairs(dashboard.section.buttons.val) do
			button.opts.hl = "AlphaButtons"
			button.opts.hl_shortcut = "AlphaShortcut"
		end
		dashboard.section.header.opts.hl = "AlphaHeader"
		dashboard.section.buttons.opts.hl = "AlphaButtons"
		dashboard.section.footer.opts.hl = "AlphaFooter"
		dashboard.opts.layout[1].val = 8
	end,
}
