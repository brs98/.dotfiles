# Task Completion Workflow

## After Making Configuration Changes

### 1. Validate Configuration
```bash
# Check flake for syntax errors and issues
nix flake check
```

### 2. Test Build (Recommended)
```bash
# macOS - test build without applying
darwin-rebuild build --flake ~/.dotfiles

# Linux - test build without applying  
sudo nixos-rebuild build --flake ~/.dotfiles
```

### 3. Apply Changes
```bash
# macOS - apply configuration
darwin-rebuild switch --flake ~/.dotfiles
# OR use the configured alias:
sdf

# Linux - apply configuration
sudo nixos-rebuild switch --flake ~/.dotfiles
```

### 4. Verify Changes
- Test that new aliases/commands work
- Check that applications launch correctly
- Verify services are running if applicable

### 5. Clean Up (Optional)
```bash
# Remove old generations and unused packages
nix-collect-garbage -d
# On NixOS, also run:
sudo nix-collect-garbage -d
```

## No Additional Testing/Linting Required
This project uses Nix's declarative approach, so there are no separate test suites or linters to run. The `nix flake check` command provides validation, and the rebuild process will fail if there are configuration errors.