# typeof-for-object-keys

**When:** A key union should follow all the statically known keys of an accessible runtime object.

```typescript
const routes = { home: "/", about: "/about", contact: "/contact" };
type Route = keyof typeof routes; // "home" | "about" | "contact"
```

`keyof typeof` derives the key union without `as const`. A const assertion changes literal values and readonly properties, not the ordinary object literal key names here. Derive the union when adding a source key should expand the consumer's contract. Index signatures can broaden `keyof` to string/number/symbol domains, so this is not always a finite list of strings.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html). TypeScript 5.5+, strict mode; examples target ES2022.
