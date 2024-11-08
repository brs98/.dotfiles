{
  description = "My Nix Darwin configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs }:
    {
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
