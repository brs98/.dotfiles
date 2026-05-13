# never-return-type

**When:** You have a helper function that always throws an error and want it to narrow types when used in expressions.

## Bad
```typescript
const throwError = (msg: string): undefined => {
  throw new Error(msg);
};

const id = params.id || throwError("No id"); // id is string | undefined
```

## Good
```typescript
const throwError = (msg: string): never => {
  throw new Error(msg);
};

const id = params.id || throwError("No id"); // id is string
```

## Why
A function returning `never` signals it never returns normally. TypeScript removes `never` from unions, so `string | never` becomes `string`. Use this for error-throwing helpers used in expressions.
