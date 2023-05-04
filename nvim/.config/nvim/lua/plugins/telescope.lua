return {
  "nvim-telescope/telescope.nvim",
  keys = {
    {
      "<leader>sR",
      require("telescope.builtin").resume,
      { silent = true, noremap = true, desc = "Resume previous search" },
    },
  },
}
