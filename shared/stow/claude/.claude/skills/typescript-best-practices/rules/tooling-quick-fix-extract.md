# quick-fix-extract

**When:** Refactoring code into constants, variables, or functions.

## Bad
```typescript
// Manually extracting:
// 1. Copy the expression
// 2. Create new const above
// 3. Paste and name it
// 4. Replace original with variable name
// 5. Hope you didn't break anything
```

## Good
```typescript
// 1. Select the code you want to extract
const result = items.filter(x => x.active).map(x => x.name);
//             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ select this

// 2. Press Cmd+. (Quick Fix menu)
// 3. Choose:
//    - "Extract to constant in enclosing scope"
//    - "Extract to function in module scope"
//    - etc.

// Result:
const activeNames = items.filter(x => x.active).map(x => x.name);
const result = activeNames;
```

## Why
Quick Fix extractions are automated refactors that preserve semantics. What you select determines the available options - select an expression for constant extraction, select statements for function extraction.
