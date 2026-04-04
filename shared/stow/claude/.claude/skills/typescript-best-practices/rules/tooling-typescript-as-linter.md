# typescript-as-linter

**When:** Using a bundler (Vite, esbuild, webpack, etc.) for transpilation.

## Bad
```json
// tsconfig.json
{
  "compilerOptions": {
    "outDir": "dist"
  }
}
// Both tsc AND bundler emit JavaScript - conflicts!
```

## Good
```json
// tsconfig.json
{
  "compilerOptions": {
    "noEmit": true
  }
}
```
```bash
# Type check only (no output)
tsc

# Bundler handles actual transpilation
vite build
```

## Why
When using modern bundlers, set `noEmit: true` so TypeScript only type-checks. The bundler (which is faster) handles transpilation. Avoids duplicate outputs and configuration conflicts.
