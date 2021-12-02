call plug#begin()
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'gruvbox-community/gruvbox'
Plug 'scrooloose/nerdtree'
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-treesitter/nvim-treesitter'
Plug 'nvim-telescope/telescope.nvim'
Plug 'nvim-telescope/telescope-fzy-native.nvim'
Plug 'scrooloose/nerdcommenter'
Plug 'octol/vim-cpp-enhanced-highlight'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'tpope/vim-fugitive'
Plug 'prettier/vim-prettier', { 'do': 'npm install' }
Plug 'mxw/vim-jsx'
Plug 'pangloss/vim-javascript'
call plug#end()

"Coc config
source ~/.vim/coc.vim

"NERDTree Config
let g:NERDTreeIgnore = ['^node_modules$']

"Gruvbox config
colorscheme gruvbox

"Nerd Commenter mappings
vmap <leader>cc <plug>NERDCommenterToggle
nmap <leader>cc <plug>NERDCommenterToggle

"Telescope mappings
nnoremap <leader>ff <cmd>Telescope find_files<cr>
nnoremap <leader>fg <cmd>Telescope live_grep<cr>
nnoremap <leader>fb <cmd>Telescope buffers<cr>
nnoremap <leader>fh <cmd>Telescope help_tags<cr>

"Airline theme
let g:airline_theme='base16'
let g:airline_section_z=''
let g:airline_section_y=''
let g:airline_skip_empty_sections = 1
let g:airline#extensions#whitespace#enabled = 0

"Prettier
command! -nargs=0 Prettier :call CocAction('runCommand', 'prettier.formatFile')

