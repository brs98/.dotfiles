{config, ...}: let
  configDir = "${config.home.homeDirectory}/.dotfiles";
  waybarDir = "${configDir}/home-manager/configs/waybar";
in {
  home.file = {
    ".config/waybar".source = config.lib.file.mkOutOfStoreSymlink waybarDir;
  };
}
