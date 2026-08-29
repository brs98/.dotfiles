#!/usr/bin/env bash

set -e

echo "Installing dotfiles..."

# Navigate to dotfiles directory
cd "$(dirname "$0")"

# Omarchy 4 moved `current/` from ~/.config/omarchy to ~/.local/state/omarchy.
# Resolve whichever layout this machine has so theming keeps working on both.
OMARCHY_CURRENT=""
for candidate in "$HOME/.local/state/omarchy/current" "$HOME/.config/omarchy/current"; do
    if [ -d "$candidate" ]; then
        OMARCHY_CURRENT="$candidate"
        break
    fi
done

# Stow a package, reporting conflicts instead of aborting the whole install.
# Without this, one pre-existing real file (e.g. a config Omarchy rewrote in
# place) would kill the script via `set -e` before anything else ran.
STOW_CONFLICTS=()
stow_pkg() {
    local pkg="$1"
    shift
    local err
    err="$(mktemp)"
    # Never tree-fold a package directory into $HOME. Applications write
    # runtime state beside many tracked configs; a folded directory would put
    # that state (including caches and credentials) inside the dotfiles repo.
    if stow --no-folding "$@" -t ~ "$pkg" 2>"$err"; then
        rm -f "$err"
        return 0
    fi
    echo "    ⚠ Conflict stowing '$pkg' — skipped. Details:"
    sed 's/^/        /' "$err"
    rm -f "$err"
    STOW_CONFLICTS+=("$pkg")
    return 0
}

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

# Setup RetroArch saves symlinks
setup_retroarch_saves() {
    echo "  → Setting up RetroArch saves symlinks..."

    local dotfiles_dir="$PWD"
    local source_dir="$dotfiles_dir/shared/symlink/retroarch/.config/retroarch/saves/dolphin-emu/User/GC/USA/Card A"
    local target_dir="$HOME/.config/retroarch/saves/dolphin-emu/User/GC/USA"
    local target_link="$target_dir/Card A"

    if [ ! -d "$source_dir" ]; then
        echo "    ⚠ Warning: RetroArch saves source not found at $source_dir, skipping..."
        return
    fi

    # Create parent directory if it doesn't exist
    mkdir -p "$target_dir"

    # Remove existing directory or symlink if it exists
    if [ -e "$target_link" ] || [ -L "$target_link" ]; then
        rm -rf "$target_link"
    fi

    # Create symlink
    ln -sf "$source_dir" "$target_link"
    echo "    ✓ RetroArch Card A saves symlinked"
}

# Make all scripts executable
make_scripts_executable() {
    echo "  → Making scripts executable..."

    local scripts_dirs=(
        "shared/stow/scripts/.local/bin"
        "mac/stow/scripts/.local/bin"
        "linux/stow/scripts/.local/bin"
    )

    for scripts_dir in "${scripts_dirs[@]}"; do
        if [ -d "$scripts_dir" ]; then
            find "$scripts_dir" -type f -exec chmod +x {} \;
            echo "    ✓ Made scripts in $scripts_dir executable"
        fi
    done
}

# Herdr writes runtime state beside config.toml, so Stow cannot fold the whole
# directory. Preserve an unmanaged config before linking the tracked version.
prepare_herdr_config() {
    local target="$HOME/.config/herdr/config.toml"

    if [ -e "$target" ] && [ ! -L "$target" ]; then
        local backup="$target.pre-dotfiles.$(date +%s)"
        mv "$target" "$backup"
        echo "    ✓ Backed up existing Herdr config to $backup"
    fi
}

# Install the pinned fork before Stow replaces ~/.local/bin/herdr with the
# tracked wrapper. The wrapper also redirects future `herdr update` calls to
# this installer so the official updater cannot replace the fork.
install_herdr_fork() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        return
    fi

    local installer="linux/stow/scripts/.local/bin/herdr-fork-install"
    if [ ! -x "$installer" ]; then
        echo "Herdr fork installer is missing or not executable: $installer" >&2
        return 1
    fi

    "$installer" --handoff
}

# Preserve a standalone Herdr binary before Stow links the dotfiles wrapper.
# This normally runs once when migrating from the official installer.
prepare_herdr_command() {
    local target="$HOME/.local/bin/herdr"

    if [ -f "$target" ] && [ ! -L "$target" ]; then
        local backup_dir="$HOME/.local/lib/herdr-fork/backups"
        local version
        version="$("$target" --version 2>/dev/null | tr ' /' '--' || echo unknown)"
        mkdir -p "$backup_dir"
        mv "$target" "$backup_dir/herdr-$version-$(date +%s)"
        echo "    ✓ Preserved previous Herdr binary in $backup_dir"
    fi
}

