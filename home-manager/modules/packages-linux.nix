{ pkgs, ... }: {
  home.packages = with pkgs; [
    # Linux-specific packages
    gcc
    corepack
  ];
}