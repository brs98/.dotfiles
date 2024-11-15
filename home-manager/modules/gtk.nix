{pkgs, ...}: {
    gtk = {
      enable = true;
      cursorTheme = {
        package = pkgs.vanilla-dmz;
        name = "Vanilla-DMZ";
      };
      theme = {
        name = "Dracula";
        package = pkgs.dracula-theme;
      };
    };
}
