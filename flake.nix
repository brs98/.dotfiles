{
  description = "Dotfiles for both NixOS and Nix-Darwin";

  inputs = {
    rose-pine-hyprcursor.url = "github:ndom91/rose-pine-hyprcursor";
    wezterm.url = "github:wez/wezterm?dir=nix";
    catppuccin.url = "github:catppuccin/nix";
    home-manager = {
      url = "github:nix-community/home-manager/release-24.11";
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
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    # nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-24.11-darwin"; # TODO: Use this for macOS
    darwin.url = "github:lnl7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { 
  self,
  catppuccin,
  ghostty,
  home-manager,
  darwin,
  nixpkgs,
  ...
  }@inputs : {
    # Define configurations for different systems
    nixosConfigurations = {
      brandon-linux = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs self; };
        system = "x86_64-linux";
        modules = [
          ./nixos/configuration.nix
          catppuccin.nixosModules.catppuccin
          {
            environment.systemPackages = [
              ghostty.packages.x86_64-linux.default
            ];
          }
        ];
      };
    };

    # Build darwin flake using:
    # $ darwin-rebuild switch --flake ~/.dotfiles
    darwinConfigurations = {
        brandon-mac = darwin.lib.darwinSystem {
          system = "aarch64-darwin";
          specialArgs = { inherit inputs self; };
          modules = [
		./nix-darwin/configuration.nix
		./nix-darwin/packages.nix
		./nix-darwin/shell-applications.nix
		./nix-darwin/services.nix
		./nix-darwin/homebrew.nix
          ];
        };
      };

    # Expose the package set, including overlays, for convenience.
    darwinPackages = self.darwinConfigurations.brandon-mac.pkgs;
      };
}
