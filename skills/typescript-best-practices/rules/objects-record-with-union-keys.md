# record-with-union-keys

**When:** A lookup table must contain every member of a finite key union.

```typescript
type Status = "pending" | "success" | "error";
const messages = {
  pending: "Please wait",
  success: "Saved",
  error: "Try again",
} satisfies Record<Status, string>;

// @ts-expect-error A complete table requires an error entry.
const incomplete: Record<Status, string> = { pending: "Wait", success: "Saved" };

const wider = { ...messages, cancelled: "Cancelled" };
const table: Record<Status, string> = wider; // Extra properties can be assignable.
```

`Record` requires every key; it does not create an exact object type. Fresh object literals receive excess-property checking, including with `satisfies`; structurally compatible variables can have additional keys. Use `Partial<Record<Status, string>>` when missing entries are intentional, such as patches or partial caches.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type). TypeScript 5.5+, strict mode; satisfies requires TypeScript 4.9+.
