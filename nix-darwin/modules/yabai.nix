{...}:  {
        services.yabai = {
          enable = true;
          extraConfig = ''
            # default layout (can be bsp, stack or float)
            yabai -m config layout bsp

            # new window spawns to the right if vertical split, or bottom if horizontal split
            yabai -m config window_placement second_child

            # padding set to 12px
            yabai -m config top_padding 12
            yabai -m config bottom_padding 12
            yabai -m config left_padding 12
            yabai -m config right_padding 12
            yabai -m config window_gap 12
            yabai -m config external_bar all:28:0

            # -- mouse settings --

            # center mouse on window with focus
            yabai -m config mouse_follows_focus on

            # modifier for clicking and dragging with mouse
            yabai -m config mouse_modifier alt
            # set modifier + left-click drag to move window
            yabai -m config mouse_action1 move
            # set modifier + right-click drag to resize window
            yabai -m config mouse_action2 resize

            # when window is dropped in center of another window, swap them (on edges it will split it)
            yabai -m mouse_drop_action swap

            # disable specific apps
            yabai -m rule --add app="^Calculator$" manage=off
          '';
        };
}
