# Add globals from a module explicitly

**When:** A real integration needs global types declared from a module. Prefer exported module-local application types otherwise.

```typescript
// file: integration.d.ts
export {};
declare global {
  interface GlobalUser { name: string; }
  var DEBUG: boolean;
}
```

```typescript
// file: bootstrap.ts
// Establish the runtime value promised by the declaration.
globalThis.DEBUG = false;
const user: GlobalUser = { name: "Ada" };
console.log(DEBUG, user.name);
```

A top-level `interface GlobalUser` in a module is local to that module; the same spelling as a global does not imply augmentation intent. `declare global` explicitly adds declarations to global scope. The `var DEBUG` declaration itself creates no runtime property; bootstrap order and initialization remain runtime responsibilities.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript global augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#global-augmentation)
