{config, ...}: let
  configDir = "${config.home.homeDirectory}/.dotfiles";
  hyprDir = "${configDir}/home-manager/configs/hypr";
in {
  home.file = {
    # This is to allow lazy-lock.json to be writable
    ".config/hypr".source = config.lib.file.mkOutOfStoreSymlink hyprDir;
  };
}
