# no-unchecked-indexed-access

**When:** Accessing array elements or object properties by index without guaranteed existence.

## Bad
```typescript
// tsconfig.json: noUncheckedIndexedAccess not set
const array = [1, 2, 3];
const value = array[5]; // type: number (wrong - it's undefined!)
value.toFixed(2); // runtime error
```

## Good
```typescript
// tsconfig.json: "noUncheckedIndexedAccess": true
const array = [1, 2, 3];
const value = array[5]; // type: number | undefined
if (value !== undefined) {
  value.toFixed(2); // safe
}
```

## Why
Without this option, TypeScript assumes all index accesses return valid values, leading to runtime errors. This strictness setting forces you to handle potentially undefined values.
