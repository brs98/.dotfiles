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

    # Get hostname from environment variable with fallback
    hostname =
      let h = builtins.getEnv "DARWIN_HOSTNAME";
      in if h == "" then "default-mac" else h;

    # Helper function to create Darwin configurations
    makeDarwinConfig = hostName: darwin.lib.darwinSystem {
      system = systemDarwin;
      specialArgs = { inherit inputs self; };
      modules = [
        ./nix-darwin/configuration.nix
        ./nix-darwin/packages.nix
        ./nix-darwin/shell-applications.nix
        ./nix-darwin/services.nix
        ./nix-darwin/homebrew.nix
      ];
    };

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

    # Static hostname configurations
    staticHostnames = [
      "Brandons-Macbook-Pro"
      "Brandons-MacBook-Pro-2"
      "default-mac"
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

    darwinConfigurations = 
      # Create static configurations
      builtins.listToAttrs (map (hostName: {
        name = hostName;
        value = makeDarwinConfig hostName;
      }) staticHostnames)
      
      # Add dynamic hostname if not already covered by static ones
      // (if builtins.elem hostname staticHostnames then {} else {
        ${hostname} = makeDarwinConfig hostname;
      });

    # Use the resolved hostname for darwinPackages
    darwinPackages = 
      if self.darwinConfigurations ? ${hostname}
      then self.darwinConfigurations.${hostname}.pkgs
      else self.darwinConfigurations."default-mac".pkgs;
  };
}