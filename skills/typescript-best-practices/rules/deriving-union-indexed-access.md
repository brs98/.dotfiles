# union-indexed-access

**When:** A type should track selected property values from an object type.

```typescript
const EVENTS = { click: 1, hover: 2, focus: 3, blur: 4 } as const;
type Events = typeof EVENTS;
type MouseEventCode = Events["click" | "hover"]; // 1 | 2
```

A union of keys extracts the union of those property types. Combining `Events["click"] | Events["hover"]` into one indexed access is an optional equivalent simplification. Keep the selected keys when the consumer is a subset; use `keyof` only when it should include every property and future additions.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/136-pass-unions-to-indexed-access-types.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
