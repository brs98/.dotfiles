# Augment only the globals the runtime actually provides

**When:** Integrating a real global object extension or environment contract. First check whether included declarations already describe it.

```typescript
// file: globals.d.ts
export {};
declare global {
  interface Window {
    myApp?: { version: string };
  }
  namespace NodeJS {
    interface ProcessEnv {
      APP_MODE?: "development" | "test" | "production";
    }
  }
}
```

```typescript
// file: browser.ts
window.myApp = { version: "1.0" }; // Real initialization.
console.log(window.myApp.version);
```

Declarations neither create nor validate values. A required property is justified only by an established initialization/injection invariant. Optional declarations preserve absence; even a declared string union is a trusted promise, not runtime validation of an environment variable.

For untrusted environment values, validate them and expose a separate typed config:

```typescript
function readConfig(env: Record<string, string | undefined>) {
  const apiUrl = env.API_URL;
  if (!apiUrl) throw new Error("API_URL is required");
  return { apiUrl: new URL(apiUrl).href };
}
```

Keep browser and Node ambient types in their owning project configs. Local application models need not augment platform globals.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript global augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#global-augmentation), [workshop environment typing](https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don%27t-control/modifying-process.env-typing-in-typescript)