# Make scripts executable before stowing
make_scripts_executable
prepare_herdr_config
install_herdr_fork
prepare_herdr_command

# Starship's palette is rewritten by ricekit/omarchy theme hooks, so the repo
# gitignores its contents (see .gitignore). On a fresh clone the package dir
# therefore doesn't exist and the stow symlink would dangle — seed it.
seed_starship_config() {
    local pkg_dir="shared/stow/starship/.config"
    local pkg_file="$pkg_dir/starship.toml"

    [ -f "$pkg_file" ] && return

    local seed=""
    for candidate in \
        "$HOME/.local/share/omarchy/config/starship.toml" \
        "$HOME/.config/starship.toml"; do
        if [ -f "$candidate" ]; then
            seed="$candidate"
            break
        fi
    done

    if [ -z "$seed" ]; then
        echo "    ⚠ No starship config to seed from; skipping starship package"
        return
    fi

    mkdir -p "$pkg_dir"
    cp "$seed" "$pkg_file"
    echo "    ✓ Seeded starship config from $seed"
}

# Stow all shared configs
echo "  → Stowing shared configs..."
seed_starship_config
if [ -d "shared/stow" ]; then
    for pkg_path in shared/stow/*/; do
        pkg="$(basename "$pkg_path")"
        if [ "$pkg" = "pi" ]; then
            # Keep Pi's validation monorepo metadata in the repo only. Stow's
            # default tree-folding would symlink ~/.pi to the package directory
            # and expose files ignored by shared/stow/pi/.stow-local-ignore.
            stow_pkg "$pkg" -d shared/stow --no-folding
        elif [ "$pkg" = "cliamp" ]; then
            # Only config.toml belongs in the repo. On a fresh machine
            # ~/.config/cliamp does not exist, so tree-folding would symlink the
            # whole directory into the package and cliamp would write its runtime
            # state — including spotify_credentials.json — inside the repo.
            stow_pkg "$pkg" -d shared/stow --no-folding
        elif [ "$pkg" = "scripts" ]; then
            # Linux adds platform-specific commands to the same target directory.
            # Per-file links let both Stow packages coexist on a fresh machine.
            stow_pkg "$pkg" -d shared/stow --no-folding
        else
            stow_pkg "$pkg" -d shared/stow
        fi
    done
fi

# Wire ~/.claude/skills to the skills.sh-managed ~/.agents/skills universal location,
# so Claude Code shares one canonical skills directory with other agents.
setup_skills_link() {
    echo "  → Linking ~/.claude/skills -> ~/.agents/skills..."
    mkdir -p ~/.agents/skills ~/.claude

    if [ -e ~/.claude/skills ] && [ ! -L ~/.claude/skills ]; then
        local backup="$HOME/.claude/skills.bak.$(date +%s)"
        echo "    ⚠ ~/.claude/skills is a real directory; backing up to $backup"
        mv ~/.claude/skills "$backup"
    fi

    ln -sfn ~/.agents/skills ~/.claude/skills
    echo "    ✓ Linked ~/.claude/skills -> ~/.agents/skills"
}

# Install this repo's skills into ~/.agents/skills via the skills.sh CLI,
# so they live in the same managed pool as anything from `npx skills add`.

# Resolve a runner for the `skills` CLI. npx is not a given: Arch ships the
# nodejs package without npm, so a machine can have node and still have no npx.
# bunx runs the same package, and bun is already this setup's default JS
# toolchain, so prefer npx and fall back to it.
skills_runner() {
    if command -v npx >/dev/null 2>&1; then
        echo "npx"
    elif command -v bunx >/dev/null 2>&1; then
        echo "bunx"
    fi
}

install_dotfile_skills() {
    local runner
    runner="$(skills_runner)"

    if [ -z "$runner" ]; then
        echo "    ⚠ Neither npx nor bunx found; skipping. Run manually once one is installed:"
        echo "        npx skills add $PWD --skill '*' -g -y"
        return
    fi

    echo "  → Installing dotfile skills via $runner skills..."
    "$runner" -y skills add "$PWD" --skill '*' -g -y || \
        echo "    ⚠ $runner skills add failed; resolve collisions manually with: $runner skills add $PWD --skill '*' -g"
}

install_hearthstone_matchup() {
    local app_dir="$PWD/linux/hearthstone-matchup"
    local plugin_source="$PWD/linux/omarchy/plugins/brs98.hearthstone-matchup"
    local plugin_target="$HOME/.config/omarchy/plugins/brs98.hearthstone-matchup"

    if [ ! -d "$app_dir" ] || [ ! -d "$plugin_source" ]; then
        return
    fi

    echo "  → Installing Hearthstone Battlegrounds matchup overlay..."
    if ! command -v npm >/dev/null 2>&1; then
        echo "    ⚠ npm is unavailable; the matchup service was not built"
        return
    fi

    if [ -f "$app_dir/package-lock.json" ]; then
        (cd "$app_dir" && npm ci --silent && npm run build)
    else
        (cd "$app_dir" && npm install --silent && npm run build)
    fi

    if command -v omarchy >/dev/null 2>&1; then
        omarchy plugin validate "$plugin_source"
    fi

    mkdir -p "$(dirname "$plugin_target")"
    if [ -L "$plugin_target" ]; then
        if [ "$(readlink -f "$plugin_target")" != "$(readlink -f "$plugin_source")" ]; then
            echo "    ⚠ $plugin_target points elsewhere; leaving it unchanged"
            return
        fi
    elif [ -e "$plugin_target" ]; then
        echo "    ⚠ $plugin_target is a real file or directory; leaving it unchanged"
        return
    else
        ln -s "$plugin_source" "$plugin_target"
    fi

    if [ -f "$HOME/.config/systemd/user/hearthstone-matchup.service" ]; then
        systemctl --user daemon-reload
        systemctl --user enable hearthstone-matchup.service
        systemctl --user restart hearthstone-matchup.service
    else
        echo "    ⚠ Hearthstone matchup systemd unit was not stowed"
        return
    fi

    if command -v omarchy-shell >/dev/null 2>&1; then
        omarchy-shell -q shell rescanPlugins >/dev/null 2>&1 || true
    fi
    if command -v omarchy >/dev/null 2>&1; then
        omarchy plugin enable brs98.hearthstone-matchup >/dev/null 2>&1 || \
            echo "    ⚠ Omarchy shell is unavailable; enable brs98.hearthstone-matchup after login"
        omarchy restart shell >/dev/null 2>&1 || \
            echo "    ⚠ Omarchy shell will load the overlay at the next login"
    fi
    echo "    ✓ Hearthstone matchup overlay enabled"
}

# Install the pre-commit hook (claims the unused pre-commit slot; peb keeps
# post-commit/post-merge) and reconcile the pool so every cloned/authored skill
# is tracked in the repo and linked into ~/.agents/skills.
setup_skill_sync() {
    echo "  → Wiring skills-sync (drift guard)..."

    local hook=".git/hooks/pre-commit"
    if [ -d ".git" ]; then
        if [ -e "$hook" ] && [ ! -L "$hook" ]; then
            mv "$hook" "$hook.bak.$(date +%s)"
            echo "    ⚠ Backed up existing pre-commit hook"
        fi
        ln -sfn "$PWD/shared/git-hooks/pre-commit" "$hook"
        echo "    ✓ Installed pre-commit hook"
    fi

    # Fresh machine: seed the live lockfile from the tracked copy before reconcile.
    if [ -f "skills/.skill-lock.json" ] && [ ! -f "$HOME/.agents/.skill-lock.json" ]; then
        mkdir -p "$HOME/.agents"
        cp "skills/.skill-lock.json" "$HOME/.agents/.skill-lock.json"
    fi

    if [ -x "shared/stow/scripts/.local/bin/skills-sync" ]; then
        DOTFILES="$PWD" shared/stow/scripts/.local/bin/skills-sync sync || \
            echo "    ⚠ skills-sync reconcile reported issues"
    fi
}

setup_skills_link
install_dotfile_skills
setup_skill_sync

# Stow platform-specific configs
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  → Detected macOS, stowing mac configs..."
    if [ -d "mac/stow" ]; then
        for pkg_path in mac/stow/*/; do
            stow_pkg "$(basename "$pkg_path")" -d mac/stow
        done
    fi
