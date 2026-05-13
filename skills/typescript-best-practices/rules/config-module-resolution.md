# module-resolution

**When:** Configuring how TypeScript resolves import paths.

## Bad
```json
{
  "compilerOptions": {
    "module": "NodeNext"
  }
}
// Missing moduleResolution, or mismatched settings
```

## Good
```json
// When using tsc to transpile:
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}

// When using external bundler (Vite, webpack, esbuild):
{
  "compilerOptions": {
    "module": "preserve",
    "moduleResolution": "Bundler"
  }
}
```

## Why
`module: NodeNext` requires explicit `.js` extensions on imports and emulates Node.js behavior. `module: preserve` with `moduleResolution: Bundler` lets your bundler handle resolution without requiring extensions.
