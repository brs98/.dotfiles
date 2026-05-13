# excess-property-checks

**When:** Expecting TypeScript to catch extra properties on objects.

## Bad
```typescript
type Options = { url: string };

const options = { url: "/", extra: "oops" };
fetch(options); // No error - extra silently allowed!
```

## Good
```typescript
type Options = { url: string };

// Option 1: Inline object literal - error caught
fetch({ url: "/", extra: "oops" }); // Error: 'extra' does not exist

// Option 2: Annotate the variable
const options: Options = { url: "/", extra: "oops" }; // Error caught
```

## Why
TypeScript only performs excess property checking on direct object literals, not on variables. Use inline objects or add explicit type annotations to catch unwanted properties.
