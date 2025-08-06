# Dotfiles Project Overview

## Purpose
This is a cross-platform dotfiles repository built with Nix Flakes, supporting both macOS (via nix-darwin) and Linux (via NixOS). The configuration uses Home Manager for user-level package management and application configurations.

## Tech Stack
- **Nix Flakes**: Declarative system configuration management
- **nix-darwin**: macOS system configuration framework
- **Home Manager**: User environment management across platforms
- **NixOS**: Linux system configuration
- **Zsh**: Shell with custom aliases and integrations
- **Neovim**: Primary editor with Lua configuration
- **WezTerm/Kitty**: Terminal emulators

## System Configurations
- `brandon-mac`: Primary macOS configuration (aarch64-darwin)  
- `Brandons-Macbook-Pro`: Alternative macOS configuration name (aarch64-darwin)
- `brandon-linux`: Linux configuration (x86_64-linux)

## Architecture
- `flake.nix`: Main flake configuration defining system outputs
- `nix-darwin/`: macOS-specific system configuration
- `nixos/`: Linux-specific system configuration  
- `home-manager/`: User-level cross-platform configuration
  - `systems/`: Platform-specific user configs (mac.nix, linux.nix)
  - `modules/`: Reusable configuration modules
  - `configs/`: Application-specific configuration files