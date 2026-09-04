# Choose declaration-file scope deliberately

**When:** Declaration types are unexpectedly global or unavailable to consumers.

An intentionally global script declaration:

```typescript
// file: globals.d.ts
interface GlobalUser { name: string; }
```

A separate declaration module:

```typescript
// file: model.d.ts
export interface User { name: string; }
```

```typescript
// file: consumer.ts
import type { User } from "./model.js";
const local: User = { name: "Ada" };
const globalModel: GlobalUser = local;
```

A top-level import/export makes a declaration file a module. `export {}` does this without exporting a value; its ordinary top-level declarations then stop being global. Use `declare global` inside a module for globals that should remain visible.

`moduleDetection: "force"` applies to implementation files, not `.d.ts` declarations. Do not generalize “no import/export means script” to every `.ts` configuration. Keep intentional ambient scripts regardless of filename; adding `export {}` can break their consumers.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [Workshop declaration scope](https://www.totaltypescript.com/workshops/typescript-pro-essentials/modules-scripts-and-declaration-files/declaration-files-can-be-modules-or-scripts), [TypeScript moduleDetection](https://www.typescriptlang.org/tsconfig/moduleDetection.html)
