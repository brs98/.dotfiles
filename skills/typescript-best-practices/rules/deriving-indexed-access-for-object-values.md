# indexed-access-for-object-values

**When:** A type should track a particular property's type on an existing model.

```typescript
const config = { apiUrl: "https://api.example.com", timeout: 5000 } as const;
type Config = typeof config;
type ApiUrl = Config["apiUrl"]; // "https://api.example.com"
type Timeout = Config["timeout"]; // 5000
```

Indexed access extracts the property's type, including its literal values or optional `undefined`. `as const` preserves literal property values here. Use a broader independent type, such as `string` for arbitrary API URLs, when the consumer should not be coupled to this particular configuration.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/135-indexed-access-types.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
