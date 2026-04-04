# outdir-for-compiled-files

**When:** Setting up a TypeScript project that compiles to JavaScript.

## Bad
```
src/
  index.ts
  index.js      <- Compiled file mixed with source
  utils.ts
  utils.js      <- Hard to distinguish source from output
```

## Good
```json
// tsconfig.json
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```
```
src/
  index.ts
  utils.ts
dist/           <- All compiled output here
  index.js
  utils.js
```
```gitignore
# .gitignore
dist/
```

## Why
Separating compiled output into `dist/` keeps your project organized and makes it easy to clean builds, gitignore output, and distinguish source from artifacts.
