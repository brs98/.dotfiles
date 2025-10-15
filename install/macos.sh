#!/usr/bin/env bash
set -euo pipefail

# macOS dotfiles installation script
echo "Installing packages for macOS..."

# Install Homebrew if not present
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Update Homebrew
brew update

# Install Homebrew packages
echo "Installing Homebrew packages..."
brew install \
    gnu-stow \
    gnu-sed \
    nixpacks \
    freetds \
    libpq \
    libyaml \
    mise \
    gnumake \
    go \
    htop \
    rustup \
    tree \
    wget \
    jq \
    ripgrep \
    starship \
    zoxide \
    fzf \
    bat \
    eza \
    yazi \
    lazygit \
    lazydocker \
    git-delta \
    gh \
    tmux \
    neovim \
    nodejs \
    typescript \
    bun \
    pnpm \
    gnupg \
    protobuf \
    grpcurl \
    grpcui

# Install Homebrew casks
echo "Installing Homebrew casks..."
brew install --cask \
    dbeaver-community \
    maccy \
    font-hack-nerd-font \
    ngrok \
    postman \
    obs \
    wezterm \
    slack \
    linear-linear \
    nikitabobko/tap/aerospace \
    1password \
    orbstack \
    zen-browser \
    cursor \
    claude \
    claude-code \
    figma \
    spotify \
    raycast

# Install Rust if not present
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust via rustup..."
    rustup-init -y
    source ~/.cargo/env
fi

# Install Node.js packages
echo "Installing Node.js packages..."
npm install -g \
    dotenv-cli \
    ts-node \
    typescript-language-server \
    vercel \
    uv \
    trunk

# Setup zsh plugins
echo "Setting up zsh plugins..."
mkdir -p ~/.zsh
if [ ! -d ~/.zsh/zsh-syntax-highlighting ]; then
    git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ~/.zsh/zsh-syntax-highlighting
fi
if [ ! -d ~/.zsh/zsh-autosuggestions ]; then
    git clone https://github.com/zsh-users/zsh-autosuggestions ~/.zsh/zsh-autosuggestions
fi

# Setup tmux plugin manager
echo "Setting up tmux plugin manager..."
mkdir -p ~/.tmux/plugins
if [ ! -d ~/.tmux/plugins/tpm ]; then
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi

echo "macOS package installation complete!"
echo "Run 'source ~/.zshrc' to load new shell configuration"
echo "For tmux plugins, run 'tmux' then 'prefix + I' to install plugins"