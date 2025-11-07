#!/usr/bin/env bash

set -e

echo "Installing dotfiles..."

# Navigate to dotfiles directory
cd "$(dirname "$0")"

# Stow all shared configs
echo "  → Stowing shared configs..."
(cd shared && stow -t ~ *)

# Stow platform-specific configs
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  → Detected macOS, stowing mac configs..."
    (cd mac && stow -t ~ *)
else
    echo "  → Detected Linux, stowing linux configs..."
    (cd linux && stow -t ~ *)
fi

echo "✓ Dotfiles installed successfully!"
echo ""
echo "Note: Make sure you have the following tools installed:"
echo "  - starship (prompt)"
echo "  - zoxide (smart cd)"
echo "  - eza (better ls)"
echo "  - bat (better cat)"
echo "  - lazygit"
echo "  - nvim"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  - pbcopy (should be pre-installed)"
    echo "  - aerospace (window manager)"
    echo "  - sketchybar (status bar)"
else
    echo "  - wl-copy or xclip (clipboard)"
    echo "  - hyprland or your preferred window manager"
fi
