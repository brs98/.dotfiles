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

# Setup Zen browser theming
setup_zen_browser() {
    echo "  → Setting up Zen browser theming..."

    # Find the Zen profile directory
    local zen_profile=""
    if [ -d "$HOME/.zen" ]; then
        zen_profile=$(find "$HOME/.zen" -maxdepth 1 -name "*.Default*" -type d | head -1)
    fi

    if [ -z "$zen_profile" ]; then
        echo "    ⚠ Warning: Zen browser profile not found, skipping..."
        echo "      Run Zen browser once to create a profile, then re-run this script"
        return
    fi

    echo "    Found Zen profile: $zen_profile"

    # Create chrome directory if it doesn't exist
    mkdir -p "$zen_profile/chrome"

    # Define source files
    local dotfiles_dir="$PWD"
    local base_css="$dotfiles_dir/shared/symlink/zen/profile/chrome/base.css"
    local omarchy_theme="$HOME/.config/omarchy/current/theme/zen-browser.css"
    local user_js="$dotfiles_dir/shared/symlink/zen/profile/user.js"

    # Create symlinks
    if [ -f "$base_css" ]; then
        ln -sf "$base_css" "$zen_profile/chrome/base.css"
        echo "    ✓ Symlinked base.css"
    else
        echo "    ⚠ Warning: base.css not found at $base_css"
    fi

    if [ -f "$omarchy_theme" ]; then
        ln -sf "$omarchy_theme" "$zen_profile/chrome/userChrome.css"
        echo "    ✓ Symlinked userChrome.css → omarchy theme"
    else
        echo "    ⚠ Warning: omarchy theme not found at $omarchy_theme"
    fi

    if [ -f "$user_js" ]; then
        ln -sf "$user_js" "$zen_profile/user.js"
        echo "    ✓ Symlinked user.js"
    else
        echo "    ⚠ Warning: user.js not found at $user_js"
    fi

    echo "    ✓ Zen browser theming setup complete"
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
            # Skip zen - it has special setup requirements
            if [ "$package_name" = "zen" ]; then
                setup_zen_browser
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
