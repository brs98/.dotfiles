{
  description = "Example Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs }:
    let
      configuration = { pkgs, ... }: {
        # List packages installed in system profile. To search by name, run:
        # $ nix-env -qaP | grep wget
        environment.systemPackages =
          [
            pkgs.vim

            # example of how to write an executable shell script
            (
              pkgs.writeShellApplication {
                name = "dev";
                # runtimeInputs = [ pkgs.curl pkgs.w3m ];
                text = ''
                  current_dir=$(basename "$PWD")

                  if [[ "$current_dir" = "roofworx-monorepo" ]]; then
                      # If in 'roofworx-monorepo', run 'pnpm dev:next'
                      pnpm dev:next
                  else
                      # Otherwise, run 'pnpm dev'
                      pnpm dev
                  fi
                '';
              }
            )
          ];

        # Auto upgrade nix package and the daemon service.
        services.nix-daemon.enable = true;

        # Enable the Yabai window manager.
        services.yabai = {
          enable = true;
          extraConfig = ''
            # default layout (can be bsp, stack or float)
            yabai -m config layout bsp

            # new window spawns to the right if vertical split, or bottom if horizontal split
            yabai -m config window_placement second_child

            # padding set to 12px
            yabai -m config top_padding 12
            yabai -m config bottom_padding 12
            yabai -m config left_padding 12
            yabai -m config right_padding 12
            yabai -m config window_gap 12
            yabai -m config external_bar all:28:0

            # -- mouse settings --

            # center mouse on window with focus
            yabai -m config mouse_follows_focus on

            # modifier for clicking and dragging with mouse
            yabai -m config mouse_modifier alt
            # set modifier + left-click drag to move window
            yabai -m config mouse_action1 move
            # set modifier + right-click drag to resize window
            yabai -m config mouse_action2 resize

            # when window is dropped in center of another window, swap them (on edges it will split it)
            yabai -m mouse_drop_action swap

            # disable specific apps
            yabai -m rule --add app="^Calculator$" manage=off
          '';
        };

        # Enable the skhd hotkey daemon.
        services.skhd = {
          enable = true;
          skhdConfig = ''
            # -- Changing Window Focus --

            # change window focus within space
            alt - j : yabai -m window --focus south
            alt - k : yabai -m window --focus north
            alt - h : yabai -m window --focus west
            alt - l : yabai -m window --focus east

            #change focus between external displays (left and right)
            alt - s: yabai -m display --focus west
            alt - g: yabai -m display --focus east

            # -- Modifying the Layout --

            # rotate layout clockwise
            shift + alt - r : yabai -m space --rotate 270

            # flip along y-axis
            shift + alt - y : yabai -m space --mirror y-axis

            # flip along x-axis
            shift + alt - x : yabai -m space --mirror x-axis

            # toggle window float
            shift + alt - t : yabai -m window --toggle float --grid 4:4:1:1:2:2


            # -- Modifying Window Size --

            # maximize a window
            shift + alt - m : yabai -m window --toggle zoom-fullscreen

            # balance out tree of windows (resize to occupy same area)
            shift + alt - e : yabai -m space --balance

            # -- Moving Windows Around --

            # swap windows
            shift + alt - j : yabai -m window --swap south
            shift + alt - k : yabai -m window --swap north
            shift + alt - h : yabai -m window --swap west
            shift + alt - l : yabai -m window --swap east

            # move window and split
            ctrl + alt - j : yabai -m window --warp south
            ctrl + alt - k : yabai -m window --warp north
            ctrl + alt - h : yabai -m window --warp west
            ctrl + alt - l : yabai -m window --warp east

            # move window to display left and right
            shift + alt - s : yabai -m window --display west; yabai -m display --focus west;
            shift + alt - g : yabai -m window --display east; yabai -m display --focus east;


            # move window to prev and next space
            shift + alt - p : yabai -m window --space prev;
            shift + alt - n : yabai -m window --space next;

            # move window to space #
            shift + alt - 1 : yabai -m window --space 1;
            shift + alt - 2 : yabai -m window --space 2;
            shift + alt - 3 : yabai -m window --space 3;
            shift + alt - 4 : yabai -m window --space 4;
            shift + alt - 5 : yabai -m window --space 5;
            shift + alt - 6 : yabai -m window --space 6;
            shift + alt - 7 : yabai -m window --space 7;
            shift + alt - 8 : yabai -m window --space 8;
            shift + alt - 9 : yabai -m window --space 9;
            shift + alt - 0 : yabai -m window --space 10;
          '';
        };

        # nix.package = pkgs.nix;

        # Necessary for using flakes on this system.
        nix.settings.experimental-features = "nix-command flakes";

        nix.extraOptions = ''
          extra-platforms = aarch64-darwin x86_64-darwin
          experimental-features = nix-command flakes
        '';

        # Create /etc/zshrc that loads the nix-darwin environment.
        programs.zsh.enable = true; # default shell on catalina
        # programs.fish.enable = true;

        # Set Git commit hash for darwin-version.
        system.configurationRevision = self.rev or self.dirtyRev or null;

        # Used for backwards compatibility, please read the changelog before changing.
        # $ darwin-rebuild changelog
        system.stateVersion = 4;

        # The platform the configuration will be used on.
        # nixpkgs.hostPlatform = "aarch64-darwin";
        # nixpkgs.hostPlatform = "aarch64-darwin";
        nixpkgs.hostPlatform = "x86_64-darwin";


      };
    in
    {
      # Build darwin flake using:
      # $ darwin-rebuild build --flake .#Brandons-MacBook-Pro
      darwinConfigurations."Brandons-MacBook-Pro" = nix-darwin.lib.darwinSystem {
        modules = [
          configuration
        ];
      };

      # Expose the package set, including overlays, for convenience.
      darwinPackages = self.darwinConfigurations."Brandons-MacBook-Pro".pkgs;
    };
}
