# declare-module-wildcard-for-assets

**When:** Importing non-code files (images, CSS, JSON, etc.).

## Bad
```typescript
import logo from './logo.png';
// Error: Cannot find module './logo.png'
```

## Good
```typescript
// assets.d.ts
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// Now imports work
import logo from './logo.png'; // string (URL)
import styles from './app.css'; // { [key: string]: string }
```

## Why
Wildcard module declarations (`*.ext`) type all imports matching the pattern. The actual values come from your bundler (webpack, vite, etc.) - TypeScript just needs to know the shape.

## Note
If your project includes `"types": ["vite/client"]` in tsconfig, Vite already provides `declare module` declarations for common asset types (`.css`, `.svg`, `.png`, `.jpg`, `.webp`, etc.). No manual declarations are needed for these extensions.
