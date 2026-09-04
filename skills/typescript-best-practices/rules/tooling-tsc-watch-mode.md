# Run the appropriate checker in watch mode

**When:** Continuous TypeScript feedback helps during editing.

Use the repository's package manager to run a local script, for example:

```json
{
  "scripts": {
    "typecheck:watch": "tsc --project tsconfig.app.json --noEmit --watch"
  }
}
```

`-w` is simply an alias for `--watch`; both use the selected config. For a project-reference build graph, use `tsc --build --watch` and retain that graph's output requirements. When tsc intentionally owns JavaScript/declaration output, omit `--noEmit` rather than disabling needed artifacts.

Watch mode reuses work between changes. Keep a finite typecheck command in CI so completion and exit status are unambiguous. See [project references](config-project-references.md).

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [TypeScript watch configuration](https://www.typescriptlang.org/docs/handbook/configuring-watch.html)
