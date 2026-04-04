# go-to-definition

**When:** Navigating to where a function, type, or variable is defined.

## Bad
```
1. Open file search (Cmd+P)
2. Guess which file contains the definition
3. Search within the file for the name
4. Hope you found the right one
```

## Good
```
- Cmd+Click (Mac) / Ctrl+Click (Windows) on any identifier
- Or press F12 with cursor on identifier
- Jump directly to the definition

- On a definition: Shift+F12 to see all references
- Alt+Left to go back to previous location
```

## Why
Go to Definition leverages TypeScript's understanding of your code to jump directly to declarations. Essential for navigating codebases and understanding how code connects.
