# declare-const-for-external-globals

**When:** Using global variables injected by external tools (bundlers, scripts, etc.).

## Bad
```typescript
// __VERSION__ injected by webpack DefinePlugin
console.log(__VERSION__); // Error: Cannot find name '__VERSION__'
```

## Good
```typescript
// globals.d.ts
declare const __VERSION__: string;
declare const __DEV__: boolean;

// Now usable anywhere
console.log(__VERSION__); // OK
if (__DEV__) { ... } // OK
```

## Why
Use `declare const` to tell TypeScript about global variables that exist at runtime but aren't defined in your source code. This is common for build-time injected values.
