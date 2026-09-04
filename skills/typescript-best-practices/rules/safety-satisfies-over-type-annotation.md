# Choose satisfies when the initializer's shape is the contract

**When:** A fresh literal must satisfy a target shape while keeping its known property names. Use an annotation when the value should expose a broader contract.

```typescript
const config = {
  apiUrl: "https://api.example.com",
  env: "production",
} satisfies Record<string, string>;

const url: string = config.apiUrl; // string, not the literal URL
// @ts-expect-error The inferred object has only its known keys.
config.typo;

// A dictionary intended to gain dynamic keys needs its wider annotation.
const labels: Record<string, string> = { home: "Home" };
labels.about = "About";
const missing: string | undefined = labels["missing"];

// An optional member that will be assigned later also needs the wider shape.
const options: { name: string; port?: number } = { name: "app" };
options.port = 3000;
```

`satisfies` (TS 4.9+) checks assignability and provides contextual typing. It does not retain every literal value, add omitted optional properties, or make a value readonly. Its contextual typing can affect inference, including boolean and literal-union values. Replacing an annotation can therefore restrict later writes or remove intended members. Nested empty containers may also still need context. For an intentionally readonly literal, see [as const with satisfies](safety-satisfies-with-as-const.md).

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [TS 4.9 satisfies](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator), [Workshop known config keys](https://www.totaltypescript.com/workshops/typescript-pro-essentials/annotations-and-assertions/using-satisfies-with-keyof-and-typeof-in-typescript/solution).
