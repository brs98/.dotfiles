{pkgs, ...}: {

  imports = [
    ../modules/git.nix
    # ../modules/gtk.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
    ../modules/packages.nix
    ../modules/packages-linux.nix
    ../modules/fonts.nix
  ];

    home.username = "brandon";
    home.homeDirectory = if pkgs.stdenv.isDarwin then "/Users/brandon" else "/home/brandon";
    home.stateVersion = "23.11";

}
