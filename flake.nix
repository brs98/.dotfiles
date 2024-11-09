{
  description = "Dotfiles for both NixOS and Nix-Darwin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    nix-darwin.url = "github:LnL7/nix-darwin";
    home-manager.url = "github:nix-community/home-manager";
  };

  outputs = { self, nixpkgs, nix-darwin, home-manager }: {
    # Define configurations for different systems
    nixosConfigurations = {
      brandon-linux = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
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
          ./home-manager/linux.nix
        ];
      };

      "brandon-mac" = home-manager.lib.homeManagerConfiguration {
        pkgs = import nixpkgs { system = "x86_64-darwin"; };
        modules = [
          ./home-manager/mac.nix
        ];
      };
    };
  };
}

