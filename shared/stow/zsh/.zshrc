# Load secrets (API keys, tokens) — machine-local, not in dotfiles
[[ -f ~/.secrets ]] && source ~/.secrets

# Path configuration
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
export VISUAL="nvim"
export EDITOR="nvim"

# Initialize completions
autoload -U compinit && compinit

# Zsh options
setopt AUTO_CD
setopt HIST_IGNORE_DUPS
setopt HIST_SAVE_NO_DUPS
setopt SHARE_HISTORY

# Aliases
alias p="pi"
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

# Pi
export PI_SKIP_VERSION_CHECK=1
alias piar="pi --agent-router"

pi() {
  local stamp="${XDG_CACHE_HOME:-$HOME/.cache}/pi-last-update"
  local now last
  local enable_agent_router=0
  local agent_router_extension="$HOME/.dotfiles/shared/stow/pi/.pi/agent/extensions-experimental/agent-router"
  local -a pi_args
  pi_args=()

  while (( $# > 0 )); do
    case "$1" in
      --agent-router)
        enable_agent_router=1
        ;;
      *)
        pi_args+=("$1")
        ;;
    esac
    shift
  done

  now=$(date +%s)
  last=$(cat "$stamp" 2>/dev/null || echo 0)

  if (( now - last > 86400 )); then
    mkdir -p "$(dirname "$stamp")"
    command pi update >/tmp/pi-update.log 2>&1 && printf '%s\n' "$now" > "$stamp"
  fi

  if (( enable_agent_router )); then
    command pi -e "$agent_router_extension" "${pi_args[@]}"
  else
    command pi "${pi_args[@]}"
  fi
}

# Conveyor
conveyor() {
  bun --env-file=/Users/brandon/personal/conveyor/.env \
    /Users/brandon/personal/conveyor/packages/cli/src/main.ts "$@"
}

# Fuzzy finder — prefer tv, fall back to fzf
if command -v tv &> /dev/null; then
  eval "$(tv init zsh)"
  alias ff="tv files"
elif command -v fzf &> /dev/null; then
  source <(fzf --zsh)
  alias ff="fzf --preview 'bat --style=numbers --color=always {}'"
fi

# Initialize tools
command -v starship &> /dev/null && eval "$(starship init zsh)"
command -v zoxide &> /dev/null && eval "$(zoxide init zsh)"
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
