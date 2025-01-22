{ inputs, config, pkgs, ... }: let 
  configDir = "${config.home.homeDirectory}/.dotfiles";
  sketchybarDir = "${configDir}/home-manager/config/sketchybar/sketchybarrc";
  aerospaceDirectory = "${configDir}/home-manager/configs/aerospace/aerospace.toml";
in {

imports = [
    ../modules/git.nix
    ../modules/neovim.nix
    ../modules/terminal.nix
];

  home.username = "Brandon";
  home.homeDirectory = "/Users/Brandon";
  home.stateVersion = "23.11";

  home.packages = with pkgs; [
    go
    gnused
    htop
    wget
    sketchybar
    procps
    typescript
    lazydocker

    trunk
    protobuf
    grpcurl
    grpcui

    gnumake

    nodejs_22
    corepack

    (nerdfonts.override { fonts = [ "Hack" ]; })
    rustup
    tree
    nodePackages.typescript-language-server
    nodePackages.ts-node
    nodePackages.dotenv-cli
    nodePackages.vercel
    ];

  home.sessionPath = [
    "/opt/homebrew/bin/"
  ];

  programs = {
    home-manager.enable = true;
    # Git configuration
    git = {
      enable = true;
      userName = "brs98";
      userEmail = "southwick.brandon21@gmail.com";
      aliases = {
        co = "checkout";
        br = "branch";
        st = "status";
        f = "fetch";
        a = "add";
        c = "commit";
        cm = "commit -m";
        p = "push";
      };
      extraConfig = {
        credential = {
          helper = "osxkeychain";
        };
        core = {
          editor = "nvim";
          ignorecase = false;
        };
        pull = {
          rebase = true;
        };
        push = {
          autoSetupRemote = true;
        };
        init = {
          defaultBranch = "main";
        };
        rebase = {
          updateRefs = true;
        };
        delta = {
          navigate = true;
          side-by-side = true;
        };
      };
    };
    # gh configuration
    gh = {
      enable = true;
    };

    gpg = {
      enable = true;
    };

    # lazygit configuration
    lazygit = {
      enable = true;
    };

    # starship configuration (prompt)
    starship = {
      enable = true;
      enableZshIntegration = true;
    };

    # zsh configuration
    zsh = {
      enable = true;
      enableCompletion = true;
      autosuggestion.enable = true;
      syntaxHighlighting.enable = true;
      shellAliases = {
        v = "nvim";
        vim = "nvim";
        lg = "lazygit";
        ldk = "lazydocker";
        gt-done = "gh pr create --base (git branch | sed 's/^\* //' | fzf --ansi | sed 's/^ *//')";
        cat = "bat --theme=base16";
        ls = "eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions";
        cd = "z";
        cdd = "cd ~/.dotfiles/";
      };
    };
    # fzf configuration
    fzf = {
      enable = true;
      enableZshIntegration = true;
    };
    # fd configuration
    fd = {
      enable = true;
    };
    # bat configuration
    bat = {
      enable = true;
    };
    # zoxide configuration
    zoxide = {
      enable = true;
      enableZshIntegration = true;
    };
    # delta configuration
    git.delta = {
      enable = true;
    };

    # eza configuration
    eza = {
      enable = true;
      enableZshIntegration = true;
    };

    # yazi configuration
    yazi = {
      enable = true;
      enableZshIntegration = true;
    };

    ripgrep.enable = true;
    jq.enable = true;
  };

  # sketchybar configuration
  home.file.".config/sketchybar/sketchybarrc" = {
    source = config.lib.file.mkOutOfStoreSymlink sketchybarDir;
  };

  # aerospace configuration
  home.file.".config/aerospace/aerospace.toml" = {
    source = config.lib.file.mkOutOfStoreSymlink aerospaceDirectory;
  };
}

