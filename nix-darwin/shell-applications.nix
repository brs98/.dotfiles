{pkgs, ...}: {
  # List packages installed in system profile. To search by name, run:
  # $ nix-env -qaP | grep wget
  environment.systemPackages =
    [
      # example of how to write an executable shell script
      (
        pkgs.writeShellApplication {
          name = "dev";
          # runtimeInputs = [ pkgs.curl pkgs.w3m ];
          text = ''
            current_dir=$(basename "$PWD")

            if [[ "$current_dir" = "roofworx-monorepo" ]]; then
                # If in 'roofworx-monorepo', run 'pnpm dev:next'
                pnpm dev:next
            else
                # Otherwise, run 'pnpm dev'
                pnpm dev
            fi
          '';
        }
      )

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
