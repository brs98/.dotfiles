{pkgs, inputs, ...}: {

  wayland.windowManager.hyprland = {
    enable = true;
    # Use null to defer to the system-wide Hyprland package from NixOS module
    # This ensures compatibility and avoids package conflicts
    package = null;
    portalPackage = null;
    
    # Enable system integration
    systemd.enable = true;
    xwayland.enable = true;
    
    # Basic Hyprland configuration
    settings = {
      # Set modifier key
      "$mod" = "SUPER";
      
      # Basic keybindings
      bind = [
        # Launch applications
        "$mod, Return, exec, kitty"
        "$mod, D, exec, wofi --show drun"
        "$mod, Q, killactive"
        "$mod SHIFT, E, exit"
        
        # Window management
        "$mod, F, fullscreen"
        "$mod, Space, togglefloating"
        
        # Move focus
        "$mod, h, movefocus, l"
        "$mod, l, movefocus, r"
        "$mod, k, movefocus, u"
        "$mod, j, movefocus, d"
        
        # Move windows
        "$mod SHIFT, h, movewindow, l"
        "$mod SHIFT, l, movewindow, r"
        "$mod SHIFT, k, movewindow, u"
        "$mod SHIFT, j, movewindow, d"
        
        # Screenshot
        ", Print, exec, grim -g \"$(slurp)\" - | wl-copy"
        "$mod, Print, exec, grim - | wl-copy"
      ] ++ (
        # Workspaces - bind $mod + [shift +] {1..9} to [move to] workspace {1..9}
        builtins.concatLists (builtins.genList (i:
          let ws = i + 1;
          in [
            "$mod, ${toString ws}, workspace, ${toString ws}"
            "$mod SHIFT, ${toString ws}, movetoworkspace, ${toString ws}"
          ]
        ) 9)
      );
      
      # Input configuration
      input = {
        kb_layout = "us";
        kb_options = "ctrl:nocaps";
        follow_mouse = 1;
        touchpad = {
          natural_scroll = true;
          disable_while_typing = true;
          tap-to-click = true;
        };
        sensitivity = 0; # -1.0 - 1.0, 0 means no modification
      };
      
      # General settings
      general = {
        gaps_in = 5;
        gaps_out = 10;
        border_size = 2;
        "col.active_border" = "rgba(cba6f7ff) rgba(89b4faff) 45deg";
        "col.inactive_border" = "rgba(585b70aa)";
        layout = "dwindle";
        allow_tearing = false;
      };
      
      # Decoration
      decoration = {
        rounding = 8;
        blur = {
          enabled = true;
          size = 8;
          passes = 3;
          new_optimizations = true;
        };
        shadow = {
          enabled = true;
          range = 4;
          render_power = 3;
          color = "rgba(1a1a1aee)";
        };
      };
      
      # Animations
      animations = {
        enabled = true;
        bezier = "myBezier, 0.05, 0.9, 0.1, 1.05";
        animation = [
          "windows, 1, 7, myBezier"
          "windowsOut, 1, 7, default, popin 80%"
          "border, 1, 10, default"
          "borderangle, 1, 8, default"
          "fade, 1, 7, default"
          "workspaces, 1, 6, default"
        ];
      };
      
      # Layout settings
      dwindle = {
        pseudotile = true;
        preserve_split = true;
      };
      
      # Gestures
      gestures = {
        workspace_swipe = true;
        workspace_swipe_fingers = 3;
      };
      
      # Miscellaneous
      misc = {
        force_default_wallpaper = 0;
        disable_hyprland_logo = true;
        disable_splash_rendering = true;
        mouse_move_enables_dpms = true;
        key_press_enables_dpms = true;
      };
      
      # Monitor configuration - using auto for now, can be customized
      monitor = [
        ",preferred,auto,1.5"  # High-DPI scaling for Framework laptop
      ];
      
      # Environment variables
      env = [
        "XCURSOR_SIZE,24"
        "HYPRCURSOR_SIZE,24"
      ];
      
      # Window rules
      windowrulev2 = [
        "float, class:^(pavucontrol)$"
        "float, class:^(nm-applet)$"
        "float, class:^(blueman-manager)$"
        "float, class:^(org.kde.polkit-kde-authentication-agent-1)$"
      ];
      
      # Layer rules for better integration
      layerrule = [
        "blur, waybar"
        "blur, notifications"
        "blur, wofi"
      ];
      
      # Startup applications
      exec-once = [
        "waybar"
        "mako"
        "hyprpaper"
        "hypridle"
        "nm-applet"
        # Set cursor theme
        "hyprctl setcursor rose-pine-hyprcursor 24"
      ];
    };
  };
  
  # Ensure required packages are available
  home.packages = with pkgs; [
    # Screenshot tools
    grim
    slurp
    
    # Clipboard
    wl-clipboard
    
    # Application launcher
    wofi
    
    # Status bar and notifications
    waybar
    mako
    libnotify
    
    # Wallpaper and idle management
    hyprpaper
    hypridle
    hyprlock
    
    # System tray applications
    networkmanagerapplet
    pavucontrol
    
    # Rose Pine cursor theme from flake input
    inputs.rose-pine-hyprcursor.packages.${pkgs.system}.default
  ];
}