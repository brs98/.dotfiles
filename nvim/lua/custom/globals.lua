-- Set <space> as the leader key
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- disable netrw
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

-- Disable gitblame by default (can be toggled with <leader>gb)
vim.g.gitblame_enabled = 0

-- Set to true if you have a Nerd Font installed
vim.g.have_nerd_font = true

vim.cmd("packadd cfilter")
