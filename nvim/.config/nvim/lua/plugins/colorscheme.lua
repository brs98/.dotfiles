return {
  -- add catppuccin
  {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = true,
    opts = {
      transparent_background = true,
      highlight_overrides = {
        all = function(colors)
          return {
            LineNr = { fg = colors.rosewater },
            CursorLineNr = { fg = colors.lavender },
          }
        end,
      },
    },
  },

  -- Configure LazyVim to load catppuccin
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "catppuccin",
    },
  },
}
