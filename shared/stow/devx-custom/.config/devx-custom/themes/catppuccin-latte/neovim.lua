return {
  {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    opts = {
      flavour = "latte",
    },
    config = function()
      vim.cmd("colorscheme catppuccin-latte")
    end,
  },
}
