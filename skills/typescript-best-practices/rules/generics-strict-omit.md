# strict-omit

**When:** An API should reject keys that do not exist on a known source type.

```typescript
type User = { id: string; name: string; email: string };
type LooseUser = Omit<User, "emial">; // Valid, but email remains.

type StrictOmit<T, K extends keyof T> = Omit<T, K>;
type PublicUser = StrictOmit<User, "email">;
// @ts-expect-error Misspelled key does not exist on User.
type InvalidPublicUser = StrictOmit<User, "emial">;
```

Built-in `Omit` accepts any `PropertyKey` (`string | number | symbol`), so absent keys are ignored. `StrictOmit` is an optional wrapper for typo protection; permissive omission is sometimes intentional.

The wrapper does not distribute over unions. `keyof` a union exposes keys shared by its members. If variant-specific properties must survive, see [distributive Omit](objects-distributive-omit-for-unions.md).

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys). TypeScript 5.5+, strict mode; examples target ES2022.
