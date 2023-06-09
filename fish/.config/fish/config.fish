alias v="nvim"
alias vim="nvim"
alias sd='cd $(fd . ~/ -E ~/opt/ -t d | fzf)'
alias ts='tmux-sessionizer'
alias lg='lazygit'

nvm use default --silent

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
eval /Users/Brandon/opt/anaconda3/bin/conda "shell.fish" "hook" $argv | source
# <<< conda initialize <<<


# bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH

# pnpm
set -gx PNPM_HOME "/Users/Brandon/Library/pnpm"
set -gx PATH "$PNPM_HOME" $PATH
# pnpm end

# local scripts
set --export PATH ~/.local/scripts/ $PATH
