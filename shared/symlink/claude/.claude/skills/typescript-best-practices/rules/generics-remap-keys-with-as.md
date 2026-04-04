# remap-keys-with-as

**When:** You need to rename or filter keys in a mapped type.

## Bad
```typescript
type Events = { click: () => void; hover: () => void };
// Can't easily create onX versions of these keys
```

## Good
```typescript
type Events = { click: () => void; hover: () => void };

type WithOnPrefix<T> = {
  [K in keyof T as `on${Capitalize<string & K>}`]: T[K];
};

type EventHandlers = WithOnPrefix<Events>;
// { onClick: () => void; onHover: () => void }
```

## Why
The `as` clause in mapped types lets you remap keys using template literals and type helpers like `Capitalize`, `Uppercase`, etc. This enables powerful naming transformations.
