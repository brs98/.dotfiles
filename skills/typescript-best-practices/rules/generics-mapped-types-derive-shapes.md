# mapped-types-derive-shapes

**When:** You need to transform all properties of a type systematically.

## Bad
```typescript
type User = { name: string; age: number };
type UserGetters = {
  getName: () => string;
  getAge: () => number;
}; // Manual, must update when User changes
```

## Good
```typescript
type User = { name: string; age: number };
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
type UserGetters = Getters<User>;
// { getName: () => string; getAge: () => number }
```

## Why
Mapped types `[K in keyof T]` iterate over keys to create derived types. Combined with `as` clause and template literals, you can transform both keys and values.
