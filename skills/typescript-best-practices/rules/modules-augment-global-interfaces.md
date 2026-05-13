# augment-global-interfaces

**When:** Adding properties to built-in global objects like Window or process.env.

## Bad
```typescript
window.myApp = { version: "1.0" };
// Error: Property 'myApp' does not exist on type 'Window'

process.env.API_KEY;
// Type is string | undefined, no specific keys
```

## Good
```typescript
// globals.d.ts
declare global {
  interface Window {
    myApp: { version: string };
  }

  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
      NODE_ENV: 'development' | 'production';
    }
  }
}
export {};

// Now typed correctly
window.myApp.version; // string
process.env.API_KEY; // string (not undefined)
```

## Why
TypeScript's built-in interfaces can be augmented via declaration merging. Use `declare global` to extend Window, process.env, and other global interfaces.
