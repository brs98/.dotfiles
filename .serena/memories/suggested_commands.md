# Essential Commands for Dotfiles Management

## System Rebuild Commands
### macOS (nix-darwin)
```bash
# Apply dotfiles configuration (from ~/.dotfiles directory)
darwin-rebuild switch --flake ~/.dotfiles

# Alternative using the configured alias
sdf

# Check what changes would be applied
darwin-rebuild build --flake ~/.dotfiles
```

### Linux (NixOS)
```bash
# Apply system configuration
sudo nixos-rebuild switch --flake ~/.dotfiles

# Check what changes would be applied
sudo nixos-rebuild build --flake ~/.dotfiles
```

## General Nix Commands
```bash
# Update flake inputs
nix flake update

# Check flake for issues
nix flake check

# Clean up old generations and garbage collect
nix-collect-garbage -d
sudo nix-collect-garbage -d  # On NixOS for system-level cleanup
```

## Development Workflow
1. Edit configuration files in appropriate directories
2. Test changes with build command first
3. Apply changes with switch command
4. Some applications may require restart

## Useful Shell Aliases (Already Configured)
- `v` = `nvim`
- `vim` = `nvim` 
- `lg` = `lazygit`
- `cat` = `bat --theme=base16`
- `ls` = `eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions`
- `cd` = `z` (zoxide)
- `cdd` = `cd ~/.dotfiles/`
- `sdf` = system rebuild command