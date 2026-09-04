# Checked overrides

**When:** A class deliberately overrides a base member.

Mark the relationship with `override`; enable `noImplicitOverride` to require that marker on actual overrides.

```typescript
class Animal { speak() { return "sound"; } }
class Dog extends Animal {
  override speak() { return "woof"; }
  // @ts-expect-error No base member has this name.
  override speek() { return "typo"; }
}
```

The flag cannot infer intent: a new unmarked `speek()` method is valid even under `noImplicitOverride`. Static and instance members are separate contracts. Inherited members can originate in another file or further up the hierarchy.

**Source:** [Checked overrides](https://www.typescriptlang.org/tsconfig/noImplicitOverride.html). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
