return {
  "nvim-telescope/telescope.nvim",
  keys = {
    {
      "<leader>sR",
      require("telescope.builtin").resume,
      { silent = true, noremap = true, desc = "Resume previous search" },
    },
    {
      "<leader><space>",
      function()
        require("telescope.builtin").find_files({ cwd = false })
      end,
      silent = true,
      noremap = true,
      desc = "Find files (root dir)",
    },
    {
      "<leader>/",
      function()
        require("telescope.builtin").live_grep({ cwd = false })
      end,
      silent = true,
      noremap = true,
      desc = "Grep (root dir)",
    },
  },
}
