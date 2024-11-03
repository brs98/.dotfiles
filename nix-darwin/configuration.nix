{ self, ... }: {
        imports = [];

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
        nixpkgs.hostPlatform = "aarch64-darwin";

        homebrew = {
          enable = true;
          brews = [
            "gnu-sed"
            "nixpacks"
          ];
          casks = [
            "dbeaver-community" # SQL GUI
            "maccy" # Clipboard manager
            "font-hack-nerd-font" # Nerd font
            "ngrok" # Tunneling
            "postman" # API testing
            "obs" # Screen recording
            "wezterm" # Terminal
            "slack" # Communication
            "linear-linear" # Project management
            "nikitabobko/tap/aerospace" # Window management
            "1password" # Password manager
          ];
        };

      }
