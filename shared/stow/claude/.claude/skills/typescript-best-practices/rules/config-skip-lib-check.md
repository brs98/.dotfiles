# skip-lib-check

**When:** Configuring any TypeScript project.

## Bad
```json
{
  "compilerOptions": {
    "skipLibCheck": false
  }
}
// Type-checks all .d.ts files including node_modules
```

## Good
```json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

## Why
`skipLibCheck` skips type checking of declaration files (.d.ts), significantly speeding up compilation. Third-party declaration files may have conflicts or errors outside your control that would otherwise block your build.
