{pkgs, ...}: 
let
  # Get the current user dynamically
  currentUser = builtins.getEnv "USER";
  # Fallback to reasonable defaults if USER is not set
  userName = if currentUser != "" then currentUser else "nixos";
in
{

  imports = [
    ../modules/git.nix
    # ../modules/gtk.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
    ../modules/packages.nix
    ../modules/packages-linux.nix
    ../modules/fonts.nix
    ../modules/hyprland.nix
    ../modules/cursor.nix
  ];

    home.username = userName;
    home.homeDirectory = if pkgs.stdenv.isDarwin then "/Users/${userName}" else "/home/${userName}";
    home.stateVersion = "23.11";

}
