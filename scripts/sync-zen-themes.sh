#!/bin/bash

# Zen Browser Theme Sync Script
# Symlinks theme files and sets up the current theme for Zen browser

set -e

# Find Zen browser profile directory
ZEN_DIR="$HOME/.zen"
PROFILE_DIR=""

if [[ -d "$ZEN_DIR" ]]; then
    # Find the profile directory (looks for *.Default (release) pattern)
    PROFILE_DIR=$(find "$ZEN_DIR" -maxdepth 1 -type d -name "*.Default*" | head -1)
fi

if [[ -z "$PROFILE_DIR" ]]; then
    echo "Error: Zen browser profile directory not found in $ZEN_DIR"
    echo "Make sure Zen browser is installed and has been run at least once."
    exit 1
fi

CHROME_DIR="$PROFILE_DIR/chrome"
THEMES_DIR="$HOME/.dotfiles/zen/themes"
OMARCHY_THEMES_DIR="$HOME/.config/omarchy/themes"

echo "Found Zen profile: $PROFILE_DIR"
echo "Chrome directory: $CHROME_DIR"

# Create chrome directory if it doesn't exist
mkdir -p "$CHROME_DIR"

# 1. Symlink base.css
echo "Symlinking base.css..."
ln -sf "$THEMES_DIR/base.css" "$CHROME_DIR/base.css"

# 2. Iterate through theme files and symlink to omarchy theme directories
echo "Symlinking theme files to omarchy..."
for theme_file in "$THEMES_DIR"/*.css; do
    # Skip base.css as it's handled separately
    if [[ "$(basename "$theme_file")" == "base.css" ]]; then
        continue
    fi
    
    theme_name=$(basename "$theme_file" .css)
    omarchy_theme_dir="$OMARCHY_THEMES_DIR/$theme_name"
    
    echo "Processing theme: $theme_name"
    mkdir -p "$omarchy_theme_dir"
    ln -sf "$theme_file" "$omarchy_theme_dir/zen-browser.css"
done

# 3. Symlink current theme to userChrome.css
CURRENT_THEME_FILE="$HOME/.config/omarchy/current/theme/zen-browser.css"

if [[ -f "$CURRENT_THEME_FILE" ]]; then
    echo "Symlinking current theme to userChrome.css..."
    ln -sf "$CURRENT_THEME_FILE" "$CHROME_DIR/userChrome.css"
    echo "Current theme synced successfully!"
else
    echo "Warning: Current theme file not found at $CURRENT_THEME_FILE"
    echo "Make sure you have selected a theme in omarchy first."
fi

echo "Zen browser theme sync completed!"
echo "Restart Zen browser to see the changes."