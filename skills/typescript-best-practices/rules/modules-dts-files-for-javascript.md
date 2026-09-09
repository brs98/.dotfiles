# Describe JavaScript that cannot be changed

**When:** Existing JavaScript needs a TypeScript declaration surface and modifying or converting the implementation is not appropriate.

```javascript
// file: utils.js
export function add(a, b) { return a + b; }
```

```typescript
// file: utils.d.ts
export function add(a: number, b: number): number;
```

```typescript
// file: consumer.ts
import { add } from "./utils.js";
const total: number = add(1, 2);
```

TypeScript's module resolution can select the sibling declaration for the JavaScript import. Package exports, module format and extensions still determine which files resolve; ship the declaration and expose it through the applicable package type entry points.

These declarations are trusted, not checked against the JavaScript implementation. Verify the API behavior separately. If editing JavaScript is possible, JSDoc with `allowJs`/`checkJs` can provide checking closer to the implementation.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [Workshop JavaScript declarations](https://www.totaltypescript.com/workshops/typescript-pro-essentials/modules-scripts-and-declaration-files/using-declaration-files-with-javascript-in-typescript/solution), [TypeScript JavaScript checking](https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html)
