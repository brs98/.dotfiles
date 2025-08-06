{ pkgs, ... }: {
  home.packages = with pkgs; [
    (if pkgs.stdenv.isDarwin 
     then nerd-fonts.hack 
     else (nerdfonts.override { fonts = [ "Hack" ]; }))
  ];
}