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
        "$mod, Return, exec, kitty"
        "$mod, D, exec, wofi --show drun"
        "$mod, Q, killactive"
        "$mod SHIFT, E, exit"
        
        # Window management - matching AeroSpace
        "$mod SHIFT, F, fullscreen"  # cmd-shift-f -> super-shift-f
        "$mod, Space, togglefloating"  # Keep existing floating toggle
        
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
        
        # Mode entries - matching AeroSpace modes
        "$mod SHIFT, semicolon, submap, service"  # cmd-shift-semicolon -> service mode
        "$mod SHIFT, R, submap, resize"  # cmd-shift-r -> resize mode
        
        # Workspace back-and-forth - matching AeroSpace cmd-tab
        "$mod, Tab, workspace, previous"
        
        # Move workspace to next monitor - matching AeroSpace cmd-shift-tab  
        "$mod SHIFT, Tab, moveworkspacetomonitor, current +1"
        
        # Screenshot (keeping existing)
        ", Print, exec, grim -g \"$(slurp)\" - | wl-copy"
        "$mod, Print, exec, grim - | wl-copy"
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
      ) ++ [
        # Global emergency submap reset - always available
        "SUPER SHIFT CTRL, Escape, submap, "
      ];
      
      # Configure workspace back-and-forth behavior
      binds = {
        workspace_back_and_forth = true;
      };
      
      # Service mode submap - matching AeroSpace service mode
      submap = {
        "service" = {
          bind = [
            # Multiple ways to exit the submap for safety
            ", escape, submap, "
            "SUPER, escape, submap, "
            "CTRL, c, submap, "
            "SUPER SHIFT, semicolon, submap, "  # Same key that enters
            
            # Reset layout and exit - matching AeroSpace 'r' in service mode
            ", r, layoutmsg, orientationleft"
            ", r, submap, "
            
            # Toggle floating/tiling and exit - matching AeroSpace 'f' in service mode
            ", f, togglefloating"
            ", f, submap, "
            
            # Close all but current and exit - matching AeroSpace 'backspace' in service mode
            ", backspace, exec, hyprctl clients -j | jq -r '.[] | select(.workspace.name == \"'$(hyprctl activewindow -j | jq -r .workspace.name)'\") | select(.address != \"'$(hyprctl activewindow -j | jq -r .address)'\") | .address' | xargs -I {} hyprctl dispatch closewindow address:{}"
            ", backspace, submap, "
            
            # Join with directions and exit - matching AeroSpace cmd-shift-h/j/k/l in service mode
            ", h, layoutmsg, swapprev"
            ", h, submap, "
            ", j, layoutmsg, swapnext"
            ", j, submap, "
            ", k, layoutmsg, swapprev"
            ", k, submap, "
            ", l, layoutmsg, swapnext"
            ", l, submap, "
            
            # Catch-all bind to reset if any other key is pressed
            "catchall, submap, "
          ];
        };
        
        # Resize mode submap - matching AeroSpace resize mode
        "resize" = {
          # Resize mode bindings (using binde for repeat functionality)
          binde = [
            # Resize directions - matching AeroSpace h/j/k/l in resize mode
            ", h, resizeactive, -50 0"
            ", l, resizeactive, 50 0"
            ", k, resizeactive, 0 -50"
            ", j, resizeactive, 0 50"
          ];
          
          bind = [
            # Multiple ways to exit the submap for safety
            ", escape, submap, "
            "SUPER, escape, submap, "
            "CTRL, c, submap, "
            "SUPER SHIFT, R, submap, "  # Same key that enters
            
            # Balance sizes and exit - matching AeroSpace 'b' in resize mode
            ", b, layoutmsg, orientationcycle"
            ", b, submap, "
            
            # Smart resize and exit - matching AeroSpace minus/equal in resize mode
            ", minus, resizeactive, -50 -50"
            ", minus, submap, "
            ", equal, resizeactive, 50 50"
            ", equal, submap, "
            
            # Exit resize mode - matching AeroSpace enter in resize mode
            ", Return, submap, "
            
            # Catch-all bind to reset if any other key is pressed
            "catchall, submap, "
          ];
        };
        
        # Reset submap (required)
        "reset" = {};
      };
      
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