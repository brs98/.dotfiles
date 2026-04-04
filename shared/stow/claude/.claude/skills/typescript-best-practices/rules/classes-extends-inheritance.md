# extends-inheritance

**When:** Multiple classes share common functionality that should be inherited.

## Bad
```typescript
class Dog {
  name: string;
  constructor(name: string) { this.name = name; }
  eat() { console.log(`${this.name} eats`); }
}
class Cat {
  name: string;
  constructor(name: string) { this.name = name; }
  eat() { console.log(`${this.name} eats`); } // Duplicated!
}
```

## Good
```typescript
class Animal {
  constructor(public name: string) {}
  eat() { console.log(`${this.name} eats`); }
}
class Dog extends Animal {
  bark() { console.log("Woof!"); }
}
class Cat extends Animal {
  meow() { console.log("Meow!"); }
}
```

## Why
`extends` allows classes to inherit properties and methods from a parent class, eliminating duplication. Child classes can add their own members or override inherited ones.
