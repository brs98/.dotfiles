local function set_transparency()
  -- transparent background
  vim.api.nvim_set_hl(0, "Normal", { bg = "none" })
  vim.api.nvim_set_hl(0, "NormalFloat", { bg = "none" })
  vim.api.nvim_set_hl(0, "FloatBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "Pmenu", { bg = "none" })
  vim.api.nvim_set_hl(0, "Terminal", { bg = "none" })
  vim.api.nvim_set_hl(0, "EndOfBuffer", { bg = "none" })
  vim.api.nvim_set_hl(0, "FoldColumn", { bg = "none" })
  vim.api.nvim_set_hl(0, "Folded", { bg = "none" })
  vim.api.nvim_set_hl(0, "SignColumn", { bg = "none" })
  vim.api.nvim_set_hl(0, "NormalNC", { bg = "none" })
  vim.api.nvim_set_hl(0, "WhichKeyFloat", { bg = "none" })

  -- transparent tabline (bufferline highlights are configured in the plugin itself)
  vim.api.nvim_set_hl(0, "TabLine", { bg = "none" })
  vim.api.nvim_set_hl(0, "TabLineFill", { bg = "none" })

  -- transparent statusline / lualine
  vim.api.nvim_set_hl(0, "StatusLine", { bg = "none" })
  vim.api.nvim_set_hl(0, "StatusLineNC", { bg = "none" })

  -- transparent background for fzf-lua
  vim.api.nvim_set_hl(0, "FzfLuaBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "FzfLuaNormal", { bg = "none" })
  vim.api.nvim_set_hl(0, "FzfLuaPreviewBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "FzfLuaPreviewNormal", { bg = "none" })
  vim.api.nvim_set_hl(0, "FzfLuaTitle", { bg = "none" })

  -- transparent background for neotree
  vim.api.nvim_set_hl(0, "NeoTreeNormal", { bg = "none" })
  vim.api.nvim_set_hl(0, "NeoTreeNormalNC", { bg = "none" })
  vim.api.nvim_set_hl(0, "NeoTreeVertSplit", { bg = "none" })
  vim.api.nvim_set_hl(0, "NeoTreeWinSeparator", { bg = "none" })
  vim.api.nvim_set_hl(0, "NeoTreeEndOfBuffer", { bg = "none" })

  -- transparent background for nvim-tree
  vim.api.nvim_set_hl(0, "NvimTreeNormal", { bg = "none" })
  vim.api.nvim_set_hl(0, "NvimTreeVertSplit", { bg = "none" })
  vim.api.nvim_set_hl(0, "NvimTreeEndOfBuffer", { bg = "none" })

  -- transparent notify background
  vim.api.nvim_set_hl(0, "NotifyINFOBody", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyERRORBody", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyWARNBody", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyTRACEBody", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyDEBUGBody", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyINFOTitle", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyERRORTitle", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyWARNTitle", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyTRACETitle", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyDEBUGTitle", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyINFOBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyERRORBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyWARNBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyTRACEBorder", { bg = "none" })
  vim.api.nvim_set_hl(0, "NotifyDEBUGBorder", { bg = "none" })
end

-- Apply transparency after any colorscheme change
vim.api.nvim_create_autocmd("ColorScheme", {
  callback = set_transparency,
})

-- Apply immediately since the colorscheme is already loaded by the time this file is sourced
set_transparency()
