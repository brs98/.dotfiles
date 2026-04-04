# lib-target-sync

**When:** Configuring which JavaScript features to use and emit.

## Bad
```json
{
  "compilerOptions": {
    "lib": ["ES2022"],
    "target": "ES5"
  }
}
// Using ES2022 APIs but targeting ES5 - APIs won't be polyfilled!
```

## Good
```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "target": "ES2022"
  }
}
```

## Why
TypeScript transforms syntax (optional chaining, nullish coalescing) but does NOT polyfill APIs (replaceAll, Promise.allSettled). Keep `lib` and `target` in sync to avoid using APIs unavailable in your target environment.