else
    echo "  → Detected Linux, stowing linux configs..."
    if [ -d "linux/stow" ]; then
        for pkg_path in linux/stow/*/; do
            pkg="$(basename "$pkg_path")"
            if [ "$pkg" = "easyeffects" ]; then
                # Only the tracked preset belongs in the repo. Tree-folding would
                # symlink ~/.local/share/easyeffects into the package, so presets
                # saved from the GUI would be written back into the repo.
                stow_pkg "$pkg" -d linux/stow --no-folding
            elif [ "$pkg" = "scripts" ]; then
                # Merge Linux-only commands with the shared scripts package.
                stow_pkg "$pkg" -d linux/stow --no-folding
            else
                stow_pkg "$pkg" -d linux/stow
            fi
        done
    fi

    # Link nvim theme — Linux only (macOS uses ricekit's colors/ricekit.lua symlink instead)
    # Prefer devx-custom override, fall back to omarchy default
    CURRENT_THEME=$(cat "$OMARCHY_CURRENT/theme.name" 2>/dev/null)
    DEVX_OVERRIDE="$HOME/.config/devx-custom/themes/$CURRENT_THEME/neovim.lua"
    if [ -n "$CURRENT_THEME" ] && [ -f "$DEVX_OVERRIDE" ]; then
        ln -sf "$DEVX_OVERRIDE" "$HOME/.config/nvim/lua/plugins/theme.lua"
        echo "    ✓ Linked nvim theme to devx-custom override ($CURRENT_THEME)"
    elif [ -n "$OMARCHY_CURRENT" ] && [ -f "$OMARCHY_CURRENT/theme/neovim.lua" ]; then
        ln -sf "$OMARCHY_CURRENT/theme/neovim.lua" "$HOME/.config/nvim/lua/plugins/theme.lua"
        echo "    ✓ Linked nvim theme to omarchy default ($CURRENT_THEME)"
    else
        echo "    ⚠ Warning: omarchy nvim theme not found, skipping..."
    fi

    # Enable systemd user units
    echo "  → Enabling systemd user units..."
    if [ -f "$HOME/.config/systemd/user/retroarch-saves.path" ]; then
        systemctl --user daemon-reload
        systemctl --user enable retroarch-saves.path
        systemctl --user start retroarch-saves.path
        echo "    ✓ RetroArch saves auto-backup enabled"
    else
        echo "    ⚠ Warning: retroarch-saves.path not found, skipping..."
    fi

fi

# Create symlinks for shared configs
echo "  → Creating symlinks for shared configs..."
if [ -d "shared/symlink" ]; then
    for package in shared/symlink/*/; do
        if [ -d "$package" ]; then
            package_name="$(basename "$package")"
            # Skip retroarch - it has special setup requirements
            if [ "$package_name" = "retroarch" ]; then
                setup_retroarch_saves
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

    # Omarchy's shell.json is copy-deployed, not symlinked: the shell rewrites
    # it atomically at runtime, which would replace a symlink with a real file.
    # Seed it only when absent so we never clobber a live config.
    if [ -x "linux/scripts/omarchy-shell-config-sync" ]; then
        echo "  → Seeding Omarchy shell.json (if missing)..."
        DOTFILES="$PWD" linux/scripts/omarchy-shell-config-sync seed
    fi

    if [ -f "$HOME/.config/systemd/user/omarchy-openrgb-theme.service" ]; then
        if command -v openrgb >/dev/null 2>&1; then
            systemctl --user daemon-reload
            systemctl --user enable --now omarchy-openrgb-theme.service
            echo "    ✓ Omarchy OpenRGB theme sync enabled"
        else
            echo "    ⚠ OpenRGB is not installed; run: omarchy pkg add openrgb"
        fi
    else
        echo "    ⚠ Warning: Omarchy OpenRGB theme service not found, skipping..."
    fi

    install_hearthstone_matchup
