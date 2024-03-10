alias v="nvim"
alias vim="nvim"
alias ff='find_directories'
alias ts='tmux-sessionizer'
alias lg='lazygit'
alias fdf='find_dotfiles'
alias gt-done='gt s -mnp && gt trunk && gt sync'

# local scripts
set --export PATH ~/.local/scripts/ $PATH

# pnpm
set -gx PNPM_HOME /Users/brandonsouthwick/Library/pnpm
if not string match -q -- $PNPM_HOME $PATH
    set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end
