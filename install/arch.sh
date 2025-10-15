#!/usr/bin/env bash
set -euo pipefail

# Arch Linux dotfiles installation script
echo "Installing packages for Arch Linux..."

# Update package database
echo "Updating package database..."
sudo pacman -Syu --noconfirm

# Install packages from official repositories
echo "Installing packages from official repositories..."
sudo pacman -S --noconfirm \
    stow \
    base-devel \
    curl \
    wget \
    git \
    htop \
    tree \
    jq \
    ripgrep \
    bat \
    fd \
    tmux \
    neovim \
    nodejs \
    npm \
    go \
    gnupg \
    protobuf \
    zsh \
    starship \
    zoxide \
    fzf \
    eza \
    git-delta \
    github-cli \
    lazygit \
    docker \
    docker-compose \
    python-pip \
    python-setuptools \
    make \
    gcc \
    unzip \
    zip

# Install AUR helper (yay) if not present
if ! command -v yay &> /dev/null; then
    echo "Installing yay AUR helper..."
    cd /tmp
    git clone https://aur.archlinux.org/yay.git
    cd yay
    makepkg -si --noconfirm
    cd ~
    rm -rf /tmp/yay
fi

# Install AUR packages
echo "Installing AUR packages..."
yay -S --noconfirm \
    lazydocker \
    bun-bin \
    mise \
    wezterm \
    yazi \
    tmux-plugin-manager

# Install Rust if not present
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source ~/.cargo/env
fi

# Install Node.js packages
echo "Installing Node.js packages..."
sudo npm install -g \
    dotenv-cli \
    ts-node \
    typescript-language-server \
    vercel \
    typescript \
    pnpm

# Install Python packages
echo "Installing Python packages..."
pip install --user uv

# Setup zsh plugins
echo "Setting up zsh plugins..."
mkdir -p ~/.zsh
if [ ! -d ~/.zsh/zsh-syntax-highlighting ]; then
    git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ~/.zsh/zsh-syntax-highlighting
fi
if [ ! -d ~/.zsh/zsh-autosuggestions ]; then
    git clone https://github.com/zsh-users/zsh-autosuggestions ~/.zsh/zsh-autosuggestions
fi

# Enable Docker service
echo "Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# Change shell to zsh if not already
if [ "$SHELL" != "/usr/bin/zsh" ] && [ "$SHELL" != "/bin/zsh" ]; then
    echo "Changing default shell to zsh..."
    chsh -s $(which zsh)
fi

echo "Arch Linux package installation complete!"
echo "Log out and back in to:"
echo "  - Use zsh as your default shell"
echo "  - Have Docker group permissions take effect"
echo "Run 'source ~/.zshrc' to load new shell configuration"
echo "For tmux plugins, run 'tmux' then 'prefix + I' to install plugins"