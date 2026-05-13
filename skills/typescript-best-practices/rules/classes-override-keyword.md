# override-keyword

**When:** Overriding a method from a parent class.

## Bad
```typescript
class Animal {
  speak() { console.log("..."); }
}
class Dog extends Animal {
  speek() { console.log("Woof!"); } // Typo! Creates new method, doesn't override
}
```

## Good
```typescript
// tsconfig.json: "noImplicitOverride": true
class Animal {
  speak() { console.log("..."); }
}
class Dog extends Animal {
  override speak() { console.log("Woof!"); } // Explicit override
  override speek() { } // Error: no method to override
}
```

## Why
Enable `noImplicitOverride` in tsconfig and use `override` keyword when overriding parent methods. This catches typos and ensures you're actually overriding an existing method.
