"Leader
nnoremap <SPACE> <Nop>
let mapleader=" "

"Escape
inoremap jj <ESC>
vnoremap jk <ESC>

"Toogle NerdTree
nmap mm :NERDTreeToggle<CR>

"Move lines
vnoremap J :m '>+1<CR>gv=gv
vnoremap K :m '<-2<CR>gv=gv
nnoremap <leader>j :m .+1<CR>==
nnoremap <leader>k :m .-2<CR>==

"Keep jumps centered
nnoremap n nzzzv
nnoremap N Nzzzv
nnoremap J mzJ`z

"Copy to system clipboard
nnoremap <leader>y "*y
vnoremap <leader>y "*y

"Run python file - saves, clears terminal, runs file
nnoremap <leader>r :w<CR>:!python %<CR>

"Run cpp file - saves and runs makefile
nnoremap <leader>cp :w<CR>:!make<CR>

"Switch between most recent file
nnoremap <leader><SPACE> <C-^>

"Wrap word in parentheses
nnoremap <leader>( cw()<Esc>PF(i

"Vim splits
nnoremap <leader>vs <C-w>v
nnoremap <leader>hs <C-w>s
nnoremap <leader>wj <C-w>j
nnoremap <leader>wk <C-w>k
nnoremap <leader>wh <C-w>h
nnoremap <leader>wl <C-w>l

"Toggle line numbers
nnoremap <leader>nn :set invrelativenumber<CR>

"Go to start of text on line
nnoremap s ^
