# Map presence and values

**When:** Reading an entry that might not be present.

Read once and narrow the returned value. `map.has(key)` does not generally narrow a later `map.get(key)` result.

```typescript
function increment(map: Map<string, number>, key: string) {
  const value = map.get(key);
  if (value === undefined) return;
  map.set(key, value + 1);
}
```

If `undefined` is a valid stored value, presence and definedness are different questions. Keep `has` when that distinction matters, or use a tagged stored value/lookup result. Mutations, callbacks and arbitrary calls may invalidate assumptions about later reads; do not add `!` without a justified invariant.

**Source:** [Map presence and values](https://www.typescriptlang.org/docs/handbook/2/narrowing.html). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
