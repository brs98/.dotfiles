# tsc-watch-mode

**When:** Developing TypeScript and want continuous feedback on type errors.

## Bad
```bash
# Manually running tsc after every change
tsc
# Make changes...
tsc
# Make more changes...
tsc
```

## Good
```bash
# Run once, watches for changes automatically
tsc --watch

# Or with tsconfig.json
tsc -w
```

## Why
`tsc --watch` incrementally recompiles on file changes, providing instant feedback on type errors. Much faster than running `tsc` manually after each edit.
