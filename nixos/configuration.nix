# Edit this configuration file to define what should be installed on
# your system.  Help is available in the configuration.nix(5) man page
# and in the NixOS manual (accessible by running ‘nixos-help’).

{ config, lib, pkgs, inputs, ... }:
let
  # Get the current user dynamically
  currentUser = builtins.getEnv "USER";
  # Fallback to "nixos" if USER environment variable is not set
  userName = if currentUser != "" then currentUser else "nixos";
in
{
  imports =
    [ # Include the results of the hardware scan.
      ./hardware-configuration.nix
	inputs.home-manager.nixosModules.home-manager
    ];

  home-manager = {
  	backupFileExtension = "backup";
      useGlobalPkgs = true;
  useUserPackages = true;
  	extraSpecialArgs = { inherit inputs; };
	users = {
		${userName} = import ../home-manager/systems/linux.nix;
	};
  };

  # Bootloader with debugging support
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  
  # Early boot debugging (remove after fixing display issues)
  boot.loader.systemd-boot.consoleMode = "auto";
  boot.consoleLogLevel = 7;  # Show all kernel messages
  boot.initrd.systemd.enable = true;  # Modern init system

  networking.hostName = "framework"; # Framework Laptop 13 AMD
  # networking.wireless.enable = true;  # Enables wireless support via wpa_supplicant.

  # Configure network proxy if necessary
  # networking.proxy.default = "http://user:password@proxy:port/";
  # networking.proxy.noProxy = "127.0.0.1,localhost,internal.domain";

  # Enable networking with WiFi optimizations
  networking = {
    networkmanager.enable = true;
    # Enable WiFi 6E features for MediaTek RZ616
    networkmanager.wifi.powersave = false;  # Better performance, slight battery impact
  };

  # Set your time zone.
  time.timeZone = "America/Denver";

  # Select internationalisation properties.
  i18n.defaultLocale = "en_US.UTF-8";

  i18n.extraLocaleSettings = {
    LC_ADDRESS = "en_US.UTF-8";
    LC_IDENTIFICATION = "en_US.UTF-8";
    LC_MEASUREMENT = "en_US.UTF-8";
    LC_MONETARY = "en_US.UTF-8";
    LC_NAME = "en_US.UTF-8";
    LC_NUMERIC = "en_US.UTF-8";
    LC_PAPER = "en_US.UTF-8";
    LC_TELEPHONE = "en_US.UTF-8";
    LC_TIME = "en_US.UTF-8";
  };

  # Enable the X11 windowing system with AMD drivers
  services.xserver = {
    enable = true;
    videoDrivers = [ "amdgpu" ];
    dpi = 180;  # High-DPI support for 2.8K display
    
    # Better mouse and touchpad configuration for X11 apps
    libinput = {
      enable = true;
      mouse = {
        accelProfile = "adaptive";  # Smooth mouse acceleration
        accelSpeed = "0.2";         # Slightly faster mouse
      };
      touchpad = {
        accelProfile = "adaptive";
        accelSpeed = "0.3";
        naturalScrolling = true;
        tapping = true;
        disableWhileTyping = true;
      };
    };
    
    # Import display manager variables for consistent scaling
    displayManager.importedVariables = [
      "GDK_SCALE"
      "GDK_DPI_SCALE"
      "QT_SCALE_FACTOR"
      "QT_AUTO_SCREEN_SCALE_FACTOR"
    ];
  };

  services.keyd = {
    enable = true;
    keyboards.default = {
      ids = ["*"];
      settings = {
	main = {
	  rightalt = "rightmeta";
	  rightctrl = "rightalt";
	};
      };
    };
  };

  # Enable display manager with fallback options
  services.displayManager.gdm = {
    enable = true;
    wayland = true;
    # Fallback debugging options (uncomment if display doesn't start)
    # debug = true;
    # autoSuspend = false;
  };
  
  # Enable flakes
  nix.settings = {
    experimental-features = [ "nix-command" "flakes" ];
    # Hyprland Cachix for faster builds
    substituters = ["https://hyprland.cachix.org"];
    trusted-public-keys = ["hyprland.cachix.org-1:a7pgxzMz7+chwVL3/pzj6jIBMioiJM7ypFP8PwtkuGc="];
  };

  # Power management settings for laptop
  powerManagement = {
    enable = true;
    cpuFreqGovernor = "powersave";  # Better battery life
  };

  # Modern power profiles daemon
  services.power-profiles-daemon.enable = true;

  # Thermal management
  services.thermald.enable = true;

  # Enable CUPS to print documents.
  services.printing.enable = true;

  # Enable firmware updates
  services.fwupd.enable = true;

  # Enable brightness control
  programs.light.enable = true;

  # Enable Bluetooth for media control
  hardware.bluetooth = {
    enable = true;
    powerOnBoot = true;
  };
  services.blueman.enable = true;

  # Enable sound with pipewire.
  # hardware.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    jack.enable = true;
    
    # Framework-specific audio tweaks
    wireplumber.enable = true;
  };

  # Enable touchpad support (enabled default in most desktopManager).
  # services.xserver.libinput.enable = true;

  services.flatpak.enable = true;

  # Define a user account. Don't forget to set a password with ‘passwd’.
  users.users.${userName} = with pkgs; {
    isNormalUser = true;
    description = userName;
    shell = pkgs.zsh;
    extraGroups = [ "networkmanager" "wheel" "docker" "video" "audio" ];
    packages = [
    #  thunderbird
    	gh
	git
	neovim
	google-chrome
	(google-chrome.override {
	    commandLineArgs = [
	      "--enable-features=UseOzonePlatform"
	      "--ozone-platform=wayland"
	    ];
	  })
	networkmanagerapplet
	killall
	wine
	pavucontrol
	alsa-utils
	pulseaudio  # For pactl commands
	nerd-fonts.hack
    ];
    home = "/home/${userName}";
  };

  # theme
  catppuccin = {
    enable = true;
    flavor = "mocha";
  };

  programs.zsh.enable = true;

  # Install firefox.
  programs.firefox.enable = true;

  programs.hyprland = {
    enable = true;
    # Use the flake package for latest features and better compatibility
    package = inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.hyprland;
    # Ensure portal package is synchronized with Hyprland version
    portalPackage = inputs.hyprland.packages.${pkgs.stdenv.hostPlatform.system}.xdg-desktop-portal-hyprland;
    xwayland.enable = true;
  };

  environment.sessionVariables = {
    # If your cursor becomes invisible
    WLR_NO_HARDWARE_CURSORS = "1";
    # Hint electron apps to use wayland
    NIXOS_OZONE_WL = "1";
    BROWSER = "google-chrome";
    
    # High-DPI scaling for 2.8K display - improved settings
    GDK_SCALE = "1.5";
    GDK_DPI_SCALE = "0.75";  # Compensate for larger GDK_SCALE
    QT_SCALE_FACTOR = "1.5";
    QT_AUTO_SCREEN_SCALE_FACTOR = "1";
    XCURSOR_SIZE = "32";     # Larger cursor for better visibility
    HYPRCURSOR_SIZE = "32";  # Hyprland cursor size
    
    # Font scaling improvements
    QT_FONT_DPI = "144";     # Better font rendering for Qt apps
    WINIT_X11_SCALE_FACTOR = "1.5";  # Rust apps scaling
    
    # Java applications DPI scaling
    _JAVA_OPTIONS = "-Dsun.java2d.uiScale=1.5 -Dawt.useSystemAAFontSettings=on";
  };

  # === Framework Laptop 13 (AMD Ryzen 7 7840U) Hardware Configuration ===
  hardware = {
    # Enable redistributable firmware (important for MediaTek RZ616 WiFi 6E, etc.)
    enableRedistributableFirmware = true;
    firmware = with pkgs; [ 
      linux-firmware  # System firmware for AMD GPU and other components
    ];
    
    # AMD CPU microcode updates
    cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
    
    # Graphics configuration for AMD Radeon 780M (RDNA 3)
    graphics = {
      enable = true;
      enable32Bit = true;
      extraPackages = with pkgs; [
        # AMD RDNA 3 (Radeon 780M) support
        mesa
        rocmPackages.clr.icd
        amdvlk                    # AMD Vulkan driver
        driversi686Linux.amdvlk   # 32-bit Vulkan support
        libva
        libva-utils
        libva-vdpau-driver
        vaapiVdpau
        # Additional video acceleration
        libvdpau-va-gl
      ];
      extraPackages32 = with pkgs.driversi686Linux; [
        mesa
        amdvlk
      ];
    };
  };

  # Framework-specific wake-on-AC prevention using udev rule
  # Prevents the laptop from waking up when AC is plugged/unplugged
  services.udev.extraRules = ''
    # Framework Laptop 13 AMD: Prevent wake on AC adapter events
    SUBSYSTEM=="power_supply", KERNEL=="ADP*", RUN+="${pkgs.systemd}/bin/systemctl --no-block start prevent-ac-wakeup.service"
    
    # Backlight permissions for brightness control
    ACTION=="add", SUBSYSTEM=="backlight", RUN+="${pkgs.coreutils}/bin/chmod 666 /sys/class/backlight/%k/brightness"
    ACTION=="add", SUBSYSTEM=="leds", RUN+="${pkgs.coreutils}/bin/chmod 666 /sys/class/leds/%k/brightness"
  '';

  # Service to disable AC adapter as a wakeup source
  systemd.services.prevent-ac-wakeup = {
    description = "Prevent AC adapter from waking the system";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${pkgs.bash}/bin/bash -c 'echo disabled > /sys/class/power_supply/ADP*/device/power/wakeup 2>/dev/null || true'";
    };
  };

  xdg.autostart.enable = true;

  # XDG Desktop Portal configuration for Hyprland
  # Note: programs.hyprland.enable automatically sets up xdg-desktop-portal-hyprland
  # We only need to add additional portals here
  xdg.portal = {
    enable = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-gtk  # For GTK file picker and other GTK integration
    ];
    # Configure portal preferences
    config.common.default = "*";
    config.hyprland.default = [
      "hyprland"
      "gtk"
    ];
  };

  # Allow unfree packages
  nixpkgs.config.allowUnfree = true;

  # List packages installed in system profile. To search, run:
  # $ nix search wget
  environment.systemPackages = with pkgs; [
    neovim
    xclip
    unzip
    nautilus
    waybar
    (pkgs.waybar.overrideAttrs (oldAttrs: {
      mesonFlags = oldAttrs.mesonFlags ++ [ "-Dexperimental=true" ];
      })
    )
    mako
    libnotify

    # cursor
    inputs.rose-pine-hyprcursor.packages.${pkgs.system}.default

    # screenshot
    slurp

    # clipboard
    wl-clipboard

    hyprlock
    hyprpaper
    hypridle

    wlogout

    kitty
    wofi

    # OBS Studio wrapping in unstable channel
    (pkgs.wrapOBS {
      plugins = with pkgs.obs-studio-plugins; [
	wlrobs
	obs-backgroundremoval
	obs-pipewire-audio-capture
      ];
     })
    libsForQt5.kdenlive

    spotify
    playerctl

    # Media and system control utilities
    brightnessctl      # Modern brightness control
    light              # Alternative brightness control
    pamixer            # PulseAudio/PipeWire volume control  
    wireplumber        # PipeWire session manager
    
    # Screenshot and notification tools
    libnotify          # Desktop notifications
  ];

  virtualisation.docker.enable = true;

  # Some programs need SUID wrappers, can be configured further or are
  # started in user sessions.
  # programs.mtr.enable = true;
  # programs.gnupg.agent = {
  #   enable = true;
  #   enableSSHSupport = true;
  # };

  # List services that you want to enable:

  # Enable the OpenSSH daemon.
  # services.openssh.enable = true;

  # Open ports in the firewall.
  # networking.firewall.allowedTCPPorts = [ ... ];
  # networking.firewall.allowedUDPPorts = [ ... ];
  # Or disable the firewall altogether.
  # networking.firewall.enable = false;

  # This value determines the NixOS release from which the default
  # settings for stateful data, like file locations and database versions
  # on your system were taken. It‘s perfectly fine and recommended to leave
  # this value at the release version of the first install of this system.
  # Before changing this value read the documentation for this option
  # (e.g. man configuration.nix or on https://nixos.org/nixos/options.html).
  system.stateVersion = "24.05"; # Did you read the comment?

}
