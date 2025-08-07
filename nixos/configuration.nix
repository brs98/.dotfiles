# Edit this configuration file to define what should be installed on
# your system.  Help is available in the configuration.nix(5) man page
# and in the NixOS manual (accessible by running ‘nixos-help’).

{ config, lib, pkgs, inputs, ... }:

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
		brandon = import ../home-manager/systems/linux.nix;
	};
  };

  # Bootloader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

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
    
    # Configure keymap in X11
    xkb = {
      layout = "us";
      options = "ctrl:nocaps";
      variant = "";
    };
  };

  # Enable display manager (moved from services.xserver.displayManager.gdm)
  services.displayManager.gdm = {
    enable = true;
    wayland = true;
  };

  # Enable flakes
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

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
  users.users.brandon = with pkgs; {
    isNormalUser = true;
    description = "Brandon";
    shell = pkgs.zsh;
    extraGroups = [ "networkmanager" "wheel" "docker" ];
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
    home = "/home/brandon";
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
    xwayland.enable = true;
  };

  programs.sway.enable = true;

  environment.sessionVariables = {
    # If your cursor becomes invisible
    WLR_NO_HARDWARE_CURSORS = "1";
    # Hint electron apps to use wayland
    NIXOS_OZONE_WL = "1";
    BROWSER = "google-chrome";
    
    # High-DPI scaling for 2.8K display
    GDK_SCALE = "1.5";
    QT_SCALE_FACTOR = "1.5";
    XCURSOR_SIZE = "24";
  };

  # === Framework Laptop 13 (AMD Ryzen 7 7840U) Hardware Configuration ===
  hardware = {
    # Enable redistributable firmware (important for MediaTek RZ616 WiFi 6E, etc.)
    enableRedistributableFirmware = true;
    firmware = [ pkgs.linux-firmware ];
    
    # AMD CPU microcode updates
    cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
    
    # Graphics configuration for AMD Radeon 780M
    graphics = {
      enable = true;
      enable32Bit = true;
      extraPackages = with pkgs; [
        # AMD RDNA 3 (Radeon 780M) support
        mesa
        rocmPackages.clr.icd
        amdvlk  # AMD Vulkan driver
        libva
        libva-utils
      ];
    };
  };

  # Framework-specific wake-on-AC prevention using udev rule
  # Prevents the laptop from waking up when AC is plugged/unplugged
  services.udev.extraRules = ''
    # Framework Laptop 13 AMD: Prevent wake on AC adapter events
    SUBSYSTEM=="power_supply", KERNEL=="ADP*", RUN+="${pkgs.systemd}/bin/systemctl --no-block start prevent-ac-wakeup.service"
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

  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland pkgs.xdg-desktop-portal-wlr pkgs.xdg-desktop-portal-gtk];
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
    xdg-desktop-portal
    libsForQt5.kdenlive

    spotify
    playerctl
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
