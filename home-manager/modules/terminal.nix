
{config, inputs, pkgs, ...}: let
  configDir = "${config.home.homeDirectory}/.dotfiles";
  weztermDir = "${configDir}/home-manager/configs/wezterm/wezterm.lua";
  starshipDir = "${configDir}/home-manager/configs/starship/starship.toml";
in {
  programs = {
      # terminal
      wezterm = {
        enable = true;
        package = inputs.wezterm.packages.${pkgs.system}.default;
      };

      kitty = {
        enable = true;
        shellIntegration.enableZshIntegration = true;
        settings = {
          background_opacity = 0.8;
        };
      };

      # starship configuration (prompt)
      starship = {
        enable = true;
        enableZshIntegration = true;
      };

      # bat configuration
      bat = {
        enable = true;
      };

      # zsh configuration
      zsh = {
        enable = true;
        enableCompletion = true;
        autosuggestion.enable = true;
        syntaxHighlighting.enable = true;
        shellAliases = {
          v = "nvim";
          vim = "nvim";
          lg = "lazygit";
          ldk = "lazydocker";
          sdf = "home-manager -f ~/.dotfiles/nix-darwin/home.nix switch";
          sf = "darwin-rebuild switch --flake ~/.dotfiles/nix-darwin";
          cat = "bat --theme=base16";
          ls = "eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions";
          cd = "z";
          cdd = "cd ~/.dotfiles/";
        };
      };
      # fzf configuration
      fzf = {
        enable = true;
        enableZshIntegration = true;
      };
      # fd configuration
      fd = {
        enable = true;
      };
      # zoxide configuration
      zoxide = {
        enable = true;
        enableZshIntegration = true;
      };

      # eza configuration
      eza = {
        enable = true;
        enableZshIntegration = true;
      };

      # yazi configuration
      yazi = {
        enable = true;
        enableZshIntegration = true;
      };

  };

  # wezterm configuration
  xdg.configFile."wezterm/wezterm.lua".enable = false;
  home.file.".config/wezterm/wezterm.lua" = {
    source = config.lib.file.mkOutOfStoreSymlink weztermDir;
  };

  # starship configuration
  home.file.".config/starship.toml" = {
    source = config.lib.file.mkOutOfStoreSymlink starshipDir;
  };
}
