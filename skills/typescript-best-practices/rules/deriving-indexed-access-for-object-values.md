# indexed-access-for-object-values

**When:** A type should track a particular property's type on an existing model.

```typescript
const config = { apiUrl: "https://api.example.com", timeout: 5000 } as const;
type Config = typeof config;
type ApiUrl = Config["apiUrl"]; // "https://api.example.com"
type Timeout = Config["timeout"]; // 5000
```

Indexed access extracts the property's type, including its literal values or optional `undefined`. `as const` preserves literal property values here. Use a broader independent type, such as `string` for arbitrary API URLs, when the consumer should not be coupled to this particular configuration.

`T[keyof T]` includes values from all index signatures as well as named properties. Symbol and template-pattern signatures, including inherited ones, may introduce types absent from the named properties. Check the complete value domain before replacing a handwritten union:

```typescript
interface Source {
  name: string;
  count: number;
  [key: symbol]: boolean;
}
type NamedValues = Source["name" | "count"]; // string | number
type AllValues = Source[keyof Source]; // string | number | boolean
const extraValue: AllValues = true;
// @ts-expect-error The named-property contract excludes booleans.
const namedValue: NamedValues = true;
```

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/135-indexed-access-types.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
