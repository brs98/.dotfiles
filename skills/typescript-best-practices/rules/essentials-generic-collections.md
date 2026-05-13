# generic-collections

**When:** Using built-in collections like `Set`, `Map`, or `Array`.

## Bad
```typescript
const userIds = new Set();
userIds.add(1);
userIds.add("123"); // Allowed but wrong - mixing types

const userMap = new Map();
userMap.set("1", { name: "Max" }); // Key type inconsistent
userMap.set(1, "invalid");         // Value type inconsistent
```

## Good
```typescript
// Pass type argument to Set
const userIds = new Set<number>();
userIds.add(1);
userIds.add("123"); // Error: string not assignable to number

// Pass two type arguments to Map: <Key, Value>
const userMap = new Map<number, { name: string }>();
userMap.set(1, { name: "Max" });
userMap.set("1", { name: "Max" }); // Error: string key
```

## Why
Generic collections like `Set<T>` and `Map<K, V>` accept type arguments to constrain what they contain. Without them, TypeScript defaults to `unknown` or `any`.
