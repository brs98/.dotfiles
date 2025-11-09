#!/usr/bin/env bash

set -e

echo "Installing dotfiles..."

# Navigate to dotfiles directory
cd "$(dirname "$0")"

# Function to create symlinks for a package
create_symlinks() {
    local package_name="$1"
    local source_dir="$2"

    # Remove trailing slash if present
    source_dir="${source_dir%/}"

    if [ ! -d "$source_dir" ]; then
        echo "    ⚠ Warning: $source_dir does not exist, skipping..."
        return
    fi

    # Find all files (not directories) in the source directory
    while IFS= read -r -d '' file; do
        # Get the relative path from the package root
        rel_path="${file#$source_dir/}"
        target_file="$HOME/$rel_path"
        target_dir="$(dirname "$target_file")"

        # Create target directory if it doesn't exist
        mkdir -p "$target_dir"

        # Create symlink
        ln -sf "$file" "$target_file"
    done < <(find "$source_dir" -type f -print0)

    echo "    ✓ $package_name symlinks created"
}

# Stow all shared configs
echo "  → Stowing shared configs..."
if [ -d "shared/stow" ]; then
    (cd shared/stow && stow -t ~ *)
fi

# Stow platform-specific configs
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  → Detected macOS, stowing mac configs..."
    (cd mac && stow -t ~ *)
else
    echo "  → Detected Linux, stowing linux configs..."
    if [ -d "linux/stow" ]; then
        (cd linux/stow && stow -t ~ *)
    fi
fi

# Create symlinks for shared configs
echo "  → Creating symlinks for shared configs..."
if [ -d "shared/symlink" ]; then
    for package in shared/symlink/*/; do
        if [ -d "$package" ]; then
            package_name="$(basename "$package")"
            # Skip zen for now - needs special treatment
            if [ "$package_name" = "zen" ]; then
                echo "  → Skipping $package_name (needs manual setup)..."
                continue
            fi
            echo "  → Creating symlinks for $package_name..."
            create_symlinks "$package_name" "$PWD/$package"
        fi
    done
fi

# Create symlinks for platform-specific configs
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  → Creating symlinks for macOS configs..."
    if [ -d "mac/symlink" ]; then
        for package in mac/symlink/*/; do
            if [ -d "$package" ]; then
                package_name="$(basename "$package")"
                echo "  → Creating symlinks for $package_name..."
                create_symlinks "$package_name" "$PWD/$package"
            fi
        done
    fi
else
    echo "  → Creating symlinks for Linux configs..."
    if [ -d "linux/symlink" ]; then
        for package in linux/symlink/*/; do
            if [ -d "$package" ]; then
                package_name="$(basename "$package")"
                echo "  → Creating symlinks for $package_name..."
                create_symlinks "$package_name" "$PWD/$package"
            fi
        done
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
