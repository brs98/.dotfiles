#!/bin/bash

# Some events send additional information specific to the event in the $INFO
# variable. E.g. the front_app_switched event sends the name of the newly
# focused application in the $INFO variable:
# https://felixkratz.github.io/SketchyBar/config/events#events-and-scripting

if [ "$SENDER" = "front_app_switched" ]; then
  # Map application names to Nerd Font icons
  case "$INFO" in
    "Safari")
        ICON=""
        ;;
    "Google Chrome")
        ICON=""
        ;;
    "Firefox")
        ICON=""
        ;;
    "Zen")
        ICON=""
        ;;
    "Linear")
        ICON=""
        ;;
    "Finder")
        ICON="󰀶"
        ;;
    "iTerm2"|"Terminal"|"WezTerm")
        ICON=""
        ;;
    "Slack")
        ICON=""
        ;;
    "Discord")
        ICON=""
        ;;
    "Spotify")
        ICON=""
        ;;
    "Messages")
        ICON="󰍦"
        ;;
    "Calendar")
        ICON=""
        ;;
    "Notes")
        ICON="󰠮"
        ;;
    "System Preferences"|"System Settings")
        ICON=""
        ;;
    "Activity Monitor")
        ICON="󰟌"
        ;;
    "OrbStack")
        ICON=""
        ;;
    "Figma")
        ICON=""
        ;;
    "Claude")
        ICON="󰚩"
        ;;
    *)
        ICON="" # Default application icon
        ;;
  esac

  sketchybar --set "$NAME" icon="$ICON" label=""
fi
