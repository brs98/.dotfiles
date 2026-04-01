# Load secrets (API keys, tokens) — machine-local, not in dotfiles
[[ -f ~/.secrets ]] && source ~/.secrets

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
alias c="claude --dangerously-skip-permissions"
alias cat="bat --theme=base16"
alias mizu="ssh mizu@100.121.123.91"

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

# open() {
#   xdg-open "$@" >/dev/null 2>&1 &
# }

alias cdc="cd ~/.config/"
alias cdd="cd ~/.dotfiles/"
alias ff="tv files"
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
	alias lt='eza  --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions --group-directories-first --tree --level=2'
	alias lta='lt -a'
fi

# Create worktree in current terminal
new() {
  local worktree_name="" cwd=~/work/fluid-mono-with-backend/fluid-mono.git default_branch=main

  while [[ $# -gt 0 ]]; do
    case $1 in
      -f|--frontend) cwd=~/work/fluid-mono-with-backend/fluid-mono.git; default_branch=main; shift ;;
      -b|--backend) cwd=~/work/fluid-mono-with-backend/fluid.git; default_branch=master; shift ;;
      --cwd) cwd="$2"; shift 2 ;;
      *) worktree_name="$1"; shift ;;
    esac
  done

  if [[ -z "$worktree_name" ]]; then
    echo "Usage: new <worktree-name> [-f|--frontend] [-b|--backend] [--cwd <dir>]"
    return 1
  fi

  builtin cd "$cwd/$default_branch" || { echo "Error: could not cd to $cwd/$default_branch"; return 1; }
  git checkout "$default_branch" || return 1
  git pull origin "$default_branch" || return 1
  builtin cd "$cwd" || return 1
  git worktree add "$worktree_name" || { echo "Error: could not create worktree '$worktree_name'"; return 1; }
  builtin cd "$worktree_name" || return 1
  git push -u || return 1
  echo "Created git worktree '$worktree_name'"
}

# Checkout existing remote branch as worktree in current terminal
checkout() {
  local branch_name="" cwd=~/work/fluid-mono-with-backend/fluid-mono.git default_branch=main

  while [[ $# -gt 0 ]]; do
    case $1 in
      -f|--frontend) cwd=~/work/fluid-mono-with-backend/fluid-mono.git; default_branch=main; shift ;;
      -b|--backend) cwd=~/work/fluid-mono-with-backend/fluid.git; default_branch=master; shift ;;
      --cwd) cwd="$2"; shift 2 ;;
      *) branch_name="$1"; shift ;;
    esac
  done

  if [[ -z "$branch_name" ]]; then
    echo "Usage: checkout <branch-name> [-f|--frontend] [-b|--backend] [--cwd <dir>]"
    return 1
  fi

  builtin cd "$cwd/$default_branch" || { echo "Error: could not cd to $cwd/$default_branch"; return 1; }
  git fetch origin '+refs/heads/*:refs/remotes/origin/*' || return 1
  builtin cd "$cwd" || return 1
  git worktree add "$branch_name" "origin/$branch_name" || { echo "Error: could not create worktree '$branch_name'"; return 1; }
  builtin cd "$branch_name" || return 1
  git checkout -b "$branch_name" || return 1
  git branch -u "origin/$branch_name" || return 1
  echo "Created git worktree '$branch_name' tracking origin/$branch_name"
}

alias sdf="cd ~/.dotfiles && ./install.sh"

alias v="nvim"
alias vim="nvim"

# Initialize tools (these need to be installed separately)
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"

# Load zsh plugins
eval "$(tv init zsh)"

# Load zsh-autosuggestions based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
  source $(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
else
  # Linux
  source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
  source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
fi
eval "$(mise activate zsh)"

# Local binaries
export PATH="$HOME/.local/bin:$PATH"

# pnpm
export PNPM_HOME="/Users/brandon/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi
