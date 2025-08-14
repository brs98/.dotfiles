{ config, pkgs, ... }: {
  programs.tmux = {
    enable = true;
    shortcut = "a";
    baseIndex = 1;
    escapeTime = 0;
    historyLimit = 10000;
    terminal = "tmux-256color";
    extraConfig = ''
      # Enable mouse support
      set -g mouse on
      
      # Set prefix to C-a
      set -g prefix C-a
      unbind C-b
      bind C-a send-prefix
      
      # Reload configuration
      bind r source-file ~/.config/tmux/tmux.conf \; display-message "Config reloaded!"
      
      # Better pane splitting
      bind | split-window -h -c "#{pane_current_path}"
      bind - split-window -v -c "#{pane_current_path}"
      bind c new-window -c "#{pane_current_path}"
      
      # Pane navigation (vim-style)
      bind h select-pane -L
      bind j select-pane -D
      bind k select-pane -U
      bind l select-pane -R
      
      # Pane resizing
      bind -r H resize-pane -L 5
      bind -r J resize-pane -D 5
      bind -r K resize-pane -U 5
      bind -r L resize-pane -R 5
      
      # Window navigation
      bind -n M-Left previous-window
      bind -n M-Right next-window
      
      # Copy mode (vi style)
      set -g mode-keys vi
      bind-key -T copy-mode-vi v send-keys -X begin-selection
      bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
      bind-key -T copy-mode-vi y send-keys -X copy-selection-and-cancel
      
      # Enable clipboard integration (OSC 52)
      set -s set-clipboard external
      
      # Status bar configuration
      set -g status on
      set -g status-position bottom
      set -g status-interval 5
      set -g status-left-length 100
      set -g status-right-length 100
      
      # Status bar colors (basic theme)
      set -g status-style bg=colour235,fg=colour136
      set -g status-left "#[fg=colour166]#S #[fg=colour244]• "
      set -g status-right "#[fg=colour166]%H:%M #[fg=colour244]%d-%b-%y"
      
      # Window status
      setw -g window-status-format "#[fg=colour244] #I #W "
      setw -g window-status-current-format "#[fg=colour166,bold] #I #W "
      
      # Pane borders
      set -g pane-border-style fg=colour238
      set -g pane-active-border-style fg=colour166
      
      # Message colors
      set -g message-style bg=colour235,fg=colour166
      set -g message-command-style bg=colour235,fg=colour166
      
      # Activity monitoring
      setw -g monitor-activity on
      set -g visual-activity off
      setw -g window-status-activity-style fg=colour166,bg=colour235
      
      # Don't rename windows automatically
      set -g allow-rename off
      
      # Start windows and panes at 1, not 0
      set -g base-index 1
      setw -g pane-base-index 1
      
      # Renumber windows when one is closed
      set -g renumber-windows on
      
      # Terminal features
      set -as terminal-features ",*:RGB"
    '';
  };
} 