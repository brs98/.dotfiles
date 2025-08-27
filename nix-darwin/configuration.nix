{ self, inputs, config, lib, ... }: 
let
  # Use passed user parameter, or detect current user
  # This uses a more standard approach that works with darwin-rebuild
  userName = "brandon";
in
{

imports = [
	inputs.home-manager.darwinModules.home-manager
	./system-defaults.nix
  ];

users.users.${userName}.home = "/Users/${userName}";

  # Set primary user for homebrew and other user-specific options
  system.primaryUser = "brandon";

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
