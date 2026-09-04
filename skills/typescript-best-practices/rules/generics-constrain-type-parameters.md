# constrain-type-parameters

**When:** A generic must retain a caller's specific type while requiring some structure.

```typescript
type Result<T, E extends { message: string }> =
  | { success: true; data: T }
  | { success: false; error: E };

type ApiError = { message: string; status: number };
const result: Result<number, ApiError> = {
  success: false,
  error: { message: "Unavailable", status: 503 },
};
// @ts-expect-error Error types must provide a message.
type InvalidResult = Result<number, string>;
```

A constraint is the minimum structure; it does not erase additional properties. Use a generic when it preserves a meaningful relationship. A helper that only reads a message and always returns `string` can usually accept `{ message: string }` directly. Review fresh-object excess-property checks before changing an existing generic API.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/functions.html#guidelines-for-writing-good-generic-functions); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/083-designing-your-types/208-type-parameter-constraints.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
