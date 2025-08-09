#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$HOME/.dotfiles"
DOTFILES_REPO="https://github.com/brs98/.dotfiles"

log() { echo -e "\033[1;32m[INFO]\033[0m $1"; }

# Ask for sudo up front
sudo -v

# Keep sudo alive during script
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

# Xcode tools
if ! xcode-select -p >/dev/null 2>&1; then
  log "Installing Xcode Command Line Tools..."
  xcode-select --install || true
else
  log "Xcode Command Line Tools already installed."
fi

# Nix
if ! command -v nix >/dev/null 2>&1; then
  log "Installing Nix..."
  sh <(curl -L https://nixos.org/nix/install) --daemon
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
else
  log "Nix already installed."
fi

# Ensure nix env in current shell
if [ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi

# Dotfiles
if [ ! -d "$DOTFILES_DIR" ]; then
  log "Cloning dotfiles..."
  git clone "$DOTFILES_REPO" "$DOTFILES_DIR"
else
  log "Dotfiles already cloned. Pulling latest changes..."
  git -C "$DOTFILES_DIR" pull
fi

# Apply config (always nix run, no path issues)
log "Applying nix-darwin configuration..."
sudo -E nix run nix-darwin -- switch --flake "$DOTFILES_DIR"

