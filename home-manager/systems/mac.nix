{ inputs, config, pkgs, ... }: 
let 
  # Get the current user dynamically
  currentUser = builtins.getEnv "USER";
  # Fallback to reasonable defaults if USER is not set
  userName = if currentUser != "" then currentUser else "nixos";
  
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
  ];

  home.username = userName;
  home.homeDirectory = if pkgs.stdenv.isDarwin then "/Users/${userName}" else "/home/${userName}";
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

