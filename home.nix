{ config, pkgs, lib, ... }:

{
  home.username = "brandonsouthwick";
  home.homeDirectory = "/Users/brandonsouthwick";
  home.stateVersion = "23.11";

  home.packages = [
    pkgs.htop
    pkgs.neovim
    pkgs.nodejs_20
    (pkgs.nerdfonts.override { fonts = [ "Hack" ]; })
    pkgs.rustup

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
    # EDITOR = "emacs";
  };

  home.sessionPath = [
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
    # Tmux configuration
    tmux = {
      enable = true;
      escapeTime = 0;
      mouse = true;
      keyMode = "vi";
      shell = "${pkgs.fish}/bin/fish";
      terminal = "screen-256color";
      baseIndex = 1;
      sensibleOnTop = true;
      plugins = with pkgs;
        [
          tmuxPlugins.better-mouse-mode
          tmuxPlugins.catppuccin
          tmuxPlugins.vim-tmux-navigator
        ];
      extraConfig = ''
        set-option -ga terminal-overrides ',*-256color*:RGB'
        set-option -g renumber-windows on
        bind-key -T copy-mode-vi v send-keys -X begin-selection
        bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
        bind-key -T copy-mode-vi y send-keys -X copy-selection-and-cancel
        bind-key - split-window -v
        bind-key | split-window -h
        bind h split-window -v -c "#{pane_current_path}"
        bind v split-window -h -c "#{pane_current_path}"
        unbind-key -T copy-mode-vi v
        bind-key -T copy-mode-vi v send-keys -X begin-selection
        bind-key -T copy-mode-vi 'C-v' send-keys -X rectangle-toggle
        bind-key -T copy-mode-vi y send-keys -X copy-pipe "pbcopy"
        bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
        bind-key -T copy-mode-vi Escape send-keys -X cancel
        bind C-l send-keys 'C-l'
        bind-key -r f run-shell "tmux neww ~/.local/scripts/tmux-sessionizer"
        bind-key -r W run-shell "~/.local/scripts/tmux-sessionizer ~/remi/roofworx-monorepo"
        bind-key -r D run-shell "~/.local/scripts/tmux-sessionizer ~/.dotfiles"
        run '~/.tmux/plugins/tpm/tpm'
      '';
    };
    # Fish configuration
    fish = {
      enable = true;
      shellAliases = {
        v = "nvim";
        vim = "nvim";
        ff = "find_directories";
        ts = "tmux-sessionizer";
        lg = "lazygit";
        fdf = "find_dotfiles";
        gt-done = "gh pr create --base (git branch | sed 's/^\* //' | fzf --ansi | sed 's/^ *//')";
        sync-dotfiles = "home-manager -f ~/.dotfiles/home.nix switch";
        home = "v ~/.dotfiles/home.nix";
        cat = "bat --theme=base16";
        ls = "eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions";
        # cd = "z";
      };
      shellInit = ''
        set -gx PNPM_HOME /Users/brandonsouthwick/Library/pnpm
        if not string match -q -- $PNPM_HOME $PATH
            set -gx PATH "$PNPM_HOME" $PATH
        end
      '';
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
        "cmd+s" = "send_key all alt+s";
        "cmd+k" = "send_key all ctrl+l";
      };
      theme = "Catppuccin-Mocha";
      settings = {
        background_opacity = "0.8";
        hide_window_decorations = "yes";
      };
    };
    # fzf configuration
    fzf = {
      enable = true;
      enableFishIntegration = true;
    };
    # bat configuration
    bat = {
      enable = true;
    };
    # zoxide configuration
    zoxide = {
      enable = true;
      enableFishIntegration = true;
    };
    # delta configuration
    git.delta = {
      enable = true;
    };

    # eza configuration
    eza = {
      enable = true;
      enableFishIntegration = true;
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
      default_layout "compact"
      copy_on_select true
      theme "catppuccin-mocha"
      themes {
        catppuccin-mocha {
          bg "#585b70"
          black "#181825"
          blue "#89b4fa"
          cyan "#89dceb"
          fg "#cdd6f4"
          green "#a6e3a1"
          magenta "#f5c2e7"
          orange "#fab387"
          red "#f38ba8"
          white "#cdd6f4"
          yellow "#f9e2af"
        }
      }
    '';
  };

  xdg.configFile.nvim = {
    source = ~/.dotfiles/nvim;
    recursive = true;
    enable = true;
  };
}
