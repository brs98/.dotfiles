{
  description = "Dotfiles for both NixOS and Nix-Darwin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    catppuccin.url = "github:catppuccin/nix";
    nix-darwin.url = "github:LnL7/nix-darwin";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    hyprland.url = "github:hyprwm/Hyprland";
    hyprland-plugins = {
      url = "github:hyprwm/hyprland-plugins";
      inputs.hyprland.follows = "hyprland";
    };
  };

  outputs = { self, nixpkgs, nix-darwin, home-manager, catppuccin, ... } @ inputs: {
    # Define configurations for different systems
    nixosConfigurations = {
      brandon-linux = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs; };
        system = "x86_64-linux";
        modules = [
          catppuccin.nixosModules.catppuccin
          ./nixos/configuration.nix
        ];
      };
    };

    # Build darwin flake using:
    # $ darwin-rebuild build --flake .#Brandons-MacBook-Pro
    darwinConfigurations."Brandons-MacBook-Pro" = nix-darwin.lib.darwinSystem {
      modules = [
        ./nix-darwin/configuration.nix
        ./nix-darwin/packages.nix
        ./nix-darwin/shell-applications.nix
        ./nix-darwin/services.nix
        ./nix-darwin/homebrew.nix
      ];
      specialArgs = {
        inherit self;
      };
    };

    # Expose the package set, including overlays, for convenience.
    darwinPackages = self.darwinConfigurations."Brandons-MacBook-Pro".pkgs;

    # Define a home-manager configuration for non-root user environments
    homeConfigurations = {
      "brandon-linux" = home-manager.lib.homeManagerConfiguration {
        pkgs = import nixpkgs { system = "x86_64-linux"; };
        modules = [
          ./home-manager/systems/linux.nix
        ];
      };

      "brandon-mac" = home-manager.lib.homeManagerConfiguration {
        pkgs = import nixpkgs { system = "x86_64-darwin"; };
        modules = [
          ./home-manager/systems/mac.nix
        ];
      };
    };
  };
}

