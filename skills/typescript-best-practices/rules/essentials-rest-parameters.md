# rest-parameters

**When:** A function accepts a variable number of arguments using `...`.

## Bad
```typescript
function concatenate(...strings) {
  // Error: Rest parameter 'strings' implicitly has an 'any[]' type
  return strings.join("");
}
```

## Good
```typescript
// Annotate rest parameter as an array type
function concatenate(...strings: string[]) {
  return strings.join("");
}

concatenate("Hello", " ", "World"); // "Hello World"

// Works with other types too
function sum(...numbers: number[]) {
  return numbers.reduce((a, b) => a + b, 0);
}
```

## Why
Rest parameters collect multiple arguments into an array. Annotate them with the array type (`Type[]`) to get proper type checking on each argument passed.
