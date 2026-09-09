# Use fresh-literal checking without assuming exact types

**When:** Catching misspelled or unintended fields when constructing an object with a known contract.

Structural assignment through a variable permits additional properties:

```typescript
type Options = { url: string };
function request(options: Options) { return options.url; }
const options = { url: "/", extra: "allowed by structural typing" };
request(options); // Valid: Options requires url, not an exact shape.
```

A fresh literal can be checked where it is constructed:

```typescript
type Options = { url: string };
function request(options: Options) { return options.url; }
// @ts-expect-error Fresh literal has an unexpected property.
request({ url: "/", extra: "oops" });
// @ts-expect-error Annotation checks the fresh literal.
const annotated: Options = { url: "/", extra: "oops" };
// @ts-expect-error satisfies also checks the fresh literal.
const checked = { url: "/", extra: "oops" } satisfies Options;
```

These checks do not create exact/sealed object types, strip extra runtime fields, or reject every key introduced through object spread. Index signatures and generic/contextual contracts also affect excess-property checking. Validate external data separately when runtime shape matters.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript excess property checks](https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks)
