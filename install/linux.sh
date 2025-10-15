#!/usr/bin/env bash
set -euo pipefail

# Linux dotfiles installation script
echo "Installing packages for Linux..."

# Detect package manager
if command -v apt &> /dev/null; then
    PKG_MANAGER="apt"
    INSTALL_CMD="apt install -y"
    UPDATE_CMD="apt update"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    INSTALL_CMD="yum install -y"
    UPDATE_CMD="yum update -y"
elif command -v pacman &> /dev/null; then
    PKG_MANAGER="pacman"
    INSTALL_CMD="pacman -S --noconfirm"
    UPDATE_CMD="pacman -Syu --noconfirm"
else
    echo "No supported package manager found (apt, yum, or pacman)"
    exit 1
fi

echo "Detected package manager: $PKG_MANAGER"

# Update package lists
echo "Updating package lists..."
sudo $UPDATE_CMD

# Install base packages
echo "Installing base packages..."
case $PKG_MANAGER in
    "apt")
        sudo $INSTALL_CMD \
            stow \
            build-essential \
            curl \
            wget \
            git \
            htop \
            tree \
            jq \
            ripgrep \
            bat \
            fd-find \
            tmux \
            neovim \
            nodejs \
            npm \
            golang-go \
            gnupg \
            protobuf-compiler \
            zsh
        ;;
    "yum")
        sudo $INSTALL_CMD \
            stow \
            gcc \
            make \
            curl \
            wget \
            git \
            htop \
            tree \
            jq \
            ripgrep \
            bat \
            fd-find \
            tmux \
            neovim \
            nodejs \
            npm \
            golang \
            gnupg2 \
            protobuf-compiler \
            zsh
        ;;
    "pacman")
        sudo $INSTALL_CMD \
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
            zsh
        ;;
esac

# Install tools that need special handling
echo "Installing additional tools..."

# Install starship
if ! command -v starship &> /dev/null; then
    curl -sS https://starship.rs/install.sh | sh -s -- -y
fi

# Install zoxide
if ! command -v zoxide &> /dev/null; then
    curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash
fi

# Install eza (modern ls replacement)
if ! command -v eza &> /dev/null; then
    case $PKG_MANAGER in
        "apt")
            sudo apt update
            sudo apt install -y gpg
            wget -qO- https://raw.githubusercontent.com/eza-community/eza/main/deb.asc | sudo gpg --dearmor -o /etc/apt/keyrings/gierens.gpg
            echo "deb [signed-by=/etc/apt/keyrings/gierens.gpg] http://deb.gierens.de stable main" | sudo tee /etc/apt/sources.list.d/gierens.list
            sudo apt update
            sudo apt install -y eza
            ;;
        *)
            cargo install eza
            ;;
    esac
fi

# Install lazygit
if ! command -v lazygit &> /dev/null; then
    LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\K[^"]*')
    curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"
    tar xf lazygit.tar.gz lazygit
    sudo install lazygit /usr/local/bin
    rm lazygit lazygit.tar.gz
fi

# Install lazydocker
if ! command -v lazydocker &> /dev/null; then
    curl https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash
fi

# Install yazi
if ! command -v yazi &> /dev/null; then
    cargo install --locked yazi-fm yazi-cli
fi

# Install fzf
if ! command -v fzf &> /dev/null; then
    git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
    ~/.fzf/install --all
fi

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
    bun \
    pnpm

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

# Change shell to zsh if not already
if [ "$SHELL" != "/usr/bin/zsh" ] && [ "$SHELL" != "/bin/zsh" ]; then
    echo "Changing default shell to zsh..."
    chsh -s $(which zsh)
fi

echo "Linux package installation complete!"
echo "Log out and back in to use zsh as your default shell"
echo "Run 'source ~/.zshrc' to load new shell configuration"
echo "For tmux plugins, run 'tmux' then 'prefix + I' to install plugins"