{
  description = "WezTerm Flake";

  inputs = {
    # Use the nixpkgs flake to get access to nixpkgs packages.
    nixpkgs.url = "github:NixOS/nixpkgs";
  };

  outputs = { self, nixpkgs, ... }:
    let
      system = "x86_64-linux";  # Adjust if you're on a different architecture
      pkgs = import nixpkgs {
        inherit system;
      };
      wezterm = pkgs.stdenv.mkDerivation {
        pname = "wezterm";
        version = "latest";

        src = pkgs.fetchFromGitHub {
          owner = "wez";
          repo = "wezterm";
          rev = "main";  # or use a specific commit hash or tag
          sha256 = "0000000000000000000000000000000000000000000000000000000000000000";  # Update this with the actual sha256 hash
        };

        nativeBuildInputs = [ pkgs.cmake pkgs.pkg-config ];

        buildInputs = [ pkgs.libxcb pkgs.x11 pkgs.fontconfig ];

        meta = with pkgs.lib; {
          description = "WezTerm is a GPU-accelerated terminal emulator and multiplexer";
          license = licenses.mit;
          maintainers = [];
        };
      };
    in
      {
        packages.${system}.default = wezterm;
      };
}


