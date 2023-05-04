return {
  {
    "jose-elias-alvarez/null-ls.nvim",
    ---@class PluginLspOpts
    opts = function(_, opts)
      local nls = require("null-ls")
      opts.sources = {
        nls.builtins.formatting.stylua,
        nls.builtins.formatting.shfmt,
        nls.builtins.formatting.prettierd,
        nls.builtins.formatting.black,
      }
    end,
  },
}
