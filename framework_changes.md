# Framework Laptop 13 (AMD) Configuration Changes

This document outlines the specific changes needed for proper NixOS configuration on a Framework Laptop 13 with AMD Ryzen 7 7840U processor.

## Hardware Specifications

- **Model**: Framework Laptop 13 inch
- **CPU**: AMD Ryzen™ 7 7840U (Zen 4 architecture)
- **GPU**: AMD Radeon 780M integrated graphics (RDNA 3)
- **Display**: 2.8K resolution display
- **Memory**: DDR5-5600 - 64GB (2 x 32GB)
- **Storage**: WD_BLACK™ SN850X NVMe™ M.2 2280 - 4TB
- **WiFi**: MediaTek RZ616 WiFi 6E

## Critical Configuration Issues Fixed

### 1. Wrong GPU Driver Configuration

**Problem**: Configuration had NVIDIA settings for an AMD system
```nix
# INCORRECT - was in original config
hardware = {
  nvidia.modesetting.enable = true;  # Wrong for AMD system!
};
```

**Solution**: Replace with AMD-specific graphics configuration
```nix
hardware = {
  graphics = {
    enable = true;
    enable32Bit = true;
    extraPackages = with pkgs; [
      # AMD RDNA 3 (Radeon 780M) support
      mesa
      rocm-opencl-icd
      rocm-opencl-runtime
      amdvlk  # AMD Vulkan driver
    ];
  };
};
```

### 2. X11 Services Disabled

**Problem**: X11 server was completely disabled
```nix
# services.xserver.enable = true;  # This was commented out!
```

**Solution**: Enable X11 services with AMD drivers
```nix
services.xserver = {
  enable = true;  # CRITICAL: Must be enabled
  videoDrivers = [ "amdgpu" ];  # Use AMD drivers, not NVIDIA
  
  displayManager.gdm = {
    enable = true;
    wayland = true;
  };
  
  # Configure keymap
  xkb = {
    layout = "us";
    options = "ctrl:nocaps";
    variant = "";
  };
};
```

## Framework-Specific Optimizations

### 1. Framework Hardware Support

Add Framework-specific hardware optimizations:

```nix
hardware = {
  # Enable redistributable firmware (important for WiFi, etc.)
  enableRedistributableFirmware = true;
  
  # Framework 13 AMD-specific fixes
  framework.amd-7040.preventWakeOnAC = true;
  
  # AMD CPU microcode updates
  cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
  
  graphics = {
    enable = true;
    enable32Bit = true;
    extraPackages = with pkgs; [
      mesa
      rocm-opencl-icd
      rocm-opencl-runtime
      amdvlk
      # Additional packages for Framework AMD graphics
      libva
      libva-utils
    ];
  };
};
```

### 2. Power Management for Laptop

Optimize power management for mobile use:

```nix
# Power management settings
powerManagement = {
  enable = true;
  cpuFreqGovernor = "powersave";  # Better battery life
};

# Modern power profiles daemon
services.power-profiles-daemon.enable = true;

# Thermal management
services.thermald.enable = true;
```

### 3. High-DPI Display Support

Configure proper scaling for the 2.8K display:

```nix
# Environment variables for high-DPI support
environment.sessionVariables = {
  # Existing variables...
  WLR_NO_HARDWARE_CURSORS = "1";
  NIXOS_OZONE_WL = "1";
  BROWSER = "google-chrome";
  
  # High-DPI scaling for 2.8K display
  GDK_SCALE = "1.5";
  QT_SCALE_FACTOR = "1.5";
  XCURSOR_SIZE = "24";
};

# X11 DPI settings
services.xserver = {
  enable = true;
  videoDrivers = [ "amdgpu" ];
  dpi = 180;  # Adjust based on preference (120, 144, 180, 192)
  
  displayManager.gdm = {
    enable = true;
    wayland = true;
  };
};
```

### 4. WiFi Configuration

MediaTek RZ616 WiFi 6E support:

```nix
# WiFi driver support (usually automatic, but ensure firmware is available)
hardware = {
  enableRedistributableFirmware = true;
  firmware = [ pkgs.linux-firmware ];
};

# Network management
networking = {
  networkmanager.enable = true;
  # Enable WiFi 6E features
  networkmanager.wifi.powersave = false;  # Better performance, slight battery impact
};
```

### 5. Audio Configuration

Ensure proper audio support for Framework speakers/microphone:

