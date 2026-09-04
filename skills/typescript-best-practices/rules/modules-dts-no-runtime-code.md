# Declaration files describe runtime values without implementing them

**When:** Editing `.d.ts`, `.d.mts` or `.d.cts` declaration files.

Literal constants and signatures are valid declarations:

```typescript
// file: api.d.ts
export const API_URL = "https://api.example.com";
export declare function parse(input: string): unknown;
```

The literal constant describes an existing value; this file emits no JavaScript. Not every initializer is forbidden. TypeScript permits unannotated ambient `const`/`readonly` literal declarations, including supported string, numeric, boolean and enum literals.

Runtime expressions and implementation bodies belong in `.ts` or `.js`:

```typescript
// file: invalid.d.ts
// @ts-expect-error A runtime computation cannot initialize an ambient constant.
export const API_URL = "https://" + "api.example.com";
// @ts-expect-error Ambient functions cannot have implementation bodies.
export function parse(input: string) { return JSON.parse(input); }
```

Declarations do not prove their promised values exist or match the implementation. Check authored declarations with declaration checking enabled; `skipLibCheck` may otherwise conceal their errors.

**Validation:** Both valid declarations and expected ambient errors checked with TypeScript 5.9.2, skipLibCheck false.

**Source:** [Workshop declaration-file exceptions](https://www.totaltypescript.com/workshops/typescript-pro-essentials/modules-scripts-and-declaration-files/declaration-files-in-typescript)
