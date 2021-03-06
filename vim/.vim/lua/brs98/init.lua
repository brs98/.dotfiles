if vim.g.vscode == nil then
  require("brs98/options")
  require("brs98/keymaps")
  require("brs98/plugins")
  require("brs98/colorscheme")
  require("brs98/null-ls")
  require("brs98/treesitter")
  require("brs98/telescope")
  require("brs98/lualine")
  require("brs98/autopairs")
  require("brs98/comment")
  require("brs98/nvim-tree")
  require("brs98/toggleterm")
  require("brs98/bufferline")
  require("brs98/cmp")
  require("brs98/lspconfig")
else
  vim.cmd("source " .. vim.fn.expand("~/.vim/vscode/settings.vim"))
end
