# this-annotation

**When:** Attaching a method to an object where `this` context matters.

## Bad
```typescript
class Button {
  label = "Click me";
  handleClick = () => {
    console.log(this.label); // Arrow captures `this`, but can't be rebound
  };
}
// Arrow functions increase memory per instance
```

## Good
```typescript
function handleClick(this: { label: string }) {
  console.log(this.label);
}

const button = { label: "Submit", handleClick };
button.handleClick(); // Works - `this` is the button object
```

## Why
Use regular functions with a typed `this` parameter when the function will be called as a method. This allows `this` to be determined by call-site and uses less memory than arrow functions.
