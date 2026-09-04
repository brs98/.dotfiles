# Narrow by presence, then validate the value when necessary

**When:** Union variants differ by whether they contain a property.

```typescript
type ApiResponse = { data: { id: string } } | { error: string };
function getId(response: ApiResponse): string {
  if ("data" in response) return response.data.id;
  throw new Error(response.error);
}

function readUnknownId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("id" in value)) return;
  return typeof value.id === "string" ? value.id : undefined;
}

const options: { label?: string } = { label: undefined };
const present = "label" in options;                  // true
const defined = typeof options.label !== "undefined"; // false
```

Optional properties can occur in both branches of an `in` check. Presence does not establish a non-undefined value, a particular value type, or ownership: `in` also sees inherited properties. Do not replace `typeof obj.prop ===/!== "undefined"` with an existence check as though they were equivalent. Unknown receivers must first be narrowed to suitable non-null objects. Runtime property existence also does not prove membership in a static `keyof T` union.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook in-operator narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-in-operator-narrowing), [Workshop unknown validation](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/narrowing-unknown-in-a-large-conditional-statement).
