# Path configuration
export PATH="$PATH:$HOME/.dotfiles/bin:$HOME/.bun/bin:$HOME/.local/bin"

# Add custom completions directory to fpath
fpath=(~/.dotfiles/bin $fpath)
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
    alias sdf="stow -t ~ -S git nvim wezterm starship zsh tmux scripts aerospace sketchybar"
else
    alias open="xdg-open"
    alias sdf="stow -t ~ -S git nvim wezterm starship zsh tmux scripts hyprpaper"
fi

# Initialize tools (these need to be installed separately)
# eval "$(starship init zsh)"
# eval "$(zoxide init zsh)"
# source ~/.config/fzf/fzf.zsh

# Load syntax highlighting and autosuggestions if available
# These need to be installed via package managers
[ -f ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ] && source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
[ -f ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh ] && source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh