return {
  {
    "bjarneo/aether.nvim",
    branch = "v3",
    name = "aether",
    priority = 1000,
    opts = {
      colors = {
        bg = "#0B0C16",
        dark_bg = "#080910",
        darker_bg = "#06060c",
        lighter_bg = "#151828",

        fg = "#ddf7ff",
        dark_fg = "#6a6e95",
        light_fg = "#b5c5db",
        bright_fg = "#ddf7ff",
        muted = "#2d3450",

        red = "#50f872",
        yellow = "#50f7d4",
        orange = "#50f7a3",
        green = "#4fe88f",
        cyan = "#7cf8f7",
        blue = "#829dd4",
        magenta = "#86a7df",
        brown = "#287b51",

        bright_red = "#85ff9d",
        bright_yellow = "#a4ffec",
        bright_green = "#9cf7c2",
        bright_cyan = "#d1fffe",
        bright_blue = "#c4d2ed",
        bright_magenta = "#cddbf4",

        accent = "#82FB9C",
        cursor = "#ddf7ff",
        foreground = "#ddf7ff",
        background = "#0B0C16",
        selection = "#1f253a",
        selection_foreground = "#ddf7ff",
        selection_background = "#1f253a",
      },
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "aether",
    },
  },
}
