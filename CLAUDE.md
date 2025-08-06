# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a cross-platform dotfiles repository built with Nix Flakes, supporting both macOS (via nix-darwin) and Linux (via NixOS). The configuration uses Home Manager for user-level package management and application configurations.

## System Management Commands

### macOS (nix-darwin)
```bash
# Apply dotfiles configuration (from ~/.dotfiles directory)
darwin-rebuild switch --flake ~/.dotfiles

# Alternative using the configured alias
sdf

# Check what changes would be applied
darwin-rebuild build --flake ~/.dotfiles
```

### Linux (NixOS)
```bash
# Apply system configuration
sudo nixos-rebuild switch --flake ~/.dotfiles

# Check what changes would be applied
sudo nixos-rebuild build --flake ~/.dotfiles
```

### General Nix Commands
```bash
# Update flake inputs
nix flake update

# Check flake for issues
nix flake check

# Clean up old generations and garbage collect
nix-collect-garbage -d
sudo nix-collect-garbage -d  # On NixOS for system-level cleanup
```

## Architecture

### Configuration Structure
- `flake.nix`: Main flake configuration defining system outputs for both platforms
- `nix-darwin/`: macOS-specific system configuration
  - `configuration.nix`: Core darwin system settings
  - `packages.nix`: System-level packages
  - `homebrew.nix`: Homebrew package definitions
  - `services.nix`: System services configuration
  - `shell-applications.nix`: Shell applications setup
- `nixos/`: Linux-specific system configuration
  - `configuration.nix`: NixOS system configuration
  - `hardware-configuration.nix`: Hardware-specific settings (auto-generated)
- `home-manager/`: User-level configuration (cross-platform)
  - `systems/mac.nix`: macOS user configuration
  - `systems/linux.nix`: Linux user configuration
  - `modules/`: Reusable configuration modules
  - `configs/`: Application-specific configuration files

### System Configurations Defined
- `brandon-mac`: Primary macOS configuration (aarch64-darwin)
- `Brandons-Macbook-Pro`: Alternative macOS configuration name (aarch64-darwin)
- `brandon-linux`: Linux configuration (x86_64-linux)

### Key Configuration Modules
- `git.nix`: Git configuration and aliases
- `neovim.nix`: Neovim setup with custom configurations
- `terminal.nix`: Terminal emulator and shell tools configuration

### Application Configurations
- **Neovim**: Comprehensive Lua-based configuration using Lazy.nvim plugin manager
  - Location: `home-manager/configs/nvim/`
  - Based on kickstart.nvim structure with custom plugins and configurations
- **WezTerm**: Terminal emulator configuration
- **Starship**: Shell prompt configuration
- **SketchyBar**: macOS status bar (currently commented out)
- **AeroSpace**: macOS window manager configuration

### Development Tools Included
- **Languages**: Node.js 22, Go, Rust (via rustup), TypeScript
- **Version Control**: Git with delta, lazygit, GitHub CLI
- **Editors**: Neovim with LSP support
- **Shell Tools**: zsh, fzf, ripgrep, bat, eza, zoxide, yazi
- **Development**: Docker (Linux), various language servers and development tools

### Platform Differences
- **macOS**: Relies on Homebrew for certain GUI applications and system-specific tools
- **Linux**: Full NixOS configuration including desktop environment (Hyprland/Sway), graphics drivers, and system services
- **Home Manager**: Shared user-level configuration with platform-specific overrides

### Flake Inputs
The configuration uses several external flake inputs including:
- `nixpkgs`: Main package repository (nixpkgs-unstable)
- `home-manager`: User environment manager
- `darwin`: macOS system configuration framework
- `hyprland`: Wayland compositor (Linux only)
- `catppuccin`: Color scheme theme
- `wezterm`: Terminal emulator
- `ghostty`: Alternative terminal emulator

## Common Workflows

### Adding New Packages
1. For system-wide packages: Add to appropriate `packages.nix` file
2. For user packages: Add to `home.packages` in system-specific configuration
3. Rebuild configuration using appropriate command above

### Modifying Application Configurations
1. Edit configuration files in `home-manager/configs/`
2. Rebuild to apply changes
3. Some applications may require restart

### Managing Secrets
The configuration uses `pass` (password-store) for secret management on macOS. GPG is configured for cryptographic operations.