fi

echo "✓ Dotfiles installed successfully!"
echo ""

if [ ${#STOW_CONFLICTS[@]} -gt 0 ]; then
    echo "⚠ These packages were skipped due to conflicts with existing real files:"
    for pkg in "${STOW_CONFLICTS[@]}"; do
        echo "    - $pkg"
    done
    echo ""
    echo "  To keep the live file and track it in the repo:"
    echo "      cd $PWD && stow --adopt -t ~ <package> && git diff"
    echo "  To discard the live file and use the repo version:"
    echo "      rm <conflicting file> && cd $PWD && ./install.sh"
    echo ""
fi

# The aliases in .zshrc only load if zsh is your login shell.
if [ "$(basename "${SHELL:-}")" != "zsh" ] && command -v zsh >/dev/null 2>&1; then
    echo "⚠ Your login shell is '${SHELL:-unknown}', not zsh — .zshrc (and its"
    echo "  aliases) will not load. To fix:  chsh -s \"$(command -v zsh)\""
    echo ""
fi

echo "Note: Make sure you have the following tools installed:"
echo "  - starship (prompt)"
echo "  - zoxide (smart cd)"
echo "  - eza (better ls)"
echo "  - bat (better cat)"
echo "  - lazygit"
echo "  - nvim"
echo "  - diffnav (git diff pager)"
echo "  - tv (television fuzzy finder)"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  - pbcopy (should be pre-installed)"
    echo "  - aerospace (window manager)"
    echo "  - sketchybar (status bar)"
else
    echo "  - wl-copy or xclip (clipboard)"
    echo "  - hyprland or your preferred window manager"
fi
