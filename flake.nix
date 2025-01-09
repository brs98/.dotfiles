{
  description = "Dotfiles for both NixOS and Nix-Darwin";

  inputs = {
    wezterm.url = "github:wez/wezterm?dir=nix";
    catppuccin.url = "github:catppuccin/nix";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # nix-homebrew = {
    #   url = "github:zhaofengli-wip/nix-homebrew";
    # };
    # homebrew-bundle = {
    #   url = "github:homebrew/homebrew-bundle";
    #   flake = false;
    # };
    # homebrew-core = {
    #   url = "github:homebrew/homebrew-core";
    #   flake = false;
    # };
    # homebrew-cask = {
    #   url = "github:homebrew/homebrew-cask";
    #   flake = false;
    # };
    hyprland.url = "github:hyprwm/Hyprland";
    hyprland-plugins = {
      url = "github:hyprwm/hyprland-plugins";
      inputs.hyprland.follows = "hyprland";
    };
    ghostty = {
      url = "github:ghostty-org/ghostty";
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-24.11-darwin";
    darwin.url = "github:lnl7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { 
  self,
  catppuccin,
  ghostty,
  home-manager,
  # homebrew-bundle,
  # homebrew-cask,
  # homebrew-core,
  darwin,
  # nix-homebrew,
  nixpkgs,
  ...
  }@inputs : {
    # Define configurations for different systems
    nixosConfigurations = {
      brandon-linux = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs; };
        system = "x86_64-linux";
        modules = [
          catppuccin.nixosModules.catppuccin
          ./nixos/configuration.nix
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
            # nix-homebrew.darwinModules.nix-homebrew
            # {
              # nix-homebrew = {
              #   inherit user;
              #   enable = true;
              #   taps = {
              #     "homebrew/homebrew-core" = homebrew-core;
              #     "homebrew/homebrew-cask" = homebrew-cask;
              #     "homebrew/homebrew-bundle" = homebrew-bundle;
              #   };
              #   mutableTaps = false;
              #   autoMigrate = true;
              # };
            # }
          ];
        };
      };

    # Expose the package set, including overlays, for convenience.
    darwinPackages = self.darwinConfigurations.brandon-mac.pkgs;

    # Define a home-manager configuration for non-root user environments
	#    homeConfigurations = {
	#      "brandon-linux" = home-manager.lib.homeManagerConfiguration {
	#        pkgs = import nixpkgs { system = "x86_64-linux"; };
	#        extraSpecialArgs = { inherit inputs; };
	#        modules = [
	#          ./home-manager/systems/linux.nix
	#        ];
	#      };
	# };

	#      "brandon-mac" = home-manager.lib.homeManagerConfiguration {
	#        pkgs = import nixpkgs { system = "aarch64-darwin"; };
	#        modules = [
	#          ./home-manager/systems/mac.nix
	#        ];
	# system = "aarch64-darwin";
	#      };
      };
}
