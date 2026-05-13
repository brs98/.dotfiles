# declaration-files

**When:** Building a library or publishing to NPM and need consumers to have type information.

## Bad
```json
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

## Good
```json
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  }
}
```

## Why
Without `declaration: true`, TypeScript won't generate `.d.ts` files, making your library unusable in TypeScript projects. `declarationMap: true` enables "go to definition" to navigate to source files instead of declaration files in monorepos.

**Does not apply when `noEmit: true`.** Projects using `noEmit` delegate all emit (including `.d.ts` generation) to a bundler, so TypeScript's `declaration` flag is irrelevant.
