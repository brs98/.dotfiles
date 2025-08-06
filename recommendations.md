# Dotfiles Configuration Recommendations

This document outlines recommendations for improving the Nix/nix-darwin dotfiles configuration to maximize sharing between platforms and follow best practices.

## Current Issues Analysis

### 1. Major Configuration Duplication
The `home-manager/systems/mac.nix` file contains extensive duplication of configurations already defined in modules:

- **Git configurations** are duplicated from `git.nix` module:
  - `git = { ... }` (full configuration)
  - `gh = { enable = true; }`
  - `lazygit = { enable = true; }`
  - `git.delta = { enable = true; }`

- **Terminal program configurations** are duplicated from `terminal.nix` module:
  - `starship`, `zsh`, `fzf`, `fd`, `bat`, `zoxide`, `eza`, `yazi`

**Impact**: Changes must be made in multiple places, increasing maintenance burden and risk of configuration drift.

### 2. Platform-Specific Hardcoding
Current platform-specific configurations are hardcoded instead of being dynamically determined:

- Home directory paths: `/Users/brandon` (macOS) vs `/home/brandon` (Linux)
- Git credential helper: `osxkeychain` (macOS-specific)
- Shell aliases: `sdf` command is macOS-specific
- File operations: `open` vs `xdg-open`

### 3. Inconsistent Package Management
Similar packages are handled differently across platforms:

- **Fonts**: `nerd-fonts.hack` (macOS) vs `(nerdfonts.override { fonts = [ "Hack" ]; })` (Linux)
- **Common packages** scattered across system files instead of shared modules
- **Platform-specific packages** mixed with common packages

## Recommended Improvements

### 1. Remove Configuration Duplication

**Priority: HIGH**

Remove all duplicated program configurations from `home-manager/systems/mac.nix`:

```nix
# DELETE these sections from mac.nix (already in modules):
programs = {
  git = { /* ... */ };           # Remove - in git.nix
  gh = { enable = true; };       # Remove - in git.nix  
  lazygit = { enable = true; };  # Remove - in git.nix
  starship = { /* ... */ };      # Remove - in terminal.nix
  zsh = { /* ... */ };           # Remove - in terminal.nix
  fzf = { /* ... */ };           # Remove - in terminal.nix
  fd = { enable = true; };       # Remove - in terminal.nix
  bat = { enable = true; };      # Remove - in terminal.nix
  zoxide = { /* ... */ };        # Remove - in terminal.nix
  eza = { /* ... */ };           # Remove - in terminal.nix
  yazi = { /* ... */ };          # Remove - in terminal.nix
  git.delta = { enable = true; };# Remove - in git.nix
};
```

### 2. Create Shared Base Modules

**Priority: HIGH**

#### A. Base Packages Module
Create `home-manager/modules/packages.nix`:

```nix
{ pkgs, ... }: {
  home.packages = with pkgs; [
    # Development tools
    go
    gnused
    htop
    wget
    typescript
    lazydocker
    gnumake
    rustup
    tree
    trunk
    
    # Node.js ecosystem  
    nodejs_22
    nodePackages.typescript-language-server
    nodePackages.ts-node
    nodePackages.dotenv-cli
    nodePackages.vercel
  ];

  programs = {
    home-manager.enable = true;
    gpg.enable = true;
    ripgrep.enable = true;
    jq.enable = true;
  };
}
```

#### B. Platform-Specific Package Modules
Create `home-manager/modules/packages-darwin.nix`:

```nix
{ pkgs, ... }: {
  home.packages = with pkgs; [
    # macOS-specific packages
    gnupg
    libyaml
    procps
    protobuf
    grpcurl
    grpcui
  ];
  
  home.sessionPath = [
    "/opt/homebrew/bin"
    "/opt/homebrew/opt/libpq/bin"
    "/Users/brandon/personal/new-worktree"
  ];
}
```

Create `home-manager/modules/packages-linux.nix`:

```nix
{ pkgs, ... }: {
  home.packages = with pkgs; [
    # Linux-specific packages
    gcc
    corepack
  ];
}
```

### 3. Platform-Aware Configuration

**Priority: MEDIUM**

#### Update Git Module for Platform Differences
Modify `home-manager/modules/git.nix`:

```nix
{ pkgs, ... }: {
  programs.git = {
    enable = true;
    userName = "brs98";
    userEmail = "southwick.brandon21@gmail.com";
    aliases = {
      co = "checkout";
      br = "branch";
      st = "status";
      f = "fetch";
      a = "add";
      c = "commit";
      cm = "commit -m";
      p = "push";
    };
    extraConfig = {
      credential = {
        helper = if pkgs.stdenv.isDarwin then "osxkeychain" else "store";
      };
      core = {
        editor = "nvim";
        ignorecase = false;
      };
      pull = {
        rebase = true;
      };
      push = {
        autoSetupRemote = true;
      };
      init = {
        defaultBranch = "main";
      };
      rebase = {
        updateRefs = true;
      };
      delta = {
        navigate = true;
        side-by-side = true;
      };
    };
  };

  programs = {
    gh.enable = true;
    lazygit.enable = true;
    git.delta.enable = true;
  };
}
```

