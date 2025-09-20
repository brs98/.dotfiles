{ pkgs, ... }: {
  home.packages = with pkgs; [
    # Development tools
    bun
    gnumake
    gnused
    go
    htop
    lazydocker
    pnpm
    rustup
    tree
    trunk
    typescript
    uv
    wget
    
    # Node.js ecosystem  
    nodePackages.dotenv-cli
    nodePackages.ts-node
    nodePackages.typescript-language-server
    nodePackages.vercel
    nodejs_22
  ];

  programs = {
    gpg.enable = true;
    home-manager.enable = true;
    jq.enable = true;
    ripgrep.enable = true;
  };
}
