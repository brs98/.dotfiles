{
  description = "Dotfiles for both NixOS and Nix-Darwin";

  inputs = {
    rose-pine-hyprcursor.url = "github:ndom91/rose-pine-hyprcursor";
    wezterm.url = "github:wez/wezterm?dir=nix";
    catppuccin.url = "github:catppuccin/nix";
    nixos-hardware.url = "github:NixOS/nixos-hardware/master";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    hyprland.url = "github:hyprwm/Hyprland";
    hyprland-plugins = {
      url = "github:hyprwm/hyprland-plugins";
      inputs.hyprland.follows = "hyprland";
    };
    ghostty = {
      url = "github:ghostty-org/ghostty";
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    darwin.url = "github:lnl7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = {
    self,
    catppuccin,
    ghostty,
    home-manager,
    darwin,
    nixos-hardware,
    nixpkgs,
    ...
  } @ inputs:
  let
    systemDarwin = "aarch64-darwin";
    systemLinux = "x86_64-linux";
    
    # Get the current user for dynamic configurations
    currentUser = builtins.getEnv "USER";
    userName = if currentUser != "" then currentUser else "nixos";

    # Common nix-darwin modules for all Macs
    commonDarwinModules = [
      ./nix-darwin/configuration.nix
      ./nix-darwin/packages.nix
      ./nix-darwin/shell-applications.nix
      ./nix-darwin/services.nix
      ./nix-darwin/homebrew.nix
    ];
    
    # Common NixOS modules for Linux systems
    commonLinuxModules = [
      ./nixos/configuration.nix
      catppuccin.nixosModules.catppuccin
      nixos-hardware.nixosModules.framework-13-7040-amd
      {
        environment.systemPackages = [
          ghostty.packages.${systemLinux}.default
        ];
      }
    ];
  in
  {
    nixosConfigurations = {
      # Keep the original brandon-linux for backward compatibility
      brandon-linux = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs self; };
        system = systemLinux;
        modules = commonLinuxModules;
      };
      
      # Dynamic configuration that works with any username
      "${userName}-linux" = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs self; };
        system = systemLinux;
        modules = commonLinuxModules;
      };
      
      # Default Linux configuration for install scripts
      default-linux = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs self; };
        system = systemLinux;
        modules = commonLinuxModules;
      };
    };

    # Use a single "default" configuration that will work for any Mac
    darwinConfigurations.default = darwin.lib.darwinSystem {
      system = systemDarwin;
      specialArgs = { inherit inputs self; };
      modules = commonDarwinModules;
    };

    darwinPackages = self.darwinConfigurations.default.pkgs;
  };
}