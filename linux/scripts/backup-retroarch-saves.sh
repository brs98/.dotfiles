#!/bin/bash

# Auto-commit RetroArch save file changes

DOTFILES_DIR="$HOME/.dotfiles"
SAVES_SUBMODULE="shared/symlink/retroarch/.config/retroarch/saves"
CARD_A_DIR="dolphin-emu/User/GC/USA/Card A"

# Change to the submodule directory
cd "$DOTFILES_DIR/$SAVES_SUBMODULE" || exit 1

# Check if there are any changes to Card A save files (tracked changes or untracked files)
if [ -z "$(git status --porcelain "$CARD_A_DIR")" ]; then
    # No changes detected
    exit 0
fi

# Add all changes in the Card A directory
git add "$CARD_A_DIR"

# Create commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Auto-backup RetroArch saves - $TIMESTAMP"

# Push from the submodule
git push
