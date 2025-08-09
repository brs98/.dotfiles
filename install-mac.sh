#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
DOTFILES_DIR="$HOME/.dotfiles"
DOTFILES_REPO="https://github.com/brs98/.dotfiles"
HOSTNAME="$(hostname)"

# --- Helper function ---
function log() {
  echo -e "\033[1;32m[INFO]\033[0m $1"
}

# --- Step 0: Install Xcode Command Line Tools ---
if ! xcode-select -p >/dev/null 2>&1; then
  log "Installing Xcode Command Line Tools..."
  xcode-select --install || true
else
  log "Xcode Command Line Tools already installed."
fi

# --- Step 1: Install Nix ---
if ! command -v nix >/dev/null 2>&1; then
  log "Installing Nix..."
  sh <(curl -L https://nixos.org/nix/install) --daemon
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
else
  log "Nix already installed."
fi

# Ensure nix-daemon.sh is sourced in current shell
if [ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi

# --- Step 2: Install nix-darwin ---
if ! command -v darwin-rebuild >/dev/null 2>&1; then
  log "Installing nix-darwin..."
  nix build nix-darwin
  ./result/sw/bin/darwin-installer
else
  log "nix-darwin already installed."
fi

# --- Step 3: Clone dotfiles ---
if [ ! -d "$DOTFILES_DIR" ]; then
  log "Cloning dotfiles..."
  git clone "$DOTFILES_REPO" "$DOTFILES_DIR"
else
  log "Dotfiles already cloned. Pulling latest changes..."
  git -C "$DOTFILES_DIR" pull
fi

# --- Step 4: Apply nix-darwin + home-manager config ---
log "Applying configuration..."
sudo -E darwin-rebuild switch --flake "$DOTFILES_DIR#$HOSTNAME"

log "✅ Installation complete!"
