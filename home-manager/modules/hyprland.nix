{config, ...}: let
  configDir = "${config.home.homeDirectory}/.dotfiles";
  hyprDir = "${configDir}/home-manager/configs/hypr";
in {
  home.file = {
    ".config/hypr".source = config.lib.file.mkOutOfStoreSymlink hyprDir;
  };
}
