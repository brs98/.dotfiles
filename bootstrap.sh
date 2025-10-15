#!/usr/bin/env bash
set -euo pipefail

# Bootstrap script for GNU Stow dotfiles
echo "🚀 Bootstrapping dotfiles with GNU Stow..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    STOW_PACKAGES="git nvim wezterm starship zsh tmux scripts aerospace sketchybar"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Detect if Arch Linux
    if [ -f /etc/arch-release ]; then
        OS="arch"
        STOW_PACKAGES="git nvim wezterm starship zsh tmux scripts hyprpaper"
    else
        OS="linux"
        STOW_PACKAGES="git nvim wezterm starship zsh tmux scripts hyprpaper"
    fi
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

echo "📋 Detected OS: $OS"

# Change to dotfiles directory
DOTFILES_DIR="$HOME/.dotfiles"
if [[ ! -d "$DOTFILES_DIR" ]]; then
    echo "❌ Dotfiles directory not found at $DOTFILES_DIR"
    echo "Please clone your dotfiles repository to $DOTFILES_DIR first"
    exit 1
fi

cd "$DOTFILES_DIR"

# Install packages
echo "📦 Installing packages for $OS..."
case "$OS" in
    "macos")
        ./install/macos.sh
        ;;
    "arch")
        ./install/arch.sh
        ;;
    *)
        ./install/linux.sh
        ;;
esac

# Check if stow is available
if ! command -v stow &> /dev/null; then
    echo "❌ GNU Stow is not installed. Please install it first."
    exit 1
fi

# Backup existing files that might conflict
echo "🛡️ Backing up existing configuration files..."
BACKUP_DIR="$HOME/.dotfiles-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

for package in $STOW_PACKAGES; do
    case $package in
        git)
            [[ -f ~/.config/git/config ]] && mv ~/.config/git/config "$BACKUP_DIR/"
            ;;
        nvim)
            [[ -d ~/.config/nvim ]] && mv ~/.config/nvim "$BACKUP_DIR/"
            ;;
        wezterm)
            [[ -f ~/.config/wezterm/wezterm.lua ]] && mv ~/.config/wezterm/wezterm.lua "$BACKUP_DIR/"
            ;;
        starship)
            [[ -f ~/.config/starship.toml ]] && mv ~/.config/starship.toml "$BACKUP_DIR/"
            ;;
        zsh)
            [[ -f ~/.zshrc ]] && mv ~/.zshrc "$BACKUP_DIR/"
            ;;
        tmux)
            [[ -f ~/.tmux.conf ]] && mv ~/.tmux.conf "$BACKUP_DIR/"
            ;;
        scripts)
            [[ -d ~/.local/bin ]] && mv ~/.local/bin "$BACKUP_DIR/"
            ;;
        aerospace)
            [[ -f ~/.config/aerospace/aerospace.toml ]] && mv ~/.config/aerospace/aerospace.toml "$BACKUP_DIR/"
            ;;
        sketchybar)
            [[ -d ~/.config/sketchybar ]] && mv ~/.config/sketchybar "$BACKUP_DIR/"
            ;;
        hyprpaper)
            [[ -f ~/.config/hyprpaper.conf ]] && mv ~/.config/hyprpaper.conf "$BACKUP_DIR/"
            ;;
    esac
done

# Use GNU Stow to create symlinks
echo "🔗 Creating symlinks with GNU Stow..."
stow -t ~ $STOW_PACKAGES

# Set executable permissions on scripts
echo "🔧 Setting executable permissions on scripts..."
find ~/.local/bin -type f -exec chmod +x {} \;

# Initialize shell integrations
echo "🐚 Initializing shell integrations..."

# Update shell RC to source our configuration
if command -v starship &> /dev/null; then
    if ! grep -q "starship init zsh" ~/.zshrc; then
        echo 'eval "$(starship init zsh)"' >> ~/.zshrc
    fi
fi

if command -v zoxide &> /dev/null; then
    if ! grep -q "zoxide init zsh" ~/.zshrc; then
        echo 'eval "$(zoxide init zsh)"' >> ~/.zshrc
    fi
fi

if command -v fzf &> /dev/null; then
    if [[ -f ~/.fzf/shell/key-bindings.zsh ]] && ! grep -q "fzf.*key-bindings" ~/.zshrc; then
        echo 'source ~/.fzf/shell/key-bindings.zsh' >> ~/.zshrc
        echo 'source ~/.fzf/shell/completion.zsh' >> ~/.zshrc
    fi
fi

echo "✅ Bootstrap complete!"
echo ""
echo "📝 Next steps:"
echo "1. Restart your terminal or run: source ~/.zshrc"
echo "2. For tmux plugins, run 'tmux' then 'prefix + I' to install plugins"
echo "3. Configuration backups saved to: $BACKUP_DIR"
echo ""
echo "🏠 Your dotfiles are now managed with GNU Stow!"
echo "Use 'stow -t ~ -S <package>' to add new packages"
echo "Use 'stow -t ~ -D <package>' to remove packages"
echo "Use 'stow -t ~ -R <package>' to restow packages"