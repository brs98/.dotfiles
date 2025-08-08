{ config, pkgs, lib, ... }:

{
  # Configure cursor theme and size consistently across platforms
  # Note: home.pointerCursor only supports Linux platforms
  home.pointerCursor = lib.mkIf pkgs.stdenv.isLinux {
    name = "Adwaita";
    package = pkgs.adwaita-icon-theme;
    size = 32;  # Linux cursor size
    
    # Enable X11 cursor support for Linux
    x11 = {
      enable = true;
      defaultCursor = "Adwaita";
    };
    
    # Enable GTK cursor support
    gtk.enable = true;
  };

  # GTK settings for better cursor and UI scaling
  gtk = {
    enable = true;
    
    # Use appropriate theme based on platform
    theme = {
      name = if pkgs.stdenv.isDarwin then "Adwaita" else "Adwaita-dark";
      package = pkgs.adwaita-icon-theme;
    };
    
    iconTheme = {
      name = "Adwaita";
      package = pkgs.adwaita-icon-theme;
    };
    
    # GTK settings for better scaling and appearance
    gtk3.extraConfig = {
      gtk-cursor-theme-size = if pkgs.stdenv.isDarwin then 24 else 32;
      gtk-application-prefer-dark-theme = true;
      gtk-button-images = true;
      gtk-menu-images = true;
      gtk-enable-animations = true;
      gtk-primary-button-warps-slider = false;
      # Better font rendering
      gtk-xft-antialias = 1;
      gtk-xft-hinting = 1;
      gtk-xft-hintstyle = "hintfull";
      gtk-xft-rgba = "rgb";
    };
    
    gtk4.extraConfig = {
      gtk-cursor-theme-size = if pkgs.stdenv.isDarwin then 24 else 32;
      gtk-application-prefer-dark-theme = true;
    };
  };

  # Qt settings for consistent theming and scaling (Linux only - Adwaita Qt theme not available on Darwin)
  qt = lib.mkIf pkgs.stdenv.isLinux {
    enable = true;
    platformTheme.name = "adwaita";
    style = {
      name = "adwaita-dark";
      package = pkgs.adwaita-qt;
    };
  };

  # Set environment variables for cursor size consistency
  home.sessionVariables = {
    XCURSOR_SIZE = toString (if pkgs.stdenv.isDarwin then 24 else 32);
  } // (if !pkgs.stdenv.isDarwin then {
    # Linux-specific cursor variables
    HYPRCURSOR_SIZE = "32";
  } else {});
}