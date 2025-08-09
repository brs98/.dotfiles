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
    hostname = builtins.getEnv "HOSTNAME";

    # Common nix-darwin modules for all Macs
    commonDarwinModules = [
      ./nix-darwin/configuration.nix
      ./nix-darwin/packages.nix
      ./nix-darwin/shell-applications.nix
      ./nix-darwin/services.nix
      ./nix-darwin/homebrew.nix
    ];

    # Common NixOS modules for all Linux machines
    commonNixosModules = [
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
      brandon-linux = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs self; };
        system = systemLinux;
        modules = commonNixosModules;
      };
    };

    # Nix-darwin configs — hostname-specific and default fallback
    darwinConfigurations = {
      ${hostname} = darwin.lib.darwinSystem {
        system = systemDarwin;
        specialArgs = { inherit inputs self; };
        modules = commonDarwinModules;
      };
    };

    # Pick one package set to expose (doesn't matter which hostname)
    darwinPackages = self.darwinConfigurations.${hostname}.pkgs;
  };
}

