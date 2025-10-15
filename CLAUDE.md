# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a cross-platform dotfiles repository managed with GNU Stow, supporting both macOS and Linux. Configuration files are organized into stow packages for easy symlink management.

## System Management Commands

### GNU Stow Commands
```bash
# Apply all dotfiles configurations
./bootstrap.sh

# Apply specific packages (from ~/.dotfiles directory)
stow -t ~ git nvim wezterm starship zsh tmux scripts

# Remove specific packages
stow -t ~ -D git nvim wezterm

# Restow packages (useful after config changes)
stow -t ~ -R git nvim wezterm

# Alternative using the configured alias
sdf  # Stows all relevant packages for current platform
```

### Package Installation
```bash
# Install packages for macOS
./install/macos.sh

# Install packages for Arch Linux
./install/arch.sh

# Install packages for other Linux distros
./install/linux.sh

# Full bootstrap (packages + stow) - auto-detects OS
./bootstrap.sh
```

## Architecture

### Configuration Structure
- `stow/`: GNU Stow packages containing configuration files
  - `git/`: Git configuration and aliases
  - `nvim/`: Neovim setup with custom configurations
  - `wezterm/`: WezTerm terminal emulator configuration
  - `starship/`: Starship shell prompt configuration
  - `zsh/`: Zsh shell configuration and aliases
  - `tmux/`: Tmux terminal multiplexer configuration
  - `scripts/`: Custom utility scripts
  - `aerospace/`: AeroSpace window manager (macOS)
  - `sketchybar/`: SketchyBar status bar (macOS)
  - `hyprpaper/`: Hyprpaper wallpaper manager (Linux)
- `install/`: Package installation scripts
  - `macos.sh`: Homebrew and macOS-specific packages
  - `arch.sh`: Arch Linux packages using pacman and AUR
  - `linux.sh`: Generic Linux distribution package installation
- `bootstrap.sh`: Main setup script that installs packages and stows configs

### Stow Package Structure
Each stow package follows the standard directory structure:
```
stow/package-name/
├── .config/           # XDG config files
│   └── app/
├── .local/bin/        # User scripts
├── .zshrc             # Shell RC files
└── .tmux.conf         # Home directory dotfiles
```

### Application Configurations
- **Neovim**: Comprehensive Lua-based configuration using Lazy.nvim plugin manager
  - Location: `stow/nvim/.config/nvim/`
  - Based on kickstart.nvim structure with custom plugins and configurations
- **WezTerm**: Terminal emulator configuration at `stow/wezterm/.config/wezterm/wezterm.lua`
- **Starship**: Shell prompt configuration at `stow/starship/.config/starship.toml`
- **Zsh**: Shell configuration with aliases and integrations
- **Tmux**: Terminal multiplexer with vim-style keybindings
- **Git**: Version control configuration with aliases and delta integration

### Development Tools Included
- **Languages**: Node.js, Go, Rust (via rustup), TypeScript
- **Version Control**: Git with delta, lazygit, GitHub CLI
- **Editors**: Neovim with LSP support
- **Shell Tools**: zsh, fzf, ripgrep, bat, eza, zoxide, yazi
- **Development**: Various language servers and development tools

### Platform Differences
- **macOS**: Uses Homebrew for package management and GUI applications
- **Arch Linux**: Uses pacman for official packages and yay for AUR packages, includes Docker setup
- **Other Linux**: Uses native package managers (apt/yum/pacman) with additional tool installations
- **Stow Packages**: Platform-specific packages (aerospace/sketchybar for macOS, hyprpaper for Linux)

## Common Workflows

### Adding New Packages
1. Add package to appropriate installation script (`install/macos.sh` or `install/linux.sh`)
2. Run the installation script or `./bootstrap.sh` to install
3. For GUI applications on macOS, add to Homebrew casks section

### Adding New Configuration Files
1. Create a new stow package: `mkdir -p stow/app-name/.config/app-name`
2. Add configuration files to the package following stow structure
3. Add package name to `STOW_PACKAGES` in `bootstrap.sh`
4. Run `stow -t ~ app-name` to create symlinks

### Modifying Application Configurations
1. Edit configuration files in `stow/package-name/`
2. Changes are immediately reflected (symlinks point to stow directory)
3. Some applications may require restart to pick up changes

### Managing Multiple Machines
1. Clone repository to `~/.dotfiles` on new machine
2. Run `./bootstrap.sh` to install packages and configure
3. Platform-specific packages are automatically handled