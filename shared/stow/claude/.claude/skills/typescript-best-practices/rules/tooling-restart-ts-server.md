# restart-ts-server

**When:** VS Code shows stale errors, missing autocomplete, or incorrect types.

## Bad
```
- Close and reopen VS Code
- Delete node_modules and reinstall
- Restart your computer
```

## Good
```
1. Open Command Palette: Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows)
2. Type: "TypeScript: Restart TS Server"
3. Press Enter
```

## Why
The TypeScript language server can get out of sync after package updates, config changes, or heavy refactoring. Restarting it forces a fresh analysis without restarting your entire editor.
