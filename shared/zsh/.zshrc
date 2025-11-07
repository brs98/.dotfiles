# Path configuration
export PATH="$PATH:$HOME/.bun/bin:$HOME/.local/bin"

# Initialize completions
autoload -U compinit && compinit

# Zsh options
setopt AUTO_CD
setopt HIST_IGNORE_DUPS
setopt HIST_SAVE_NO_DUPS
setopt SHARE_HISTORY

# Aliases
alias v="nvim"
alias vim="nvim"
alias lg="lazygit"
alias ldk="lazydocker"
alias cat="bat --theme=base16"
alias ls="eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions"
alias cd="z"
alias cdd="cd ~/.dotfiles/"
alias c="claude"

# Platform specific aliases
if [[ "$OSTYPE" == "darwin"* ]]; then
    alias open="open"
    alias sdf="cd ~/.dotfiles && (cd shared && stow -t ~ *) && (cd mac && stow -t ~ *)"
else
    alias open="xdg-open"
    alias sdf="cd ~/.dotfiles && (cd shared && stow -t ~ *) && (cd linux && stow -t ~ *)"
fi

# Initialize tools (these need to be installed separately)
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"

plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