#### Create Platform-Aware Shell Aliases
Update `home-manager/modules/terminal.nix`:

```nix
{ pkgs, ... }: let
  systemRebuildCmd = if pkgs.stdenv.isDarwin 
    then "darwin-rebuild switch --flake ~/.dotfiles#Brandons-Macbook-Pro"
    else "sudo nixos-rebuild switch --flake ~/.dotfiles";
  
  openCmd = if pkgs.stdenv.isDarwin then "open" else "xdg-open";
in {
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    shellAliases = {
      v = "nvim";
      vim = "nvim";
      lg = "lazygit";
      ldk = "lazydocker";
      cat = "bat --theme=base16";
      ls = "eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions";
      cd = "z";
      cdd = "cd ~/.dotfiles/";
      sdf = systemRebuildCmd;
      open = openCmd;
    };
  };
  
  # ... rest of terminal configuration
}
```

### 4. Abstract Home Directory Paths

**Priority: MEDIUM**

Update both `home-manager/systems/mac.nix` and `home-manager/systems/linux.nix`:

```nix
{ pkgs, ... }: {
  home.username = "brandon";
  home.homeDirectory = if pkgs.stdenv.isDarwin then "/Users/brandon" else "/home/brandon";
  home.stateVersion = "23.11";
  
  # Only platform-specific configurations should remain here
}
```

### 5. Consolidate Font Configuration

**Priority: LOW**

Create `home-manager/modules/fonts.nix`:

```nix
{ pkgs, ... }: {
  home.packages = with pkgs; [
    (if pkgs.stdenv.isDarwin 
     then nerd-fonts.hack 
     else (nerdfonts.override { fonts = [ "Hack" ]; }))
  ];
}
```

### 6. Update System Configuration Imports

**Priority: MEDIUM**

#### Update mac.nix imports:
```nix
{ inputs, pkgs, ... }: {
  imports = [
    ../modules/git.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
    ../modules/packages.nix
    ../modules/packages-darwin.nix
    ../modules/fonts.nix
  ];

  home.username = "brandon";
  home.homeDirectory = "/Users/brandon";
  home.stateVersion = "23.11";

  # Only macOS-specific configurations that can't be abstracted
  home.file.".config/aerospace/aerospace.toml" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-manager/configs/aerospace/aerospace.toml";
  };
}
```

#### Update linux.nix imports:
```nix
{ pkgs, ... }: {
  imports = [
    ../modules/git.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
    ../modules/packages.nix
    ../modules/packages-linux.nix
    ../modules/fonts.nix
  ];

  home.username = "brandon";
  home.homeDirectory = "/home/brandon";
  home.stateVersion = "23.11";

  # Only Linux-specific configurations
}
```

## Implementation Steps

### Phase 1: Remove Duplication (Immediate)
1. **Backup current configuration**
2. **Remove duplicate program configurations** from `mac.nix`
3. **Test configuration** with `darwin-rebuild switch`
4. **Verify all programs still work** as expected

### Phase 2: Create Shared Modules (Week 1)
1. **Create `packages.nix`** with common packages
2. **Create platform-specific package modules**
3. **Update system file imports**
4. **Test on both platforms**

### Phase 3: Platform-Aware Configurations (Week 2)
1. **Update git module** for platform-specific credential helper
2. **Update terminal module** for platform-specific aliases
3. **Abstract home directory paths**
4. **Test cross-platform functionality**

### Phase 4: Polish and Optimize (Week 3)
1. **Consolidate fonts**
2. **Review and optimize module structure**
3. **Update documentation** (CLAUDE.md)
4. **Final testing on clean system**

## Expected Benefits

### Maintenance
- **Single source of truth**: Changes only need to be made once
- **Reduced errors**: No risk of configurations drifting between platforms
- **Easier debugging**: Clear separation of shared vs platform-specific configs

### Portability  
- **Faster setup**: New machines inherit all shared configuration automatically
- **Cross-platform consistency**: Same experience across macOS and Linux
- **Easy expansion**: Adding new platforms requires minimal changes

### Organization
- **Clear module structure**: Easy to understand what each module provides
- **Logical grouping**: Related configurations stay together
- **Better reusability**: Modules can be used independently

## Validation Tests

After implementation, verify:

1. **macOS**: `darwin-rebuild switch --flake ~/.dotfiles` works without errors
2. **Linux**: `sudo nixos-rebuild switch --flake ~/.dotfiles` works without errors  
3. **All programs function**: Git, terminal tools, Neovim, etc. work as expected
4. **Platform-specific features**: Homebrew paths (macOS), xdg-open (Linux) work
5. **Configuration consistency**: Same aliases and behaviors across platforms

## Future Considerations

- **Secret management**: Consider using `sops-nix` for managing secrets
- **System-specific hardware**: Abstract hardware-specific configurations  
- **Development environments**: Create project-specific development shells
- **Backup strategies**: Implement configuration backup and restore procedures

---

*This recommendations file should be updated as improvements are implemented and new best practices are discovered.*