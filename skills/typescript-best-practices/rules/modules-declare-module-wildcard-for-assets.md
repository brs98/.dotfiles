# Match asset declarations to the loader's runtime values

**When:** The actual loader supports an asset import but the TypeScript project lacks its declarations. Prefer framework-provided types when available.

For a loader that returns a URL for PNG imports:

```typescript
// file: assets.d.ts
declare module "*.png" {
  const url: string;
  export default url;
}
```

```typescript
// file: view.ts
import logo from "./logo.png";
console.log(logo); // string URL, as promised by this loader.
```

A wildcard declaration supplies types, not an asset loader or proof that a file exists. Match its exports to runtime behavior. CSS Modules commonly expose a class map from `*.module.css`; ordinary CSS in Vite is imported for side effects (`import "./app.css"`) and should not be declared as a default class map. Use `resolveJsonModule` for supported JSON imports so their actual shape is inferred rather than replacing every JSON type with a wildcard.

Vite's included `vite/client` types already describe its standard assets; they can be loaded through compiler `types` or a triple-slash reference. Respect custom SVG/component loaders and framework overrides rather than duplicating incompatible declarations.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [Vite CSS Modules and client types](https://vite.dev/guide/features.html#css-modules), [workshop asset declaration](https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don%27t-control/importing-and-typing-non-code-files-in-typescript/solution)
