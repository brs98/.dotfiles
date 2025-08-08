# macOS System Defaults Configuration
# This module configures various macOS system preferences using nix-darwin
{ config, lib, pkgs, ... }:

{
  system.defaults = {
    # Dock Settings
    dock = {
      autohide = true;                    # Auto-hide the dock
      autohide-delay = 0.0;              # Remove auto-hide delay
      autohide-time-modifier = 0.0;      # Remove auto-hide animation time
      
      # Window tiling (macOS Sequoia and later)
      wvous-br-corner = 14;              # Hot corner: bottom-right displays Notification Center
      
      # Dock size and behavior
      tilesize = 48;                     # Icon size
      magnification = false;             # Disable magnification
      mineffect = "genie";               # Minimize effect
      orientation = "bottom";            # Dock position
      show-recents = false;              # Don't show recent applications
    };

    # Finder Settings
    finder = {
      # File visibility
      AppleShowAllExtensions = true;     # Show all file extensions
      AppleShowAllFiles = true;          # Show hidden files
      ShowStatusBar = true;              # Show status bar
      ShowPathbar = true;                # Show path bar
      
      # New window settings
      NewWindowTarget = "Recents";       # New windows open to "Recents" (equivalent to "All My Files")
      
      # Search settings
      FXDefaultSearchScope = "SCcf";     # Search current folder by default
      
      # View settings
      FXPreferredViewStyle = "Nlsv";     # Default to list view
      
      # Disable warnings
      FXEnableExtensionChangeWarning = false;  # Don't warn about file extension changes
      
      # Desktop settings
      CreateDesktop = true;              # Show desktop
      ShowExternalHardDrivesOnDesktop = true;   # Show external drives on desktop
      ShowHardDrivesOnDesktop = false;   # Don't show hard drives on desktop
      ShowMountedServersOnDesktop = false; # Don't show mounted servers on desktop
      ShowRemovableMediaOnDesktop = true;  # Show removable media on desktop
      
      # Other settings
      QuitMenuItem = true;               # Enable "Quit Finder" menu item
    };

    # Global macOS Settings (NSGlobalDomain)
    NSGlobalDomain = {
      # Interface and appearance
      AppleInterfaceStyle = "Dark";      # Use dark mode
      _HIHideMenuBar = true;            # Auto-hide menu bar (for SketchyBar)
      
      # Keyboard settings
      InitialKeyRepeat = 15;             # Initial key repeat delay (225ms)
      KeyRepeat = 2;                     # Key repeat rate (30ms)
      ApplePressAndHoldEnabled = false;  # Disable press-and-hold for accent characters
      
      # Text and input settings
      NSAutomaticCapitalizationEnabled = false;    # Disable automatic capitalization
      NSAutomaticDashSubstitutionEnabled = false;  # Disable smart dashes
      NSAutomaticPeriodSubstitutionEnabled = false; # Disable automatic period substitution
      NSAutomaticQuoteSubstitutionEnabled = false; # Disable smart quotes
      NSAutomaticSpellingCorrectionEnabled = false; # Disable auto-correct
      NSAutomaticInlinePredictionEnabled = false;   # Disable inline predictions
      
      # Window and animation settings
      NSWindowResizeTime = 0.01;         # Fast window resize animations
      NSAutomaticWindowAnimationsEnabled = true; # Keep window animations
      AppleWindowTabbingMode = "always"; # Always prefer tabs when opening new windows
      
      # Scroll and mouse settings
      AppleScrollerPagingBehavior = true;       # Jump to spot that's clicked on scroll bar
      AppleEnableSwipeNavigateWithScrolls = true; # Enable swipe navigation
      
      # File handling
      AppleShowAllExtensions = true;     # Show all file extensions globally
      AppleShowAllFiles = true;          # Show hidden files globally
      
      # Other interface settings
      AppleShowScrollBars = "Always";          # Always show scroll bars
      NSTableViewDefaultSizeMode = 2;          # Medium table row height
      
      # Printing defaults
      PMPrintingExpandedStateForPrint = true;   # Expand print panel by default
      PMPrintingExpandedStateForPrint2 = true;  # Expand print panel by default (alternative)
      
      # Save panel defaults
      NSNavPanelExpandedStateForSaveMode = true;  # Expand save panel by default
      NSNavPanelExpandedStateForSaveMode2 = true; # Expand save panel by default (mode 2)
      
      # Document handling
      NSDocumentSaveNewDocumentsToCloud = false; # Don't default to saving to iCloud
      
      # Animations and effects
      NSScrollAnimationEnabled = true;          # Enable smooth scrolling
      NSUseAnimatedFocusRing = false;          # Disable animated focus ring
      
      # System behavior
      NSDisableAutomaticTermination = true;    # Disable automatic app termination
    };

    # Universal Access (Accessibility) - Improved cursor settings
    # universalaccess = {
    #   reduceMotion = false;              # Don't reduce motion (can be enabled if needed)
    #   reduceTransparency = false;        # Don't reduce transparency
    #   mouseDriverCursorSize = 1.5;       # Larger cursor size for better visibility
    #   closeViewScrollWheelToggle = false; # Don't use scroll wheel for zoom
    # };

    # Screen Capture Settings
    screencapture = {
      location = "~/Desktop";            # Save screenshots to Desktop
      type = "png";                      # Screenshot format
      disable-shadow = false;            # Include shadows in window screenshots
      show-thumbnail = true;             # Show thumbnail after capture
    };

    # Screen Saver Settings
    screensaver = {
      askForPassword = true;             # Require password after screensaver
      askForPasswordDelay = 5;           # Delay before password required (seconds)
    };

    # Activity Monitor Settings
    ActivityMonitor = {
      IconType = 3;                      # Show CPU usage in dock icon
      ShowCategory = 103;                # Show "My Processes" by default
      SortColumn = "CPUUsage";           # Sort by CPU usage
      SortDirection = 0;                 # Descending order
      OpenMainWindow = true;             # Show main window when launching
    };

    # Window Manager (macOS Sequoia and later)
    WindowManager = {
      EnableStandardClickToShowDesktop = false;  # Disable click wallpaper to reveal desktop
      StandardHideDesktopIcons = false;          # Show desktop icons
      HideDesktop = false;                       # Don't hide desktop
      StageManagerHideWidgets = false;           # Show widgets in Stage Manager
      StandardHideWidgets = false;               # Show widgets normally
      EnableTilingByEdgeDrag = true;             # Enable window tiling by edge drag
      EnableTopTilingByEdgeDrag = true;          # Enable top edge tiling
      EnableTilingOptionAccelerator = true;      # Enable tiling accelerator
      GloballyEnabled = false;                   # Window management globally disabled by default
    };

    # Control Center (Menu Bar Items)
    controlcenter = {
      BatteryShowPercentage = true;      # Show battery percentage
      Bluetooth = true;                  # Show Bluetooth in menu bar
      Sound = true;                      # Show sound in menu bar
      Display = true;                    # Show display brightness in menu bar
      FocusModes = true;                 # Show Focus modes in menu bar
      AirDrop = true;                    # Show AirDrop in Control Center
    };

    # Custom User Settings (for options not directly supported)
    CustomUserPreferences = {
      # Finder advanced settings
      "com.apple.finder" = {
        _FXSortFoldersFirst = true;                # Sort folders first
        _FXSortFoldersFirstOnDesktop = false;      # Don't sort folders first on desktop
        FXRemoveOldTrashItems = false;             # Don't auto-delete trash items
        _FXShowPosixPathInTitle = true;            # Show full POSIX path in title
      };

      # Global domain settings not covered above
      "NSGlobalDomain" = {
        AppleFontSmoothing = 2;                    # Font smoothing (1 = light, 2 = medium, 3 = strong) - improved readability
        AppleAntiAliasingThreshold = 4;            # Anti-aliasing threshold
        AppleMenuBarVisibleInFullscreen = false;   # Hide menu bar in full screen
        NSTextShowsControlCharacters = false;      # Don't show control characters
        "com.apple.swipescrolldirection" = false; # Natural scrolling (false = traditional)
        "com.apple.trackpad.forceClick" = true;   # Enable force click
        "com.apple.sound.beep.flash" = false;     # Disable visual bell
        "com.apple.springing.enabled" = true;     # Enable spring loading for directories
        "com.apple.springing.delay" = 0.5;        # Spring loading delay
        # Mouse and trackpad improvements
        "com.apple.mouse.doubleClickThreshold" = 0.5;  # Faster double-click
        "com.apple.trackpad.scaling" = 2.0;            # Faster trackpad tracking speed
        "com.apple.mouse.scaling" = 2.0;               # Faster mouse tracking speed
      };

      # HIToolbox settings
      "com.apple.HIToolbox" = {
        AppleFnUsageType = 2;                      # F1-F12 keys require Fn for special functions
      };
      
      # Screen capture settings
      "com.apple.screencapture" = {
        target = "file";                           # Save to file instead of clipboard
      };

      # Terminal app defaults - bigger font and window
      "com.apple.Terminal" = {
        "Window Settings" = {
          "Basic" = {
            "Font" = "Hack Nerd Font Mono 14";
            "columnCount" = 120;
            "rowCount" = 40;
          };
        };
      };

      # System-wide window sizing preferences
      "com.apple.systempreferences" = {
        AppleShowAllViewModes = true;              # Show all view modes in preferences
        NSWindowDefaultWidth = 1000;               # Default window width
        NSWindowDefaultHeight = 700;               # Default window height
      };
    };
  };

  # Additional system settings that aren't part of system.defaults
  system.keyboard = {
    enableKeyMapping = true;
    remapCapsLockToControl = false;  # Set to true if you want Caps Lock as Control
  };

  # Disable startup chime
  system.startup.chime = false;
}
