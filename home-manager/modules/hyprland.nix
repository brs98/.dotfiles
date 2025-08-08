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
      
      # AeroSpace-matching keybindings
      bind = [
        # Launch applications (keeping existing ones)
        "$mod, Return, exec, wezterm"
        "$mod, Space, exec, wofi --show drun"
        "$mod, W, killactive"
        "$mod SHIFT, E, exit"
        
        # Window management - matching AeroSpace
        "$mod SHIFT, F, fullscreen"  # cmd-shift-f -> super-shift-f
        
        # Focus movement - matching AeroSpace ctrl-alt-left/down/up/right
        "CTRL ALT, left, movefocus, l"
        "CTRL ALT, down, movefocus, d"
        "CTRL ALT, up, movefocus, u"
        "CTRL ALT, right, movefocus, r"
        
        # Also support hjkl for focus (keeping existing)
        "$mod, h, movefocus, l"
        "$mod, l, movefocus, r"
        "$mod, k, movefocus, u"
        "$mod, j, movefocus, d"
        
        # Move windows - matching AeroSpace cmd-shift-h/j/k/l and cmd-shift-left/right
        "$mod SHIFT, h, movewindow, l"
        "$mod SHIFT, j, movewindow, d"
        "$mod SHIFT, k, movewindow, u"
        "$mod SHIFT, l, movewindow, r"
        "$mod SHIFT, left, movewindow, l"
        "$mod SHIFT, right, movewindow, r"
        
        # Layout switching - matching AeroSpace
        "$mod, slash, layoutmsg, togglesplit"  # cmd-slash -> tiles layout toggle
        "$mod, comma, layoutmsg, orientationcycle left top"  # cmd-comma -> accordion-like behavior
        
        # Workspace back-and-forth - matching AeroSpace cmd-tab
        "$mod, Tab, workspace, previous"
        
        # Move workspace to next monitor - matching AeroSpace cmd-shift-tab  
        "$mod SHIFT, Tab, moveworkspacetomonitor, current +1"
        
        # Screenshot (keeping existing)
        ", Print, exec, grim -g \"$(slurp)\" - | wl-copy"
        "$mod, Print, exec, grim - | wl-copy"
        
        # Additional function key bindings (F9, F11, F12)
        # F9: Notification do-not-disturb toggle
        ", F9, exec, makoctl mode -t do-not-disturb"
        
        # F11: Print screen (alternative to Print key)
        ", F11, exec, grim -g \"$(slurp)\" - | wl-copy"
        
        # F12: Settings
        ", F12, exec, gnome-control-center || systemsettings5 || pavucontrol"
        
      ] ++ (
        # Workspaces - bind $mod + [shift +] {1..9} to [move to] workspace {1..9}
        # Matching AeroSpace cmd-1 through cmd-9 and cmd-shift-1 through cmd-shift-9
        builtins.concatLists (builtins.genList (i:
          let ws = i + 1;
          in [
            "$mod, ${toString ws}, workspace, ${toString ws}"
            "$mod SHIFT, ${toString ws}, movetoworkspace, ${toString ws}"
          ]
        ) 9)
      );
      
      # Configure workspace back-and-forth behavior
      binds = {
        workspace_back_and_forth = true;
      };
      
      # === Function Key Media Controls ===
      # Using proper bind types for media keys
      
      # Locked binds (work even when screen is locked) - for mute, media controls, wifi
      bindl = [
        # F1: Mute
        ", XF86AudioMute, exec, wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"
        ", F1, exec, wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"
        
        # F4: Previous track
        ", XF86AudioPrev, exec, playerctl previous"
        ", F4, exec, playerctl previous"
        
        # F5: Play/Pause
        ", XF86AudioPlay, exec, playerctl play-pause"
        ", F5, exec, playerctl play-pause"
        
        # F6: Next track
        ", XF86AudioNext, exec, playerctl next"
        ", F6, exec, playerctl next"
        
        # F10: WiFi toggle
        ", XF86WLAN, exec, nmcli radio wifi | grep -q enabled && nmcli radio wifi off || nmcli radio wifi on"
        ", F10, exec, nmcli radio wifi | grep -q enabled && nmcli radio wifi off || nmcli radio wifi on"
      ];
      
      # Repeatable binds - for volume and brightness controls
      bindel = [
        # F2: Volume down
        ", XF86AudioLowerVolume, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"
        ", F2, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"
        
        # F3: Volume up
        ", XF86AudioRaiseVolume, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+"
        ", F3, exec, wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+"
        
        # F7: Brightness down
        ", XF86MonBrightnessDown, exec, brightnessctl set 5%-"
        ", F7, exec, brightnessctl set 5%-"
        
        # F8: Brightness up
        ", XF86MonBrightnessUp, exec, brightnessctl set 5%+"
        ", F8, exec, brightnessctl set 5%+"
      ];
      
      # Input configuration
      input = {
        kb_layout = "us";
        kb_options = "ctrl:nocaps,altwin:swap_lalt_lwin";
        follow_mouse = 1;
        touchpad = {
          natural_scroll = true;
          disable_while_typing = true;
          tap-to-click = true;
        };
        sensitivity = 0; # -1.0 - 1.0, 0 means no modification
        repeat_rate = 33;
        repeat_delay = 225;
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
        force_split = 2;
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
        "XCURSOR_SIZE,32"      # Larger cursor for better visibility
        "HYPRCURSOR_SIZE,32"   # Larger Hyprland cursor
      ];
      
      # Window rules
      windowrulev2 = [
        # Floating windows with better default sizes
        "float, class:^(pavucontrol)$"
        "size 600 400, class:^(pavucontrol)$"
        "float, class:^(nm-applet)$"
        "float, class:^(blueman-manager)$"
        "size 700 500, class:^(blueman-manager)$"
        "float, class:^(org.kde.polkit-kde-authentication-agent-1)$"
        
        # Better default sizes for common applications
        "size 1200 800, class:^(google-chrome)$"
        "size 1000 700, class:^(firefox)$"
        "size 1100 750, class:^(nautilus)$"
        "size 900 600, class:^(kitty)$"
        "size 800 500, class:^(wezterm)$"
        
        # Maximize certain applications by default
        "maximize, class:^(code|codium)$"
        "maximize, class:^(obsidian)$"
        
        # Picture-in-picture windows
        "float, title:^(Picture-in-Picture)$"
        "pin, title:^(Picture-in-Picture)$"
        "size 400 225, title:^(Picture-in-Picture)$"
        "move 1520 855, title:^(Picture-in-Picture)$"  # Bottom right corner
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
        "hyprpaper -c ~/.dotfiles/home-manager/configs/hyprpaper.conf"
        "hypridle"
        "nm-applet"
        # Set cursor theme with larger size
        "hyprctl setcursor rose-pine-hyprcursor 32"
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
