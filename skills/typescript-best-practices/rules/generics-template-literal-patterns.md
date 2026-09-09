# template-literal-patterns

**When:** A typed domain API should accept strings matching a known pattern.

```typescript
type Route = `/${string}`;
function navigate(route: Route) {
  return route;
}
navigate("/users");
// @ts-expect-error Missing the leading slash.
navigate("users");
```

Template literal types constrain assignable strings at compile time. They do not validate runtime input, and assertions or `any` can bypass the check. Keep raw validation inputs as `unknown` or `string` and validate them before calling a domain API. `${number}` follows TypeScript's numeric-string rules; it is not a general replacement for a domain-specific parser or regular expression.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/083-designing-your-types/210-template-literal-types.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
