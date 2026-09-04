# parameters-for-function-args

**When:** A tuple or argument type should deliberately follow an existing function signature.

```typescript
function log(message: string, level: "info" | "warn" | "error") {
  return `${level}: ${message}`;
}
type LogArgs = Parameters<typeof log>;
// [message: string, level: "info" | "warn" | "error"]
type Level = LogArgs[1]; // "info" | "warn" | "error"
const queued: LogArgs = ["Saved", "info"];
log(...queued);
```

`Parameters` retains parameter optionality and rest structure. It extracts the last overload signature, not every call signature; generic parameter types may become `unknown`. Check these details before replacing a handwritten tuple. Keep independent domain contracts separate, and do not make a function's own parameter annotation circular by deriving it from that function.

For an annotated function variable, inspect the variable's declared signature. An implementation may accept fewer arguments than that signature exposes; `Parameters<typeof fn>` can therefore contain extra optional slots and have a different tuple length from the implementation's parameters.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/utility-types.html#parameterstype). TypeScript 5.5+, strict mode; examples target ES2022.
