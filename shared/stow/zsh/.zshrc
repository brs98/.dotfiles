# Load secrets (API keys, tokens) — machine-local, not in dotfiles
[[ -f ~/.secrets ]] && source ~/.secrets

# Path configuration
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/fvm/default/bin:$PATH"
export VISUAL="nvim"
export EDITOR="nvim"

# Initialize completions
autoload -U compinit && compinit

# History
HISTFILE="$HOME/.zsh_history"
HISTSIZE=50000
SAVEHIST=50000

# Zsh options
setopt AUTO_CD
setopt HIST_IGNORE_DUPS
setopt HIST_SAVE_NO_DUPS
setopt SHARE_HISTORY

# Aliases
alias p="pi"
alias c="claude --dangerously-skip-permissions"
alias cx="codex"
alias claudex="claude-gpt --permission-mode auto"
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

pi() {
  # Harness wrapper is for humans at a terminal. Agents, scripts, and pipes
  # get the bare binary so behavior matches a plain `pi` invocation.
  if [[ ! -o interactive || -n "${CLAUDECODE:-}" || ! -t 1 ]]; then
    command pi "$@"
    return
  fi

  local stamp="${XDG_CACHE_HOME:-$HOME/.cache}/pi-last-update"
  local now last
  local harness="${PI_DEFAULT_HARNESS:-minimal}"
  local pi_binary="${commands[pi]:-}"
  local skip_auto_update=0
  local enable_experimental=0
  local experimental_extensions_dir="$HOME/.dotfiles/shared/stow/pi/.pi/agent/extensions-experimental"
  local -a pi_args experimental_args
  pi_args=()
  experimental_args=()

  if [[ -z "$pi_binary" ]]; then
    printf 'pi: upstream Pi executable not found in PATH\n' >&2
    return 127
  fi

  case "${1:-}" in
    install|remove|uninstall|update|list|config)
      "$pi_binary" "$@"
      return
      ;;
    harness)
      shift
      pi-harness "$@"
      return
      ;;
    upstream)
      shift
      "$pi_binary" "$@"
      return
      ;;
    --harness)
      if (( $# < 2 )); then
        printf 'pi: --harness requires a harness name\n' >&2
        return 2
      fi
      harness="$2"
      shift 2
      ;;
    *)
      if [[ -n "${1:-}" ]] && pi-harness exists "$1"; then
        harness="$1"
        shift
      fi
      ;;
  esac

  case "${1:-}" in
    --help|-h|--version|-v)
      skip_auto_update=1
      ;;
  esac

  while (( $# > 0 )); do
    case "$1" in
      --experimental)
        enable_experimental=1
        ;;
      *)
        pi_args+=("$1")
        ;;
    esac
    shift
  done

  now=$(date +%s)
  last=$(cat "$stamp" 2>/dev/null || echo 0)

  if (( ! skip_auto_update && now - last > 86400 )); then
    mkdir -p "$(dirname "$stamp")"
    "$pi_binary" update >"${TMPDIR:-/tmp}/pi-update.log" 2>&1 && printf '%s\n' "$now" > "$stamp"
  fi

  if (( enable_experimental )) && [[ -d "$experimental_extensions_dir" ]]; then
    local extension_entry
    for extension_entry in ${experimental_extensions_dir}/*.ts(N) ${experimental_extensions_dir}/*/index.ts(N); do
      if [[ "$extension_entry" == */index.ts ]]; then
        experimental_args+=("-e" "${extension_entry:h}")
      else
        experimental_args+=("-e" "$extension_entry")
      fi
    done
  fi

  print -u2 "pi: harness=$harness (bare binary: 'pi upstream' or 'command pi')"
  PI_HARNESS_PI_BIN="$pi_binary" pi-harness "$harness" "${experimental_args[@]}" "${pi_args[@]}"
}

# Fusion Harness: official Claude Code subscription architect + ChatGPT Codex builder.
fusion() {
  pi fusion "$@"
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

# Agent skills: wrap the `npx skills` CLI so any add/update/remove/sync is
# immediately reconciled into the dotfiles repo (skills-sync), keeping authored
# and cloned skills tracked and in lockstep with the universal pool.
skills() {
  # npx is not a given — Arch ships nodejs without npm, so a machine can have
  # node and still have no npx. bunx runs the same package.
  local runner
  if command -v npx >/dev/null 2>&1; then
    runner=npx
  elif command -v bunx >/dev/null 2>&1; then
    runner=bunx
  else
    print -u2 "skills: neither npx nor bunx found"
    return 127
  fi

  command "$runner" -y skills "$@"
  local rc=$?
  case "${1:-}" in
    add|update|remove|uninstall|install|sync)
      command -v skills-sync >/dev/null 2>&1 && skills-sync --quiet || true ;;
  esac
  return $rc
}

# Platform overrides (stowed from mac/ or linux/)
[[ -f ~/.config/zsh/platform.zsh ]] && source ~/.config/zsh/platform.zsh

# Machine-local config (never committed)
[[ -f ~/.config/zsh/local.zsh ]] && source ~/.config/zsh/local.zsh

# Prime Agent
alias prime='prime-agent'
