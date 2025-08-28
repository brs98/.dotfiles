{ pkgs, ... }: {
  home.packages = with pkgs; [
    # Development tools
    go
    gnused
    htop
    wget
    typescript
    lazydocker
    gnumake
    rustup
    tree
    trunk
    bun
    
    # Node.js ecosystem  
    nodejs_22
    nodePackages.typescript-language-server
    nodePackages.ts-node
    nodePackages.dotenv-cli
    nodePackages.vercel
  ];

  programs = {
    home-manager.enable = true;
    gpg.enable = true;
    ripgrep.enable = true;
    jq.enable = true;
  };
}
