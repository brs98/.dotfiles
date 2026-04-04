# tsx-for-scripts

**When:** Running TypeScript scripts, migrations, or utilities without a build step.

## Bad
```bash
# Compile first, then run
tsc scripts/migrate.ts --outDir tmp
node tmp/migrate.js
rm -rf tmp
```

## Good
```bash
# Install tsx
npm install -D tsx

# Run TypeScript directly
npx tsx scripts/migrate.ts

# Or add to package.json
{
  "scripts": {
    "migrate": "tsx scripts/migrate.ts"
  }
}
```

## Why
`tsx` runs TypeScript files instantly without compilation steps. Perfect for scripts, database migrations, and one-off utilities. Much faster iteration than compiling first.
