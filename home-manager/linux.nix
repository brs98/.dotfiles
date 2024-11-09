{ config, pkgs, ... }:

{
  home.username = "brandon";
  home.homeDirectory = "/home/brandon";
  home.stateVersion = "23.11";

  home.packages = with pkgs; [
    gh
    wezterm
    gnused
    htop
    wget
    neovim
    typescript
    lazydocker

    gcc

    nodejs_20
    corepack_20

    trunk
    rustup

    (nerdfonts.override { fonts = [ "Hack" ]; })
    tree
    nodePackages.typescript-language-server
    nodePackages.ts-node
    nodePackages.dotenv-cli
    nodePackages.vercel
  ];

  home.sessionVariables = {
    EDITOR = "nvim";
  };

  programs = {
    home-manager.enable = true;
    programs.wezterm = {
      enable = true;
      enableZshIntegration = true;
      extraConfig = builtins.readFile ../wezterm/wezterm.lua
    };
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
        sync-dotfiles = "home-manager -f ~/.dotfiles/home.nix switch";
        sdf = "home-manager -f ~/.dotfiles/nix-darwin/home.nix switch";
        home = "v ~/.dotfiles/home.nix";
        flake = "v ~/.dotfiles/flake.nix";
        sync-flake = "darwin-rebuild switch --flake ~/.dotfiles";
        sf = "darwin-rebuild switch --flake ~/.dotfiles/nix-darwin";
        updateNix = "sudo nixos-rebuild switch --flake ~/.dotfiles";
        updateHome = "sudo -i nix-channel --update && home-manager switch --flake ~/.dotfiles";
        cat = "bat --theme=base16";
        ls = "eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions";
        cd = "z";
        cdd = "cd ~/.dotfiles/";
        zel = "zellij --layout ~/.config/zellij/layouts/nextjs.kdl";
        pw = "~/.dotfiles/scripts/pw";
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

    # zellij configuration
    zellij = {
      enable = true;
    };

    # yazi configuration
    yazi = {
      enable = true;
      enableZshIntegration = true;
    };

    ripgrep.enable = true;
    jq.enable = true;
  };

  # neovim configuration
  home.file.".config/nvim" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/nvim";
  };

  # wezterm configuration
  home.file.".config/wezterm" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/wezterm";
  };

  # starship configuration
  home.file.".config/starship.toml" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/starship/starship.toml";
  };
}

