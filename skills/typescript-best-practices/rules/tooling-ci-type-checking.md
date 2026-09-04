# Require a real project typecheck in CI

**When:** A pipeline should reject type errors before publishing or deployment.

Inspect what the repository's existing build/check scripts actually do. A build may already typecheck; a transpile-only bundle may not. Command names alone do not establish coverage.

A package-local script for one application config:

```json
{
  "scripts": {
    "typecheck": "tsc --project tsconfig.app.json --noEmit"
  }
}
```

After checkout, runtime setup and the repository's locked dependency installation, run that script using its package manager. For an npm repository, the relevant steps might include:

```yaml
- run: npm ci
- run: npm run typecheck
- run: npm run build
- run: npm test
```

These are steps, not a complete workflow. Use the required framework checker when `.vue`/`.svelte` or generated framework types are involved. Check all owned configs or use the supported reference-build command; a root `tsc --noEmit` with `files: []` checks no referenced source. Prefer scripts that resolve the installed compiler to assuming a global `tsc` is on CI PATH. Propagate the compiler's nonzero exit status instead of printing a successful build after it fails.

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html), [workshop CI typechecking](https://www.totaltypescript.com/workshops/typescript-pro-essentials/typescript-in-the-build-process/typescript-in-a-cicd-system/exercise)
