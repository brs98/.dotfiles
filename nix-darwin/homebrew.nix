{...}: {
  homebrew = {
    enable = true;
    brews = [
      "gnu-sed"
      "nixpacks"
    ];
    casks = [
      "dbeaver-community" # SQL GUI
      "maccy" # Clipboard manager
      "font-hack-nerd-font" # Nerd font
      "ngrok" # Tunneling
      "postman" # API testing
      "obs" # Screen recording
      "wezterm" # Terminal
      "slack" # Communication
      "linear-linear" # Project management
      "nikitabobko/tap/aerospace" # Window management
      "1password" # Password manager
    ];
  };
}
