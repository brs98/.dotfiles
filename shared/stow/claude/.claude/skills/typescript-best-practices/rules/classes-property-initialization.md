# property-initialization

**When:** Class properties need default values.

## Bad
```typescript
class Counter {
  count: number;

  constructor() {
    this.count = 0; // Verbose initialization
  }
}
```

## Good
```typescript
class Counter {
  count = 0; // Direct initialization with inference

  increment() {
    this.count++;
  }
}
```

## Why
Initialize class properties directly with default values instead of in constructors. This is more concise and TypeScript infers the type from the initial value.