```nix
# Audio with PipeWire (already in config, but ensure these settings)
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

# Additional audio packages
environment.systemPackages = with pkgs; [
  # Existing packages...
  pavucontrol
  alsa-utils
  pulseaudio  # For pactl commands
];
```

### 6. Kernel Parameters

Add kernel parameters optimized for Framework AMD:

```nix
boot = {
  # Existing bootloader config...
  loader.systemd-boot.enable = true;
  loader.efi.canTouchEfiVariables = true;
  
  # Kernel parameters for Framework AMD
  kernelParams = [
    "amd_pstate=guided"  # Better AMD CPU power management
    "amdgpu.dc=1"        # Enable Display Core for better graphics
  ];
  
  # Kernel modules
  kernelModules = [ "kvm-amd" ];
  initrd.availableKernelModules = [ 
    "nvme" 
    "xhci_pci" 
    "thunderbolt" 
    "usb_storage" 
    "usbhid" 
    "sd_mod" 
    "amdgpu"  # Ensure AMD GPU module is available early
  ];
};
```

## Complete Updated Hardware Configuration

Here's the complete hardware section with all Framework optimizations:

```nix
{ config, lib, pkgs, modulesPath, ... }:

{
  imports = [ (modulesPath + "/installer/scan/not-detected.nix") ];

  # Boot configuration
  boot = {
    initrd.availableKernelModules = [ 
      "nvme" "xhci_pci" "thunderbolt" "usb_storage" "usbhid" "sd_mod" "amdgpu" 
    ];
    initrd.kernelModules = [ ];
    kernelModules = [ "kvm-amd" ];
    extraModulePackages = [ ];
    
    # Framework AMD optimizations
    kernelParams = [
      "amd_pstate=guided"
      "amdgpu.dc=1"
    ];
  };

  # Hardware support
  hardware = {
    enableRedistributableFirmware = true;
    firmware = [ pkgs.linux-firmware ];
    
    # Framework 13 AMD-specific
    framework.amd-7040.preventWakeOnAC = true;
    
    # AMD CPU support
    cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
    
    # Graphics configuration for Radeon 780M
    graphics = {
      enable = true;
      enable32Bit = true;
      extraPackages = with pkgs; [
        mesa
        rocm-opencl-icd
        rocm-opencl-runtime
        amdvlk
        libva
        libva-utils
      ];
    };
  };

  # Power management
  powerManagement = {
    enable = true;
    cpuFreqGovernor = "powersave";
  };
  
  services.power-profiles-daemon.enable = true;
  services.thermald.enable = true;

  # Filesystem configuration (from hardware-configuration.nix)
  fileSystems."/" = {
    device = "/dev/disk/by-uuid/a9f83b66-6dbd-4be4-af6e-8cee81a2e732";
    fsType = "ext4";
  };

  fileSystems."/boot" = {
    device = "/dev/disk/by-uuid/7078-4220";
    fsType = "vfat";
    options = [ "fmask=0077" "dmask=0077" ];
  };

  swapDevices = [ ];
  networking.useDHCP = lib.mkDefault true;
  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
}
```

## Troubleshooting

### If Display Still Doesn't Work

1. **Check kernel messages**:
   ```bash
   dmesg | grep -i amd
   dmesg | grep -i drm
   ```

2. **Verify AMD GPU is detected**:
   ```bash
   lspci | grep -i amd
   lspci | grep -i vga
   ```

3. **Check Wayland/X11 logs**:
   ```bash
   journalctl -u display-manager
   ```

### Performance Tuning

For better performance vs. battery life balance:

```nix
# Performance mode (shorter battery life)
powerManagement.cpuFreqGovernor = "performance";

# Or balanced mode
powerManagement.cpuFreqGovernor = "schedutil";
```

## Testing Steps

After applying these changes:

1. **Rebuild configuration**:
   ```bash
   sudo nixos-rebuild switch --flake ~/.dotfiles
   ```

2. **Reboot system**:
   ```bash
   reboot
   ```

3. **Verify graphics are working**:
   ```bash
   glxinfo | grep -i amd
   vainfo  # Check hardware acceleration
   ```

4. **Test Hyprland**:
   - Should be available in GDM session selector
   - Wayland should work properly with amdgpu driver

## Additional Framework Resources

- **Framework Community**: [community.frame.work](https://community.frame.work/)
- **NixOS on Framework**: Check NixOS Hardware database for Framework-specific configs
- **AMD Graphics on Linux**: [AMD GPU documentation](https://wiki.archlinux.org/title/AMDGPU)

---

*Last updated: Based on Framework Laptop 13 AMD Ryzen 7 7840U configuration*