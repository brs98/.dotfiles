-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local default_opts = { silent = true, noremap = true }

-- function Set_charachorder_keymaps()
vim.keymap.set("n", "<leader><Left>", "<C-w><Left>", { silent = true, noremap = true, desc = "Move to left pane" })
vim.keymap.set("n", "<leader><Right>", "<C-w><Right>", { silent = true, noremap = true, desc = "Move to right pane" })
vim.keymap.set("n", "<leader><Up>", "<C-w><Up>", { silent = true, noremap = true, desc = "Move to up pane" })
vim.keymap.set("n", "<leader><Down>", "<C-w><Down>", { silent = true, noremap = true, desc = "Move to down pane" })
vim.keymap.set("n", "<S-Left>", ":BufferLineCyclePrev<cr>", default_opts)
vim.keymap.set("n", "<S-Right>", ":BufferLineCycleNext<cr>", default_opts)
-- end

-- vim.keymap.set(
--   "n",
--   "<leader>cc",
--   ":lua Set_charachorder_keymaps()<cr>",
--   { silent = true, noremap = true, desc = "Set CharaChorder Keymaps" }
-- )

-- remap escape
vim.keymap.set("i", "jk", "<esc>", default_opts)
vim.keymap.set("i", "kj", "<esc>", default_opts)
vim.keymap.set("v", "JK", "<esc>", default_opts)
vim.keymap.set("v", "KJ", "<esc>", default_opts)

-- normal mode
vim.keymap.set("n", "<leader>j", ":m .+1<CR>==", { silent = true, noremap = true, desc = "Move line down" })
vim.keymap.set("n", "<leader>k", ":m .-2<CR>==", { silent = true, noremap = true, desc = "Move line up" })
vim.keymap.set("n", "n", "nzzzv", default_opts)
vim.keymap.set("n", "N", "Nzzzv", default_opts)
vim.keymap.set("n", "J", "mzJ`z", default_opts)
vim.keymap.set("n", "s", "^", default_opts)
vim.keymap.set("n", "<C-h>", "<cmd> TmuxNavigateLeft<CR>", default_opts)
vim.keymap.set("n", "<C-j>", "<cmd> TmuxNavigateDown<CR>", default_opts)
vim.keymap.set("n", "<C-k>", "<cmd> TmuxNavigateUp<CR>", default_opts)
vim.keymap.set("n", "<C-l>", "<cmd> TmuxNavigateRight<CR>", default_opts)
vim.keymap.set("n", "dD", '"_dd', default_opts)

-- visual mode
vim.keymap.set("v", "<leader>j", ":m .+1<CR>==", { silent = true, noremap = true, desc = "Move selection down" })
vim.keymap.set("v", "<leader>k", ":m .-2<CR>==", { silent = true, noremap = true, desc = "Move selection up" })
vim.keymap.set("v", "p", '"_dP"', default_opts)
vim.keymap.set("v", "<C-j>", ":move '>+1<CR>gv-gv", default_opts)
vim.keymap.set("v", "<C-k>", ":move '<-2<CR>gv-gv", default_opts)
vim.keymap.set("v", "s", "^", default_opts)
