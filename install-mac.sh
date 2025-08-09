#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$HOME/.dotfiles"
DOTFILES_REPO="https://github.com/brs98/.dotfiles"

log() { echo -e "\\033[1;32m[INFO]\\033[0m $1"; }
warn() { echo -e "\\033[1;33m[WARN]\\033[0m $1"; }
prompt() { echo -e "\\033[1;34m[INPUT]\\033[0m $1"; }

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

# Configure Git user information
if [ -z "${GIT_USER_NAME:-}" ] || [ -z "${GIT_USER_EMAIL:-}" ]; then
  log "Setting up Git configuration..."
  
  if [ -z "${GIT_USER_NAME:-}" ]; then
    prompt "Enter your Git username:"
    read -r GIT_USER_NAME
    export GIT_USER_NAME
  fi
  
  if [ -z "${GIT_USER_EMAIL:-}" ]; then
    prompt "Enter your Git email:"
    read -r GIT_USER_EMAIL  
    export GIT_USER_EMAIL
  fi
  
  # Save to shell profile for persistence
  SHELL_PROFILE=""
  if [ -n "$ZSH_VERSION" ]; then
    SHELL_PROFILE="$HOME/.zshrc"
  elif [ -n "$BASH_VERSION" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
  else
    SHELL_PROFILE="$HOME/.profile"
  fi
  
  log "Adding Git configuration to $SHELL_PROFILE..."
  {
    echo ""
    echo "# Git configuration for dotfiles"
    echo "export GIT_USER_NAME=\"$GIT_USER_NAME\""
    echo "export GIT_USER_EMAIL=\"$GIT_USER_EMAIL\""
  } >> "$SHELL_PROFILE"
  
  log "Git configuration saved. These environment variables will be available in new shell sessions."
fi

log "Applying nix-darwin configuration..."
cd "$DOTFILES_DIR"

# Use the default configuration - nix-darwin will handle hostname internally
sudo -E HOME="$HOME" darwin-rebuild switch --flake ".#default" --impure
