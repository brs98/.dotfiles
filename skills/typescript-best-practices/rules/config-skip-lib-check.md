# Choose the declaration-checking tradeoff

**When:** Declaration checking materially affects application build time or declaration dependencies conflict.

An application may choose this performance default:

```json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

Keeping it `false` is also valid. The flag skips checking declaration files, including your own `.d.ts` files, and can hide inconsistent declaration types. It does not stop TypeScript from using those declarations to check application code.

Diagnose dependency/version conflicts rather than assuming suppression repairs them. When authoring or publishing declarations, include a validation job with declaration checking enabled. Treat the workshop's application performance default as a tradeoff, not a universal measure of type safety.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript skipLibCheck](https://www.typescriptlang.org/tsconfig/skipLibCheck.html), [workshop declaration checking](https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don%27t-control/tsconfig-options-and-declaration-files/solution)
