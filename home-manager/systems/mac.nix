{ inputs, config, pkgs, ... }: 
let 
  # Home Manager receives the user configuration from the parent nix-darwin configuration
  # The home.username and home.homeDirectory are set by the parent, so we can derive from them
  configDir = "${config.home.homeDirectory}/.dotfiles";
  sketchybarDir = "${configDir}/home-manager/configs/sketchybar";
  aerospaceDirectory = "${configDir}/home-manager/configs/aerospace/aerospace.toml";
in {
imports = [
    ../modules/git.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
    ../modules/packages.nix
    ../modules/packages-darwin.nix
    ../modules/fonts.nix
    ../modules/cursor.nix
    ../modules/tmux.nix
  ];

  # These will be set by the parent nix-darwin configuration
  # home.username and home.homeDirectory are managed by nix-darwin
  home.username = "brandon";
  home.stateVersion = "23.11";



  # sketchybar configuration
  home.file.".config/sketchybar" = {
    source = config.lib.file.mkOutOfStoreSymlink sketchybarDir;
    recursive = true;
  };

  # aerospace configuration
  home.file.".config/aerospace/aerospace.toml" = {
    source = config.lib.file.mkOutOfStoreSymlink aerospaceDirectory;
  };
}

