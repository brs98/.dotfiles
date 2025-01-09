{config, ...}: let
  configDir = "${config.home.homeDirectory}/.dotfiles";
  nvimDir = "${configDir}/home-manager/configs/nvim";
in {
  programs.neovim = {
  	enable = true;
	defaultEditor = true;
  };

  home.sessionVariables = {
    EDITOR = "nvim";
  };

  home.file = {
    # This is to allow lazy-lock.json to be writable
    ".config/nvim".source = config.lib.file.mkOutOfStoreSymlink nvimDir;
  };
}
