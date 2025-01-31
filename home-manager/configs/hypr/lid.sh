#!/usr/bin/env zsh

if [[ $1 == "open" ]]; then
  hyprctl keyword monitor "eDP-1,2880x1920,0x0,2"
  echo "Lid opened"
elif [[ "$(hyprctl monitors)" =~ "\sDP-[0-9]+" ]]; then # If there is an external monitor connected
  hyprctl keyword monitor "eDP-1,disable"
  echo "External monitor connected"
else
  echo "No external monitor connected and lid closed"
fi

