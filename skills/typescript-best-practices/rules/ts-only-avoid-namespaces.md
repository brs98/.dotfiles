# Prefer ES modules for new application module boundaries

**When:** Organizing new application implementation code, rather than maintaining an intentional ambient or declaration-merging API.

```typescript
// file: geometry.ts
export function calculateArea(radius: number) {
  return Math.PI * radius ** 2;
}
```

ES modules are the JavaScript module standard and provide explicit import/export boundaries. Runtime namespaces remain valid TypeScript syntax but require the chosen transpiler to support their emit; moving an existing namespace changes its API and consumers.

Ambient namespaces such as `NodeJS.ProcessEnv` and namespaces used for declaration merging have a different purpose. Do not replace them with ES modules merely because they use `namespace`. Type-only namespaces and `declare global` are erased declarations, not runtime namespace objects. See [global augmentation](modules-augment-global-interfaces.md).

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript namespaces and modules](https://www.typescriptlang.org/docs/handbook/namespaces-and-modules.html), [workshop namespace merging](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/032-typescript-only-features/122-namespaces-can-declaration-merge.explainer.ts)
