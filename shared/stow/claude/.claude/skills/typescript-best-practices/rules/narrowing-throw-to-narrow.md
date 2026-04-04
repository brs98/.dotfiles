# throw-to-narrow

**When:** You want to narrow a type by throwing an error for invalid cases, guaranteeing the value exists after the throw.

## Bad
```typescript
const appElement = document.getElementById("app");
appElement.innerHTML = "Hello"; // Error: appElement possibly null
```

## Good
```typescript
const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("App element not found");
}
appElement.innerHTML = "Hello"; // appElement is HTMLElement
```

## Why
TypeScript understands that code after a throw statement is only reached if the throw didn't happen. This narrows nullable types to their non-null variants without type assertions.
