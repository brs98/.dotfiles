# project-references

**When:** Managing multiple tsconfig files in a monorepo or multi-environment project.

## Bad
```json
// package.json - manually running multiple tsc commands
{
  "scripts": {
    "dev": "run-p dev:*",
    "dev:client": "tsc --project ./client/tsconfig.json --watch",
    "dev:server": "tsc --project ./server/tsconfig.json --watch"
  }
}
```

## Good
```json
// Root tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./client" },
    { "path": "./server" }
  ]
}

// client/tsconfig.json and server/tsconfig.json
{
  "compilerOptions": {
    "composite": true
  }
}
```

## Why
Project references with `tsc -b` enable incremental builds across multiple configurations, proper dependency ordering, and single-command builds. `composite: true` is required for referenced projects.
