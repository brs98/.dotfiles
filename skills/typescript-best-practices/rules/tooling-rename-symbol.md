# rename-symbol

**When:** Renaming a variable, function, type, or any identifier.

## Bad
```
1. Use Find and Replace (Cmd+H)
2. Replace "userId" with "id"
3. Accidentally rename "userIdValidator" to "idValidator"
4. Accidentally rename "userId" in comments and strings
```

## Good
```
1. Click on the identifier you want to rename
2. Press F2 (or right-click > Rename Symbol)
3. Type the new name
4. Press Enter - all references updated correctly
```

## Why
Rename Symbol understands TypeScript's scope and semantics. It only renames actual references to that specific binding, not text matches. Works across files automatically.
