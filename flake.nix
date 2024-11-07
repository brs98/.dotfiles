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
      brandon = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./nixos/configuration.nix
          home-manager.nixosModules.home-manager
          { home-manager.useUserPackages = true; }
        ];
      };
    };

    # Build darwin flake using:
    # $ darwin-rebuild build --flake .#Brandons-MacBook-Pro
    darwinConfigurations."Brandons-MacBook-Pro" = nix-darwin.lib.darwinSystem {
      modules = [
        ./configuration.nix
        ./packages.nix
        ./shell-applications.nix
        ./services.nix
      ];
      specialArgs = {
        inherit self;
      };
    };

    # Expose the package set, including overlays, for convenience.
    darwinPackages = self.darwinConfigurations."Brandons-MacBook-Pro".pkgs;
  };
}

