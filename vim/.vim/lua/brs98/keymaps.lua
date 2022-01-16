local opts = { noremap = true, silent = true }

-- Shorten function name
local keymap = vim.api.nvim_set_keymap

--Remap space as leader key
keymap("", "<Space>", "<Nop>", opts)
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- Modes
--   normal_mode = "n",
--   insert_mode = "i",
--   visual_mode = "v",
--   visual_block_mode = "x",
--   term_mode = "t",
--   command_mode = "c",

-- Better window navigation
keymap("n", "<leader>wh", "<C-w>h", opts)
keymap("n", "<leader>wj", "<C-w>j", opts)
keymap("n", "<leader>wk", "<C-w>k", opts)
keymap("n", "<leader>wl", "<C-w>l", opts)

-- Splits
keymap("n", "<leader>vs", "<C-w>v", opts)
keymap("n", "<leader>hs", "<C-w>s", opts)

-- Resize with arrows
keymap("n", "<C-Up>", ":resize +2<CR>", opts)
keymap("n", "<C-Down>", ":resize 2<CR>", opts)
keymap("n", "<C-Left>", ":vertical resize -2<CR>", opts)
keymap("n", "<C-Right>", ":vertical resize +2<CR>", opts)

-- Keep jumps centered
keymap("n", "n", "nzzzv", opts)
keymap("n", "N", "Nzzzv", opts)
keymap("n", "J", "mzJ`z", opts)

-- Jump to beginning of line
keymap("n", "s", "^", opts)

-- Switch between most recent file
keymap("n", "<leader><SPACE>", "<C-^>", opts)

-- Escape
keymap("i", "jk", "<ESC>", opts)
keymap("v", "JK", "<ESC>", opts)

-- Stay in indent mode
keymap("v", "<", "<gv", opts)
keymap("v", ">", ">gv", opts)

-- Normal/Visual --
-- Move text up and down
keymap("n", "<leader>j", ":m .+1<CR>==", opts)
keymap("n", "<leader>k", ":m .-2<CR>==", opts)
keymap("v", "<leader>j", ":m .+1<CR>==", opts)
keymap("v", "<leader>k", ":m .-2<CR>==", opts)
keymap("v", "p", '"_dP', opts)

-- Visual Block --
-- Move text up and down
keymap("x", "J", ":move '>+1<CR>gv-gv", opts)
keymap("x", "K", ":move '<-2<CR>gv-gv", opts)
keymap("x", "<leader>j", ":move '>+1<CR>gv-gv", opts)
keymap("x", "<leader>k", ":move '<-2<CR>gv-gv", opts)

-- Telescope
keymap("n", "<leader>vc", "<cmd>lua require('telescope.builtin').find_files({hidden=true, cwd='~/.dotfiles/vim/.vim/custom/', prompt_title='<VimRC>'})<cr>", opts)
keymap("n", "<leader>lu", "<cmd>lua require('telescope.builtin').find_files({hidden=true, cwd='~/.dotfiles/vim/.vim/lua/', prompt_title='<Lua Files>'})<cr>", opts)
keymap("n", "<leader>ff", "<cmd>Telescope find_files<cr>", opts)
keymap("n", "<leader>fg", "<cmd>Telescope live_grep<cr>", opts)
keymap("n", "<leader>fb", "<cmd>Telescope buffers<cr>", opts)
keymap("n", "<leader>fh", "<cmd>Telescope help_tags<cr>", opts)

--- Nvim-Tree
keymap("n", "<leader>a", ":NvimTreeToggle<cr>", opts)
