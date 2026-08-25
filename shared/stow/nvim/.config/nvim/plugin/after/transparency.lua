local function clear_background(group)
  vim.api.nvim_set_hl(0, group, { bg = "none", update = true })
end

local function set_transparency()
  -- transparent background
  for _, group in ipairs({
    "Normal",
    "NormalFloat",
    "FloatBorder",
    "Pmenu",
    "Terminal",
    "EndOfBuffer",
    "FoldColumn",
    "Folded",
    "SignColumn",
    "NormalNC",
    "WhichKeyFloat",
  }) do
    clear_background(group)
  end

  -- transparent tabline (bufferline highlights are configured in the plugin itself)
  clear_background("TabLine")
  clear_background("TabLineFill")

  -- transparent statusline / lualine
  clear_background("StatusLine")
  clear_background("StatusLineNC")

  -- transparent background for fzf-lua
  clear_background("FzfLuaBorder")
  clear_background("FzfLuaNormal")
  clear_background("FzfLuaPreviewBorder")
  clear_background("FzfLuaPreviewNormal")
  clear_background("FzfLuaTitle")

  -- transparent background for neotree
  clear_background("NeoTreeNormal")
  clear_background("NeoTreeNormalNC")
  clear_background("NeoTreeVertSplit")
  clear_background("NeoTreeWinSeparator")
  clear_background("NeoTreeEndOfBuffer")

  -- transparent background for nvim-tree
  clear_background("NvimTreeNormal")
  clear_background("NvimTreeNormalNC")
  clear_background("NvimTreeVertSplit")
  clear_background("NvimTreeEndOfBuffer")

  -- transparent notify background
  for _, group in ipairs({
    "NotifyINFOBody",
    "NotifyERRORBody",
    "NotifyWARNBody",
    "NotifyTRACEBody",
    "NotifyDEBUGBody",
    "NotifyINFOTitle",
    "NotifyERRORTitle",
    "NotifyWARNTitle",
    "NotifyTRACETitle",
    "NotifyDEBUGTitle",
    "NotifyINFOBorder",
    "NotifyERRORBorder",
    "NotifyWARNBorder",
    "NotifyTRACEBorder",
    "NotifyDEBUGBorder",
  }) do
    clear_background(group)
  end
end

-- Apply transparency after any colorscheme change
vim.api.nvim_create_autocmd("ColorScheme", {
  group = vim.api.nvim_create_augroup("transparent-background", { clear = true }),
  callback = set_transparency,
})

-- Apply immediately since the colorscheme is already loaded by the time this file is sourced
set_transparency()
