{ config, pkgs, lib, ... }:

{
  home.username = "brandonsouthwick";
  home.homeDirectory = "/Users/brandonsouthwick";
  home.stateVersion = "23.11";

  home.packages = with pkgs; [
    gnused
    htop
    wget
    sketchybar
    procps
    neovim
    typescript
    lazydocker

    nodejs_20
    corepack_20

    (nerdfonts.override { fonts = [ "Hack" ]; })
    rustup
    tree
    nodePackages.typescript-language-server
    nodePackages.ts-node
    nodePackages.dotenv-cli

    # # It is sometimes useful to fine-tune packages, for example, by applying
    # # overrides. You can do that directly here, just don't forget the
    # # parentheses. Maybe you want to install Nerd Fonts with a limited number of
    # # fonts?
    # (pkgs.nerdfonts.override { fonts = [ "FantasqueSansMono" ]; })

    # # You can also create simple shell scripts directly inside your
    # # configuration. For example, this adds a command 'my-hello' to your
    # # environment:
    # (pkgs.writeShellScriptBin "my-hello" ''
    #   echo "Hello, ${config.home.username}!"
    # '')
  ];

  # Home Manager is pretty good at managing dotfiles. The primary way to manage
  # plain files is through 'home.file'.
  home.file = {
    # # Building this configuration will create a copy of 'dotfiles/screenrc' in
    # # the Nix store. Activating the configuration will then make '~/.screenrc' a
    # # symlink to the Nix store copy.
    # ".screenrc".source = dotfiles/screenrc;

    # # You can also set the file content immediately.
    # ".gradle/gradle.properties".text = ''
    #   org.gradle.console=verbose
    #   org.gradle.daemon.idletimeout=3600000
    # '';
  };

  # Home Manager can also manage your environment variables through
  # 'home.sessionVariables'. These will be explicitly sourced when using a
  # shell provided by Home Manager. If you don't want to manage your shell
  # through Home Manager then you have to manually source 'hm-session-vars.sh'
  # located at either
  #
  #  ~/.nix-profile/etc/profile.d/hm-session-vars.sh
  #
  # or
  #
  #  ~/.local/state/nix/profiles/profile/etc/profile.d/hm-session-vars.sh
  #
  # or
  #
  #  /etc/profiles/per-user/brandonsouthwick/etc/profile.d/hm-session-vars.sh
  #
  home.sessionVariables = {
    EDITOR = "nvim";
  };

  home.sessionPath = with pkgs; [
    "~/.local/scripts/"
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
    # lazygit configuration
    lazygit = {
      enable = true;
    };
    # zsh configuration
    zsh = {
      enable = true;
      enableCompletion = true;
      autosuggestion.enable = true;
      syntaxHighlighting.enable = true;
      oh-my-zsh = {
        enable = true;
        theme = "robbyrussell";
        plugins = [
          "git"
        ];
      };
      shellAliases = {
        v = "nvim";
        vim = "nvim";
        lg = "lazygit";
        ldk = "lazydocker";
        gt-done = "gh pr create --base (git branch | sed 's/^\* //' | fzf --ansi | sed 's/^ *//')";
        sync-dotfiles = "home-manager -f ~/.dotfiles/home.nix switch";
        sdf = "home-manager -f ~/.dotfiles/home.nix switch";
        home = "v ~/.dotfiles/home.nix";
        flake = "v ~/.dotfiles/flake.nix";
        sync-flake = "darwin-rebuild switch --flake ~/.dotfiles";
        sf = "darwin-rebuild switch --flake ~/.dotfiles";
        updateNix = "sudo nixos-rebuild switch --flake ~/.dotfiles";
        updateHome = "sudo -i nix-channel --update && home-manager switch --flake ~/.dotfiles";
        cat = "bat --theme=base16";
        ls = "eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions";
        cd = "z";
        cdd = "cd ~/.dotfiles/";
        zel = "zellij --layout ~/.config/zellij/layouts/nextjs.kdl";
      };
    };
    # Kitty configuration
    kitty = {
      enable = true;
      font = {
        name = "Hack Nerd Font";
        size = 16.0;
      };
      keybindings = {
        "cmd+t" = "send_key all ctrl+b";
        "cmd+j" = "send_key all ctrl+b";
        "cmd+k" = "send_key all ctrl+l";
      };
      settings = {
        background = "#1a1b26";
        background_opacity = "0.8";
        hide_window_decorations = "yes";
        zel = "zellij --layout ~/.config/zellij/layouts/nextjs.kdl";
        macos_option_as_alt = "yes";
      };
      extraConfig = ''
        # vim:ft=kitty

        ## name: Tokyo Night
        ## license: MIT
        ## author: Folke Lemaitre
        ## upstream: https://github.com/folke/tokyonight.nvim/raw/main/extras/kitty/tokyonight_night.conf


        background #1a1b26
        foreground #c0caf5
        selection_background #283457
        selection_foreground #c0caf5
        url_color #73daca
        cursor #c0caf5
        cursor_text_color #1a1b26

        # Tabs
        active_tab_background #7aa2f7
        active_tab_foreground #16161e
        inactive_tab_background #292e42
        inactive_tab_foreground #545c7e
        #tab_bar_background #15161e

        # Windows
        active_border_color #7aa2f7
        inactive_border_color #292e42

        # normal
        color0 #15161e
        color1 #f7768e
        color2 #9ece6a
        color3 #e0af68
        color4 #7aa2f7
        color5 #bb9af7
        color6 #7dcfff
        color7 #a9b1d6

        # bright
        color8 #414868
        color9 #f7768e
        color10 #9ece6a
        color11 #e0af68
        color12 #7aa2f7
        color13 #bb9af7
        color14 #7dcfff
        color15 #c0caf5

        # extended colors
        color16 #ff9e64
        color17 #db4b4b
      '';
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
  };

  home.file.zellij = {
    target = ".config/zellij/config.kdl";
    text = ''
      simplified_ui true
      pane_frames false
      copy_on_select true
      keybinds {
        unbind "Ctrl o"
        unbind "Cmd s"
        shared {
          bind "Ctrl s" { SwitchToMode "session"; }
          bind "Ctrl f" { SwitchToMode "scroll"; }
        }
        locked {
          bind "Ctrl b" { SwitchToMode "tmux"; }
          bind "Ctrl g" { SwitchToMode "normal"; }
          bind "Alt Left" { MoveFocusOrTab "Left"; }
          bind "Alt Right" { MoveFocusOrTab "Right"; }
          bind "Alt Up" { MoveFocusOrTab "Up"; }
          bind "Alt Down" { MoveFocusOrTab "Down"; }
        }
      }
      theme "tokyo-night-dark"
      themes {
          tokyo-night-dark {
              fg 169 177 214
              bg 26 27 38
              black 56 62 90
              red 249 51 87
              green 158 206 106
              yellow 224 175 104
              blue 122 162 247
              magenta 187 154 247
              cyan 42 195 222
              white 192 202 245
              orange 255 158 100
          }
      }
    '';
  };

  home.file.zellij-layout = {
    target = ".config/zellij/layouts/nextjs.kdl";
    text = ''
      layout {
        tab name="nvim" focus=true {
          pane command="nvim"
          pane size=1 borderless=true {
            plugin location="compact-bar"
          }
        }
        tab name="shell" {
          pane split_direction="vertical" {
            pane command="dev"
            pane
          }
          pane size=1 borderless=true {
            plugin location="compact-bar"
          }
        }
        default_tab_template {
          pane size=1 borderless=true {
            plugin location="compact-bar"
          }
        }
      }
    '';
  };

  # sketchybar configuration
  home.file.".config/sketchybar" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/sketchybar";
  };

  # neovim configuration
  home.file.".config/nvim" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/nvim";
  };

  # wezterm configuration
  home.file.".config/wezterm" = {
    source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/wezterm";
  };
}

