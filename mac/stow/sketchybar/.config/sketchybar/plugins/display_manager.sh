#!/bin/bash

# Get display count
DISPLAY_COUNT=$(sketchybar --query displays | jq length)

if [ "$DISPLAY_COUNT" -gt 1 ]; then
  # Multiple displays: show center datetime on primary, right datetime on external
  sketchybar --set datetime_center display=1 drawing=on
  sketchybar --set datetime_right display=2 drawing=on  
  sketchybar --set datetime_single drawing=off
  
  # Show center bracket on primary, combined bracket on external
  sketchybar --set center_bracket display=1 background.drawing=on
  sketchybar --set right_bracket_main display=1 background.drawing=on
  sketchybar --set right_bracket_ext display=2 background.drawing=on
  sketchybar --set right_bracket_single background.drawing=off
else
  # Single display: hide center datetime, show combined right bracket
  sketchybar --set datetime_center drawing=off
  sketchybar --set datetime_right drawing=off
  sketchybar --set datetime_single display=1 drawing=on
  
  # Hide multi-display brackets, show single bracket
  sketchybar --set center_bracket background.drawing=off
  sketchybar --set right_bracket_main background.drawing=off
  sketchybar --set right_bracket_ext background.drawing=off
  sketchybar --set right_bracket_single display=1 background.drawing=on
fi