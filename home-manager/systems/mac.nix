{ inputs, config, pkgs, ... }: let 
  configDir = "${config.home.homeDirectory}/.dotfiles";
  # sketchybarDir = "${configDir}/home-manager/config/sketchybar/sketchybarrc";
  aerospaceDirectory = "${configDir}/home-manager/configs/aerospace/aerospace.toml";
in {
imports = [
    ../modules/git.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
    ../modules/packages.nix
    ../modules/packages-darwin.nix
    ../modules/fonts.nix
  ];

  home.username = "brandon";
  home.homeDirectory = if pkgs.stdenv.isDarwin then "/Users/brandon" else "/home/brandon";
  home.stateVersion = "23.11";



  # sketchybar configuration
  # home.file.".config/sketchybar/sketchybarrc" = {
  #   source = config.lib.file.mkOutOfStoreSymlink sketchybarDir;
  # };

  # aerospace configuration
  home.file.".config/aerospace/aerospace.toml" = {
    source = config.lib.file.mkOutOfStoreSymlink aerospaceDirectory;
  };
}

