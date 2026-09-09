# Dynamic and bound receivers

**When:** A callable depends on its receiver.

Use an explicit `this` parameter for a function intended to receive its object from the call site.

```typescript
function showLabel(this: { label: string }) { return this.label; }
const button = { label: "Submit", showLabel };
button.showLabel();
const bound = button.showLabel.bind(button);
bound();
```

Use an arrow field when callbacks must retain the instance:

```typescript
class Button {
  label = "Submit";
  showLabel = () => this.label;
}
const callback = new Button().showLabel;
callback();
```

A `this` annotation is erased and does not bind anything at runtime. Replacing a bound arrow with a prototype method can break detached callbacks. Arrow fields allocate per instance; choose based on binding and API needs.

**Source:** [Dynamic and bound receivers](https://www.typescriptlang.org/docs/handbook/2/classes.html#this-at-runtime-in-classes). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
