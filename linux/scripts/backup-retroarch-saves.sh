#!/bin/bash

# Auto-commit RetroArch save file changes

DOTFILES_DIR="$HOME/.dotfiles"
SAVES_DIR="shared/symlink/retroarch/.config/retroarch/saves/dolphin-emu/User/GC/USA/Card A"

cd "$DOTFILES_DIR" || exit 1

# Check if there are any changes to save files
if git diff --quiet "$SAVES_DIR" && git diff --cached --quiet "$SAVES_DIR"; then
    # No changes detected
    exit 0
fi

# Add all changes in the saves directory
git add "$SAVES_DIR"

# Create commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Auto-backup RetroArch saves - $TIMESTAMP"

# Optional: Push to remote (uncomment if desired)
# git push
