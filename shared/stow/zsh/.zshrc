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
alias c="claude"
alias cat="bat --theme=base16"

# Better cd
if command -v zoxide &> /dev/null; then
  alias cd="zd"
  zd() {
    if [ $# -eq 0 ]; then
      builtin cd ~ && return
    elif [ -d "$1" ]; then
      builtin cd "$1"
    else
      z "$@" && printf "\U000F17A9 " && pwd || echo "Error: Directory not found"
    fi
  }
fi

open() {
  xdg-open "$@" >/dev/null 2>&1 &
}

alias cdc="cd ~/.config/"
alias cdd="cd ~/.dotfiles/"
alias ff="fzf --preview 'bat --style=numbers --color=always {}'"
alias ldk="lazydocker"
alias lg="lazygit"

# Directories
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# File system
if command -v eza &> /dev/null; then
	alias ls="eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions --group-directories-first"
	alias lsa='ls -a'
	alias lt='eza --tree --level=2 --long --icons --git'
	alias lta='lt -a'
fi

alias sdf="cd ~/.dotfiles && ./install.sh"

alias v="nvim"
alias vim="nvim"

# Initialize tools (these need to be installed separately)
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"

# Load zsh plugins
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
