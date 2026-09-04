# Configure syntax output and available APIs separately

**When:** Choosing JavaScript syntax targets and built-in API typings.

For a browser runtime supporting these APIs and syntax, matching versions are a convenient starting point:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

`target` controls TypeScript's syntax transformations. `lib` describes available APIs; it does not install them. TypeScript never supplies polyfills for APIs such as `Promise.allSettled` or `Array.prototype.at`.

Different versions can be intentional: older emitted syntax with newer library typings is valid when the runtime or polyfills provide those APIs. Lower library typings with a newer syntax target do not themselves create a runtime mismatch. Include DOM typings only for a host that provides those globals; Node globals generally come from Node's type package. An external transpiler may have its own output target, so check that tool's configuration as well.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript lib](https://www.typescriptlang.org/tsconfig/lib.html), [workshop lib and target](https://www.totaltypescript.com/workshops/typescript-pro-essentials/configuring-typescript/understanding-lib-and-target-in-typescript-configuration)
