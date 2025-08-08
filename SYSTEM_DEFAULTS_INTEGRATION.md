# macOS System Defaults Integration Summary

This document summarizes the integration of current macOS system settings into nix-darwin configuration.

## Changes Made

### 1. Created New System Defaults Module
- **File**: `/Users/brandon/.dotfiles/nix-darwin/system-defaults.nix`
- **Purpose**: Comprehensive macOS system preferences configuration using nix-darwin

### 2. Updated Main Configuration
- **File**: `/Users/brandon/.dotfiles/nix-darwin/configuration.nix`
- **Changes**:
  - Added import for `./system-defaults.nix`
  - Removed existing minimal system.defaults section (consolidated into new module)

## Configured Settings Categories

### Dock Settings
- Auto-hide dock with instant animation
- Icon size: 48px
- Genie minimize effect
- Hot corners configuration
- Hide recent applications

### Finder Settings
- Show all file extensions and hidden files
- Enable status bar and path bar
- New windows open to "Recents" 
- Search current folder by default
- Default to list view
- Disable file extension change warnings
- Desktop icon preferences (show external drives, hide internal drives)
- Enable "Quit Finder" menu item

### Global Interface (NSGlobalDomain)
- **Dark Mode**: Enabled by default
- **Menu Bar**: Auto-hide (for SketchyBar compatibility)
- **Keyboard**: Fast repeat rates (InitialKeyRepeat=15, KeyRepeat=2)
- **Text Input**: Disabled all smart text features (quotes, dashes, auto-correct, etc.)
- **Animations**: Fast window resize (0.01s), keep other animations
- **Window Behavior**: Always prefer tabs when opening new windows
- **Scrolling**: Traditional scrolling direction, enable swipe navigation
- **File Handling**: Show all extensions and hidden files globally
- **Interface**: Always show scroll bars, medium table row height
- **Print/Save Dialogs**: Expand by default
- **Documents**: Don't default to saving in iCloud

### Universal Access (Accessibility)
- Default settings (motion and transparency enabled)
- Standard cursor size
- Disable scroll wheel zoom toggle

### Screen Capture
- Save to Desktop in PNG format
- Include window shadows
- Show thumbnails after capture

### Screen Saver
- Require password after 5 seconds
- Enable password requirement

### Activity Monitor
- Show CPU usage in dock icon
- Default to "My Processes" view
- Sort by CPU usage (descending)
- Show main window on launch

### Window Manager (macOS Sequoia+)
- Enable window tiling by edge drag
- Show desktop icons
- Show widgets
- Disable global window management by default

### Control Center
- Show battery percentage
- Enable menu bar items for Bluetooth, Sound, Display, Focus Modes
- Show AirDrop in Control Center

### Custom Preferences
Advanced settings not covered by nix-darwin defaults:
- **Finder**: Sort folders first, show POSIX paths in title
- **Global**: Font smoothing, anti-aliasing, menu bar behavior
- **Keyboard**: Function keys require Fn for special functions
- **System**: Natural scrolling, trackpad force click, sound settings

## Key Features Preserved from Current System

Based on analysis of your captured system settings, the configuration preserves:

1. **Performance-oriented settings**: Fast key repeat, instant dock animations
2. **Developer-friendly defaults**: Show hidden files, disable smart text features
3. **Dark mode preference**: Consistent with current system
4. **Finder preferences**: List view default, show extensions and hidden files
5. **Window management**: Tiling support for modern macOS versions
6. **SketchyBar compatibility**: Hidden menu bar and dock auto-hide

## Settings NOT Configured

Some settings were intentionally not included as they are:
- **System-specific**: Hardware IDs, volume positions, window bounds
- **User data**: Recent files, bookmarks, application-specific window states
- **Dynamic values**: Timestamps, usage statistics, temporary preferences
- **App-specific settings**: Better managed by the applications themselves

## How to Apply

1. **Test the configuration**:
   ```bash
   nix build .#darwinConfigurations.brandon-mac.system --dry-run
   ```

2. **Apply the changes**:
   ```bash
   darwin-rebuild switch --flake ~/.dotfiles
   # OR use the configured alias:
   sdf
   ```

3. **Verify changes**:
   - Check Finder preferences (View > Show Status Bar, etc.)
   - Test keyboard repeat rate
   - Verify dark mode and hidden file visibility
   - Check dock behavior and Control Center items

## Customization

To modify settings:
1. Edit `/Users/brandon/.dotfiles/nix-darwin/system-defaults.nix`
2. Use the extensive comments to understand each setting
3. Rebuild with `darwin-rebuild switch --flake ~/.dotfiles`

For settings not available in nix-darwin defaults, add them to the `CustomUserPreferences` section using the appropriate domain (e.g., "com.apple.finder", "NSGlobalDomain").

## Troubleshooting

If any settings don't apply correctly:
1. Check the terminal output during `darwin-rebuild` for warnings
2. Some settings may require logging out and back in
3. Certain preferences may need manual application restart
4. Use `defaults read <domain>` to verify settings were applied

The configuration is designed to be a solid foundation that can be further customized as needed while maintaining reproducibility across macOS systems.