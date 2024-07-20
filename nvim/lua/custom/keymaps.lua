local utils = require("../utils")
local default_keymap_opts = utils.default_keymap_opts
local addDescription = utils.addDescription

-------------------------------------------------------------
------------------------ NORMAL MODE ------------------------
-------------------------------------------------------------

-- Easier window navigation on CharaChorder / Master's Forge
vim.keymap.set("n", "<leader><Left>", "<C-w><Left>", addDescription("Move to left pane"))
vim.keymap.set("n", "<leader><Right>", "<C-w><Right>", addDescription("Move to right pane"))
vim.keymap.set("n", "<leader><Up>", "<C-w><Up>", addDescription("Move to upper pane"))
vim.keymap.set("n", "<leader><Down>", "<C-w><Down>", addDescription("Move to lower pane"))

-- Easier window navigation on QWERTY
vim.keymap.set("n", "<C-h>", "<C-w><C-h>", addDescription("Move to left pane"))
vim.keymap.set("n", "<C-l>", "<C-w><C-l>", addDescription("Move to right pane"))
vim.keymap.set("n", "<C-j>", "<C-w><C-j>", addDescription("Move to upper pane"))
vim.keymap.set("n", "<C-k>", "<C-w><C-k>", addDescription("Move to lower pane"))

-- Move to start of line
vim.keymap.set("n", "s", "^", default_keymap_opts)

-- Command S to save
vim.keymap.set("n", "<D-s>", ":w<CR>", default_keymap_opts)

-- Save and quit all
-- append default_keymap_opts to the end of the table and add a description
vim.keymap.set("n", "<leader>x", ":wa<CR>:qa<CR>", addDescription("Save and quit all"))

-- Create new line below and paste
vim.keymap.set("n", "<leader>p", 'A<CR><C-r>"', addDescription("Create new line below and paste"))

-- Create new line above and paste
vim.keymap.set("n", "<leader>P", 'kA<CR><C-r>"', addDescription("Create new line above and paste"))

-- Move line up and down
vim.keymap.set("n", "<leader>j", ":m .+1<CR>==", addDescription("Move line down"))
vim.keymap.set("n", "<leader>k", ":m .-2<CR>==", addDescription("Move line up"))

-- Keep cursor in the middle of the screen when finding next search occurrence
vim.keymap.set("n", "n", "nzzzv", default_keymap_opts)
vim.keymap.set("n", "N", "Nzzzv", default_keymap_opts)

-- Combine lines and keep cursor where it is
vim.keymap.set("n", "J", "mzJ`z", default_keymap_opts)

-- Delete line but don't yank it
vim.keymap.set("n", "dD", '"_dd', default_keymap_opts)

-- Restart the language server
vim.keymap.set("n", "<leader>rl", ":LspRestart<cr>", addDescription("[R]estart [L]anguage server"))

-- Copy file path to clipboard
vim.keymap.set("n", "<leader>fp", ':let @+ = expand("%")<cr>', addDescription("Copy [F]ile [P]ath to Clipboard"))

-- Delete file and buffer
vim.keymap.set("n", "<leader>fd", ':call delete(expand("%")) | bdelete!<cr>', addDescription("[F]ile [D]elete"))

-- Clear highlights from search on pressing <Esc> in normal mode
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<CR>")

-- Diagnostic keymaps
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Go to previous [D]iagnostic message" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Go to next [D]iagnostic message" })
vim.keymap.set("n", "<leader>cd", vim.diagnostic.open_float, addDescription("Open [C]ode [D]iagnostic"))
vim.keymap.set("n", "<leader>q", vim.diagnostic.setloclist, addDescription("Open [Q]uickfix diagnostic"))

-------------------------------------------------------------
--------------------- END NORMAL MODE -----------------------
-------------------------------------------------------------

-------------------------------------------------------------
------------------------ INSERT MODE ------------------------
-------------------------------------------------------------

-- Exit insert mode with jk or kj
vim.keymap.set("i", "jk", "<esc>", default_keymap_opts)
vim.keymap.set("i", "kj", "<esc>", default_keymap_opts)

-------------------------------------------------------------
--------------------- END INSERT MODE -----------------------
-------------------------------------------------------------

-------------------------------------------------------------
------------------------ VISUAL MODE ------------------------
-------------------------------------------------------------
-- Move selection up and down
vim.keymap.set("v", "<leader>j", ":m .+1<CR>==", addDescription("Move selection down"))
vim.keymap.set("v", "<leader>k", ":m .-2<CR>==", addDescription("Move selection up"))

-- Exit visual mode with JK or KJ
vim.keymap.set("v", "JK", "<esc>", default_keymap_opts)
vim.keymap.set("v", "KJ", "<esc>", default_keymap_opts)

-- Paste over text but don't yank it
vim.keymap.set("v", "p", '"_dp"', default_keymap_opts)
vim.keymap.set("v", "P", '"_dP"', default_keymap_opts)

-- Move selection up and down
vim.keymap.set("v", "<C-j>", ":move '>+1<CR>gv-gv", default_keymap_opts)
vim.keymap.set("v", "<C-k>", ":move '<-2<CR>gv-gv", default_keymap_opts)

-- Move to start of line
vim.keymap.set("v", "s", "^", default_keymap_opts)
-------------------------------------------------------------
--------------------- END VISUAL MODE -----------------------
-------------------------------------------------------------

-------------------------------------------------------------
---------------------- TERMINAL MODE ------------------------
-------------------------------------------------------------

-- Exit terminal mode in the builtin terminal
vim.keymap.set("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-------------------------------------------------------------
-------------------- END TERMINAL MODE ----------------------
-------------------------------------------------------------
