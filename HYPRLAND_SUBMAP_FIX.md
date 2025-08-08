# Hyprland Submap Fix Summary

## Problem Identified
The Hyprland configuration had improperly scoped submap bindings that were capturing keys globally instead of only within the submaps. This caused keys like `r`, `f`, `h`, `j`, `k`, `l`, `b`, `enter` to not work for normal typing because they were being intercepted by the submap bindings even when not in a submap.

## Root Cause
1. **Improper submap syntax**: The configuration used `submap."service".bind` syntax which was capturing keys globally
2. **Missing proper submap scoping**: Keys were not properly scoped to only work within submaps
3. **Insufficient exit strategies**: Limited ways to exit submaps if they got stuck
4. **Missing reset submap**: No explicit reset submap declaration

## Changes Made

### 1. Fixed Submap Structure
- **Before**: `submap."service".bind = [...]` and `submap."resize" = {...}`
- **After**: Unified `submap = { "service" = {...}; "resize" = {...}; "reset" = {}; }`

### 2. Added Multiple Exit Strategies
Each submap now has multiple ways to exit:
- `Escape` (standard exit)
- `Super + Escape` (if modifier is held)
- `Ctrl + C` (universal cancel)
- Same key combination that enters the mode (toggle behavior)
- `catchall` binding to reset on any unmapped key

### 3. Global Emergency Reset
Added global emergency submap reset: `Super + Shift + Ctrl + Escape`

### 4. Improved Key Scoping
- Removed global `$mod SHIFT` bindings from submaps
- Used bare keys (`, h`, `, j`, etc.) within submaps for proper scoping
- Added `catchall` bindings to prevent key leakage

### 5. Fixed Service Submap Actions
Changed from:
```nix
", h, layoutmsg, swapprev"
"$mod SHIFT, h, submap, reset"
```

To:
```nix
", h, layoutmsg, swapprev"
", h, submap, reset"
```

This ensures the action and exit happen with the same key press within the submap.

## How Submaps Now Work

### Service Mode (`Super + Shift + Semicolon`)
- `r`: Reset layout and exit
- `f`: Toggle floating and exit
- `backspace`: Close all windows except current and exit
- `h/j/k/l`: Join windows with directions and exit
- `Escape`, `Super+Escape`, `Ctrl+C`, or `Super+Shift+Semicolon`: Exit without action
- Any other key: Exit (catchall)

### Resize Mode (`Super + Shift + R`)
- `h/j/k/l`: Resize window (repeatable with `binde`)
- `b`: Balance window sizes and exit
- `minus/equal`: Smart resize and exit
- `Enter`: Exit resize mode
- `Escape`, `Super+Escape`, `Ctrl+C`, or `Super+Shift+R`: Exit without action
- Any other key: Exit (catchall)

## Safety Features
1. **Global emergency reset**: `Super + Shift + Ctrl + Escape` always resets submaps
2. **Multiple exit paths**: Each submap has 4+ ways to exit
3. **Catchall bindings**: Unknown keys automatically reset the submap
4. **Explicit reset submap**: Proper `"reset" = {}` declaration

## How to Apply Changes

### Option 1: Darwin Rebuild (Recommended)
```bash
cd ~/.dotfiles
darwin-rebuild switch --flake ~/.dotfiles
```

### Option 2: Use Configured Alias
```bash
sdf  # Switch dotfiles alias
```

### Option 3: Test First (Safer)
```bash
cd ~/.dotfiles
darwin-rebuild build --flake ~/.dotfiles  # Test build first
darwin-rebuild switch --flake ~/.dotfiles  # Apply if build succeeds
```

## Emergency Recovery
If you get stuck in a submap after applying:

1. **Try the emergency reset**: `Super + Shift + Ctrl + Escape`
2. **Try standard exits**: `Escape`, `Ctrl + C`
3. **Use hyprctl from terminal**:
   ```bash
   hyprctl dispatch submap reset
   ```
4. **Restart Hyprland**: `Super + Shift + E` (if available)

## Testing the Fix
After applying the configuration:

1. Test normal typing of `r`, `f`, `h`, `j`, `k`, `l`, `b`, `Enter` - should work normally
2. Enter service mode: `Super + Shift + Semicolon`
3. Test actions: `r` (layout), `f` (floating), `h/j/k/l` (joins)
4. Test exits: `Escape`, `Ctrl+C`, `Super+Shift+Semicolon`
5. Enter resize mode: `Super + Shift + R`
6. Test resize: `h/j/k/l`, `b` (balance), `minus/equal`
7. Test exits: `Enter`, `Escape`, `Ctrl+C`

## Files Modified
- `/Users/brandon/.dotfiles/home-manager/modules/hyprland.nix`

## Technical Details
The fix follows Hyprland's official submap documentation and best practices:
- Uses proper submap scoping with unified `submap = {}` declaration
- Implements catchall bindings for safety
- Provides multiple exit strategies per submap
- Maintains AeroSpace keybinding compatibility
- Preserves all original functionality while fixing the key capture issue