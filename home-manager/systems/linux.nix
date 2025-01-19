{inputs, confg, pkgs, ...}: {

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

      go

      gcc

      nodejs_22
      corepack

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
}
