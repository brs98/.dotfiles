# dts-module-vs-script

**When:** Declaration file types are unexpectedly global or not found.

## Bad
```typescript
// globals.d.ts (no imports/exports)
interface User { name: string } // Global! Pollutes all files
```

## Good
```typescript
// globals.d.ts - intentionally global
interface User { name: string }
// No import/export = script mode = global scope

// types.d.ts - module scope
export interface User { name: string }
// Has export = module mode = must be imported

// Or force module mode without exports:
export {}; // Makes file a module, nothing is global
```

## Why
Files without `import`/`export` are "scripts" with global scope. Add `export {}` to make a file a module even if you don't export anything, preventing accidental globals.
