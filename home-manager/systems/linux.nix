{pkgs, ...}: {

  imports = [
    ../modules/git.nix
    ../modules/gtk.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
  ];

    home.username = "brandon";
    home.homeDirectory = "/home/brandon";
    home.stateVersion = "23.11";

    home.packages = with pkgs; [
      gnused
      htop
      wget
      typescript
      lazydocker

      gcc

      nodejs_20
      corepack_20

      trunk
      rustup

      (nerdfonts.override { fonts = [ "Hack" ]; })
      tree
      nodePackages.typescript-language-server
      nodePackages.ts-node
      nodePackages.dotenv-cli
      nodePackages.vercel
    ];

    programs = {
      home-manager.enable = true;
      gpg.enable = true;
      ripgrep.enable = true;
      jq.enable = true;
    };

    # wezterm configuration
    # home.file.".config/wezterm" = {
    #   source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/wezterm";
    # };
}
