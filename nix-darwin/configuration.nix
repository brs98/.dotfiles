{ self, inputs, config, lib, user ? null, ... }: 
let
  # Use passed user parameter, or detect current user
  # This uses a more standard approach that works with darwin-rebuild
  userName = 
    if user != null then user
    else if (builtins.pathExists "/Users") then
      # Find non-system users and return the first regular user
      let 
        allItems = builtins.readDir "/Users";
        userDirs = builtins.filter (x: 
          # Only include directories (not files like .localized)
          (builtins.getAttr x allItems) == "directory" &&
          # Exclude system directories and files
          x != ".DS_Store" && x != "Shared" && x != "Guest" && x != "daemon" && 
          # Exclude system accounts that start with underscore or dot
          !(lib.hasPrefix "_" x) && !(lib.hasPrefix "." x)
        ) (builtins.attrNames allItems);
      in
        if (builtins.length userDirs) > 0 
        then (builtins.head userDirs)
        else "admin"
    else "admin";
in
{

imports = [
	inputs.home-manager.darwinModules.home-manager
	./system-defaults.nix
  ];

users.users.${userName}.home = "/Users/${userName}";

  # Set primary user for homebrew and other user-specific options
  system.primaryUser = userName;

  # Fix GID mismatch for nixbld group
  ids.gids.nixbld = 350;

  home-manager = {
	backupFileExtension = "backup";
	useGlobalPkgs = true;
	useUserPackages = true;
  	extraSpecialArgs = { inherit inputs; };
	users.${userName} = {
		imports = [ ../home-manager/systems/mac.nix ];
		home.username = userName;
		home.homeDirectory = "/Users/${userName}";
	};
  };

  # Necessary for using flakes on this system.
  nix.settings.experimental-features = "nix-command flakes";
  nix.channel.enable = false;

  nix.extraOptions = ''
    extra-platforms = aarch64-darwin x86_64-darwin
    experimental-features = nix-command flakes
  '';

  # Create /etc/zshrc that loads the nix-darwin environment.
  programs.zsh.enable = true;

  # System defaults are now configured in ./system-defaults.nix

  # Set Git commit hash for darwin-version.
  system.configurationRevision = self.rev or self.dirtyRev or null;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 4;

  # The platform the configuration will be used on.
  nixpkgs.hostPlatform = "aarch64-darwin";
}
