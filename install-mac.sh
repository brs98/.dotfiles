#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$HOME/.dotfiles"
DOTFILES_REPO="https://github.com/brs98/.dotfiles"

log() { echo -e "\\033[1;32m[INFO]\\033[0m $1"; }

sudo -v
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

if ! xcode-select -p >/dev/null 2>&1; then
  log "Installing Xcode Command Line Tools..."
  xcode-select --install || true
else
  log "Xcode Command Line Tools already installed."
fi

if ! command -v nix >/dev/null 2>&1; then
  log "Installing Nix..."
  sh <(curl -L https://nixos.org/nix/install) --daemon
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
else
  log "Nix already installed."
fi

if [ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi

if [ ! -d "$DOTFILES_DIR" ]; then
  log "Cloning dotfiles..."
  git clone "$DOTFILES_REPO" "$DOTFILES_DIR"
else
  log "Dotfiles already cloned. Pulling latest changes..."
  git -C "$DOTFILES_DIR" pull
fi

log "Applying nix-darwin configuration..."
cd "$DOTFILES_DIR"

# Use the default configuration - nix-darwin will handle hostname internally
sudo -E HOME="$HOME" nix run nix-darwin -- switch --flake ".#default"
