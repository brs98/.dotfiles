# Prefer regular modules for authored application types

**When:** Choosing where to store application types that do not describe a special ambient integration.

```typescript
// file: types.ts
export interface User {
  id: string;
  name: string;
}
```

A `.ts` module is a straightforward default for authored application types. With `skipLibCheck: true`, errors in your own `.d.ts` files can be skipped too; moving an application model there should not silently weaken its validation.

Exported interfaces/type aliases in `.d.ts` are nonetheless valid and common in JavaScript-facing or generated declaration surfaces. Intentional global declarations and type-only packages are also legitimate. The file extension is an organization choice tied to what the file represents; do not move declarations solely because they contain an interface, alias or enum.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [Workshop declaration-file organization](https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don%27t-control/should-you-use-declaration-files-to-store-your-types/exercise), [TypeScript declaration-file overview](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
