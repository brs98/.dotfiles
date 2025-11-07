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
    (cd linux && for dir in */; do
        if [ "$dir" != "omarchy/" ] && [ "$dir" != "hypr/" ]; then
            stow -t ~ "${dir%/}"
        fi
    done)

    echo "  → Creating symlinks for omarchy configs..."
    # Create symlinks for all files in omarchy config directory
    OMARCHY_SOURCE="$PWD/linux/omarchy/.config/omarchy"
    OMARCHY_TARGET="$HOME/.config/omarchy"

    if [ -d "$OMARCHY_SOURCE" ]; then
        # Find all files (not directories) in the omarchy config
        while IFS= read -r -d '' file; do
            # Get the relative path from the omarchy config directory
            rel_path="${file#$OMARCHY_SOURCE/}"
            target_file="$OMARCHY_TARGET/$rel_path"
            target_dir="$(dirname "$target_file")"

            # Create target directory if it doesn't exist
            mkdir -p "$target_dir"

            # Create symlink
            ln -sf "$file" "$target_file"
        done < <(find "$OMARCHY_SOURCE" -type f -print0)

        echo "    ✓ Omarchy symlinks created"
    fi

    echo "  → Creating symlinks for hypr configs..."
    # Create symlinks for all files in hypr config directory
    HYPR_SOURCE="$PWD/linux/hypr/.config/hypr"
    HYPR_TARGET="$HOME/.config/hypr"

    if [ -d "$HYPR_SOURCE" ]; then
        # Find all files (not directories) in the hypr config
        while IFS= read -r -d '' file; do
            # Get the relative path from the hypr config directory
            rel_path="${file#$HYPR_SOURCE/}"
            target_file="$HYPR_TARGET/$rel_path"
            target_dir="$(dirname "$target_file")"

            # Create target directory if it doesn't exist
            mkdir -p "$target_dir"

            # Create symlink
            ln -sf "$file" "$target_file"
        done < <(find "$HYPR_SOURCE" -type f -print0)

        echo "    ✓ Hypr symlinks created"
    fi
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
