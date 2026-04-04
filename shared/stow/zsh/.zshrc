# Load secrets (API keys, tokens) — machine-local, not in dotfiles
[[ -f ~/.secrets ]] && source ~/.secrets

# Path configuration
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

# Initialize completions
autoload -U compinit && compinit

# Zsh options
setopt AUTO_CD
setopt HIST_IGNORE_DUPS
setopt HIST_SAVE_NO_DUPS
setopt SHARE_HISTORY

# Aliases
alias c="claude --dangerously-skip-permissions"
alias cat="bat --theme=base16"
alias cdc="cd ~/.config/"
alias cdd="cd ~/.dotfiles/"
alias ldk="lazydocker"
alias lg="lazygit"
alias sdf="cd ~/.dotfiles && ./install.sh"
alias v="nvim"
alias vim="nvim"

# Directories
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

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

# Better ls
if command -v eza &> /dev/null; then
  alias ls="eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions --group-directories-first"
  alias lsa='ls -a'
  alias lt='eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions --group-directories-first --tree --level=2'
  alias lta='lt -a'
fi

# Fuzzy finder — prefer tv, fall back to fzf
if command -v tv &> /dev/null; then
  eval "$(tv init zsh)"
  alias ff="tv files"
elif command -v fzf &> /dev/null; then
  source <(fzf --zsh)
  alias ff="fzf --preview 'bat --style=numbers --color=always {}'"
fi

# Initialize tools
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
if command -v mise &> /dev/null; then
  eval "$(mise activate zsh)"
fi
if command -v wt &> /dev/null; then
  eval "$(command wt config shell init zsh)"
fi

# Platform overrides (stowed from mac/ or linux/)
[[ -f ~/.config/zsh/platform.zsh ]] && source ~/.config/zsh/platform.zsh

# Machine-local config (never committed)
[[ -f ~/.config/zsh/local.zsh ]] && source ~/.config/zsh/local.zsh
