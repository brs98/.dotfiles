{ pkgs, ... }: {
  home.packages = with pkgs; [
    # Linux-specific packages
    gcc
    corepack
    
    # Media control utilities
    playerctl          # Media player control
    pamixer            # Audio control for PipeWire/PulseAudio
    brightnessctl      # Screen brightness control
    
    # System utilities
    networkmanagerapplet  # Network management GUI
    blueman            # Bluetooth management
  ];
}