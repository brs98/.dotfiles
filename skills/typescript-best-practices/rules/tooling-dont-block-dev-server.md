# Keep development feedback responsive

**When:** Choosing how a transpile-only dev server reports type errors. This is a development workflow choice; retain the required CI check.

One option is to run the server and checker separately, using package-local scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "typecheck:watch": "tsc --project tsconfig.app.json --noEmit --watch"
  }
}
```

Run `dev` and `typecheck:watch` in separate terminals with the repository's package manager. This lets runtime debugging continue while types are being corrected.

`vite-plugin-checker` is another valid option: it performs checking in a worker and can display an overlay. Its presence does not mean it blocks Vite's transform pipeline. Configure visibility and build behavior for the team's needs; do not remove a checker solely to follow a blanket “no plugins” rule. A successful dev-server start or transpile-only bundle does not imply the typecheck passed.

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [Vite checking recommendations](https://vite.dev/guide/features.html#transpile-only), [vite-plugin-checker introduction](https://vite-plugin-checker.netlify.app/introduction/introduction)
