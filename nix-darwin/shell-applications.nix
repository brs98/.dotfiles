{pkgs, ...}: {
  # List packages installed in system profile. To search by name, run:
  # $ nix-env -qaP | grep wget
  environment.systemPackages =
    [
      # script to set PASSWORD_STORE_DIR to the correct location
      (
        pkgs.writeShellApplication {
          name = "p";
          runtimeInputs = [ pkgs.pass ];
          text = ''
            export PASSWORD_STORE_DIR="$HOME/.password-store-personal"

            # Shift arguments to pass them to `pass`
            shift || true

            # Execute the `pass` command with the remaining arguments
            exec pass "$@"
          '';
        }
      )

    ];
}
