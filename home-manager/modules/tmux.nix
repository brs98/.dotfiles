{ config, pkgs, ... }: {
  programs.tmux = {
    enable = true;
    shortcut = "a";
    baseIndex = 1;
    escapeTime = 0;
    historyLimit = 10000;
    terminal = "tmux-256color";
    plugins = with pkgs; [
      tmuxPlugins.sensible
      tmuxPlugins.catppuccin
      tmuxPlugins.vim-tmux-navigator
    ];
    extraConfig = ''
      set -s escape-time 0
      set -g mouse on
      set-option -g default-terminal "screen-256color"
      set-option -ga terminal-overrides ',*-256color*:RGB'
      set-option -g default-shell /opt/homebrew/bin/fish
      setw -g mode-keys vi

      # Copy mode
      bind-key -T copy-mode-vi v send-keys -X begin-selection
      bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
      bind-key -T copy-mode-vi y send-keys -X copy-selection-and-cancel

      # Renumber windows
      set -g base-index 1
      set -g pane-base-index 1
      set-window-option -g pane-base-index 1
      set-option -g renumber-windows on

      # Better pane splits
      bind-key - split-window -v
      bind-key | split-window -h

      # Open panes in current directory
      bind h split-window -v -c "#{pane_current_path}"
      bind v split-window -h -c "#{pane_current_path}"

      # Copy mode
      unbind-key -T copy-mode-vi v
      bind-key -T copy-mode-vi v send-keys -X begin-selection
      bind-key -T copy-mode-vi 'C-v' send-keys -X rectangle-toggle
      bind-key -T copy-mode-vi y send-keys -X copy-pipe "pbcopy"
      bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
      bind-key -T copy-mode-vi Escape send-keys -X cancel

      # <prefix>^L to clear the screen (there is an overlap with vim-tmux-navigator) 
      bind C-l send-keys 'C-l'
    '';
  };
} 
