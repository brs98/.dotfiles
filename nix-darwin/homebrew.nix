{...}: {
  homebrew = {
    enable = true;
    brews = [
      "gnu-sed"
      "nixpacks"
      "freetds"
      "libpq"
      "libyaml"
      "mise"
      "bazel"
      "bazelisk"
      "tailscale"
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
      "orbstack" # Docker management
      "zen-browser" # Alternative browser
      "cursor" # AI code editor
      "claude" # Anthropic AI assistant
      "claude-code" # Anthropic AI coding assistant
      "figma" # Design tool
      "spotify" # Music streaming
    ];
  };
}
