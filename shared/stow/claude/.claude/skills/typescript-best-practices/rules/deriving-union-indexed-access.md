# union-indexed-access

**When:** You need a union of specific values (not all) from an object type.

## Bad
```typescript
const EVENTS = { click: 1, hover: 2, focus: 3, blur: 4 } as const;
type MouseEvent = 1 | 2; // Magic numbers, not connected to source
```

## Good
```typescript
const EVENTS = { click: 1, hover: 2, focus: 3, blur: 4 } as const;
type Events = typeof EVENTS;
type MouseEvent = Events["click" | "hover"]; // 1 | 2 - derived subset
```

## Why
Passing a union of keys to indexed access returns a union of the corresponding values. This creates a derived subset that stays in sync with the source object.
