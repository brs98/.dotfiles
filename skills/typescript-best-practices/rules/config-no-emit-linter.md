# no-emit-linter

**When:** Using TypeScript only for type checking while another tool handles transpilation.

## Bad
```json
{
  "compilerOptions": {
    "outDir": "dist"
  }
}
// TypeScript emits JS files that conflict with your bundler's output
```

## Good
```json
{
  "compilerOptions": {
    "module": "preserve",
    "noEmit": true
  }
}
```

## Why
`noEmit: true` turns TypeScript into a linter-only tool. Use this when Vite, Next.js, esbuild, or another bundler handles your transpilation to avoid duplicate outputs and configuration conflicts.
