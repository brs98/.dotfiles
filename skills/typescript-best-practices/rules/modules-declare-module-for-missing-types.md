# Supply accurate declarations for an untyped module

**When:** Resolution confirms an installed JavaScript package lacks usable types. Check bundled declarations, exports/resolution settings and available `@types` packages first.

An ambient declaration file must remain a script at its top level:

```typescript
// file: untyped-package.d.ts
declare module "untyped-package" {
  export interface Config { timeout: number; }
  export function configure(config: Config): void;
}
```

Import from a separate consumer:

```typescript
// file: consumer.ts
import { configure } from "untyped-package";
import type { Config } from "untyped-package";
const config: Config = { timeout: 500 };
configure(config);
```

Top-level imports/exports turn a `.d.ts` into an external module; its string-named `declare module` blocks then augment existing modules instead of creating standalone ambient modules. If the declaration needs imported types, place the import inside its module block or use an import type expression.

Write signatures faithful to the actual JavaScript API and include the declaration in the project. Shorthand `declare module "untyped-package";` makes the module `any`; it suppresses errors without adding useful checking. A suppressed import can also be an intentional negative test or an export mismatch, so do not replace every `@ts-expect-error` with a declaration.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript ambient modules](https://www.typescriptlang.org/docs/handbook/modules/reference.html#ambient-modules)
