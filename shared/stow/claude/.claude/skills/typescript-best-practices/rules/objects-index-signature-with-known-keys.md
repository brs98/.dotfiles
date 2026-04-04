# index-signature-with-known-keys

**When:** You need an object with some required keys plus arbitrary additional keys.

## Bad
```typescript
type Scores = { [key: string]: number };
// No enforcement of required keys like "math" or "english"
```

## Good
```typescript
type Scores = {
  math: number;
  english: number;
  [key: string]: number;
};
// Required keys enforced, additional keys allowed
```

## Why
Combining explicit properties with an index signature gives you the best of both worlds: required properties are enforced while still allowing arbitrary additional properties of the same type.
