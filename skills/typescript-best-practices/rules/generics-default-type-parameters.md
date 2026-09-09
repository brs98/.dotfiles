# default-type-parameters

**When:** A generic type has an intentional common case that should work without every type argument.

```typescript
type User = { name: string };
type CustomError = { message: string; code: number };
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

const result: Result<User> = { success: true, data: { name: "Alice" } };
const custom: Result<User, CustomError> = {
  success: false,
  error: { message: "Unavailable", code: 503 },
};
```

Defaults reduce boilerplate when a common case exists; they are not required for every generic. Required type parameters precede defaulted ones, and each default must satisfy its constraint.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-parameter-defaults); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/083-designing-your-types/207-default-type-parameters.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
