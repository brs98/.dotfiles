return {
	"goolord/alpha-nvim",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		require("alpha").setup(require("alpha.themes.dashboard").config)
		local dashboard = require("alpha.themes.dashboard")
		-- ascii art for "DevXPerience"
		local logo = [[
    ██████╗ ███████╗██╗   ██╗██╗  ██╗██████╗ ███████╗██████╗ ██╗███████╗███╗   ██╗ ██████╗███████╗
    ██╔══██╗██╔════╝██║   ██║╚██╗██╔╝██╔══██╗██╔════╝██╔══██╗██║██╔════╝████╗  ██║██╔════╝██╔════╝
    ██║  ██║█████╗  ██║   ██║ ╚███╔╝ ██████╔╝█████╗  ██████╔╝██║█████╗  ██╔██╗ ██║██║     █████╗  
    ██║  ██║██╔══╝  ╚██╗ ██╔╝ ██╔██╗ ██╔═══╝ ██╔══╝  ██╔══██╗██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
    ██████╔╝███████╗ ╚████╔╝ ██╔╝ ██╗██║     ███████╗██║  ██║██║███████╗██║ ╚████║╚██████╗███████╗
    ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
  ]]

		dashboard.section.header.val = vim.split(logo, "\n")
  -- stylua: ignore
  dashboard.section.buttons.val = {
    dashboard.button("f", " " .. " Find file",       "<cmd> Telescope find_files <cr>"),
    dashboard.button("n", " " .. " New file",        "<cmd> ene <BAR> startinsert <cr>"),
    dashboard.button("r", " " .. " Recent files",    "<cmd> Telescope oldfiles <cr>"),
    dashboard.button("g", " " .. " Find text",       "<cmd> Telescope live_grep <cr>"),
    dashboard.button("s", " " .. " Restore Session", "<cmd> lua require('persistence').load({ last = true }) <cr>"),
    dashboard.button("l", "󰒲 " .. " Lazy",            "<cmd> Lazy <cr>"),
    dashboard.button("q", " " .. " Quit",            "<cmd> qa <cr>"),
  }
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