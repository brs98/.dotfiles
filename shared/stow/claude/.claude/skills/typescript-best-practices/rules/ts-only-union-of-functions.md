# union-of-functions

**When:** Calling a function that could be one of several function types.

## Bad
```typescript
const logId = (obj: { id: string }) => console.log(obj.id);
const logName = (obj: { name: string }) => console.log(obj.name);

const loggers = [logId, logName];
loggers.forEach((func) => func({ id: "1" })); // Error!
```

## Good
```typescript
// Parameters must satisfy ALL signatures (intersection)
const logAll = (obj: { id: string; name: string }) => {
  loggers.forEach((func) => func(obj)); // OK - obj has both
};

// Or use a common base type
type Loggable = { id: string; name: string };
const logId = (obj: Loggable) => console.log(obj.id);
const logName = (obj: Loggable) => console.log(obj.name);
```

## Why
When you have a union of functions, parameters get intersected (must satisfy all). Design function signatures to have compatible parameter types when they'll be used together.
