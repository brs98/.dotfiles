# ci-type-checking

**When:** Setting up CI/CD pipelines for TypeScript projects.

## Bad
```yaml
# .github/workflows/ci.yml
jobs:
  build:
    steps:
      - run: npm run build
      # No type checking - type errors slip into production
```

## Good
```yaml
# .github/workflows/ci.yml
jobs:
  build:
    steps:
      - run: npm ci
      - run: tsc --noEmit    # Type check - fails pipeline on errors
      - run: npm run build
      - run: npm test
```

## Why
Always run `tsc` in CI to catch type errors before deployment. Local development may allow running with errors, but CI should enforce type safety as a quality gate.
