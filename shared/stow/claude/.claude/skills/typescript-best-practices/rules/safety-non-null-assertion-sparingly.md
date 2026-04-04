# non-null-assertion-sparingly

**When:** Using `!` to tell TypeScript a value isn't null/undefined.

## Bad
```typescript
function process(items: string[] | undefined) {
  items!.forEach(item => console.log(item)); // Crashes if undefined
}
```

## Good
```typescript
function process(items: string[] | undefined) {
  if (!items) return;
  items.forEach(item => console.log(item)); // Safely narrowed
}

// Or extract to const for narrowing:
const element = document.getElementById("app");
if (element) {
  element.classList.add("active"); // Narrowed, no ! needed
}
```

## Why
Non-null assertions (`!`) bypass TypeScript's safety and can cause runtime crashes. Prefer proper narrowing with conditionals or early returns.
