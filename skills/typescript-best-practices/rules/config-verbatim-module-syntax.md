# Make import erasure explicit

**When:** You want source import syntax to make emitted dependencies clear, and the source syntax matches the intended module format.

With `verbatimModuleSyntax: true` (TypeScript 5.0+):

```typescript
// file: types.ts
export interface User { name: string; }
export const version = "1";
```

```typescript
// file: consumer.ts
import type { User } from "./types.js"; // Entire import erased.
import { version } from "./types.js"; // Runtime import retained.
const user: User = { name: "Ada" };
console.log(version, user.name);
```

An all-inline-type statement, `import { type User } from "./types.js"`, may leave `import {} from "./types.js"` and still execute the module's side effects. Use `import type` when the whole statement should disappear.

The flag also enforces agreement between ESM/CommonJS source syntax and output format instead of silently rewriting ESM syntax to CommonJS. A class is a value export even when a particular consumer uses it only as a type; use `import type` for that consumer if it needs no runtime class value.

**Validation:** Multi-file example and import erasure checked with TypeScript 5.9.2, ESNext modules and verbatimModuleSyntax enabled.

**Source:** [TypeScript verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
