{ self, inputs, config, ... }: {

imports = [
	inputs.home-manager.darwinModules.home-manager
  ];


		users.users.Brandon.home = "/Users/Brandon";

  home-manager = {
  	backupFileExtension = "backup";
      useGlobalPkgs = true;
  useUserPackages = true;
  	extraSpecialArgs = { inherit inputs; };
	users = {
		Brandon = import ../home-manager/systems/mac.nix;
	};
  };

  # Necessary for using flakes on this system.
  nix.settings.experimental-features = "nix-command flakes";

  nix.extraOptions = ''
    extra-platforms = aarch64-darwin x86_64-darwin
    experimental-features = nix-command flakes
  '';

  # Create /etc/zshrc that loads the nix-darwin environment.
  programs.zsh.enable = true;

  # Set Git commit hash for darwin-version.
  system.configurationRevision = self.rev or self.dirtyRev or null;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 4;

  # The platform the configuration will be used on.
  nixpkgs.hostPlatform = "aarch64-darwin";
}
