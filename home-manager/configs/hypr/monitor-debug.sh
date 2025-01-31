#!/usr/bin/env zsh

echo "=== Hyprland Logs ===" > ~/monitor-debug.log
hyprctl monitors >> ~/monitor-debug.log
echo -e "\n=== DRM Info ===" >> ~/monitor-debug.log
ls -l /sys/class/drm/ >> ~/monitor-debug.log
echo -e "\n=== Kernel Messages ===" >> ~/monitor-debug.log
dmesg | grep -i "amd\|gpu\|drm" >> ~/monitor-debug.log
