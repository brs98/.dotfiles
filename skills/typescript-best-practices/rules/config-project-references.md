# Use project references for an intended build graph

**When:** Separate TypeScript projects should be built incrementally in dependency order. Multiple configs or a workspace alone do not require this design.

A solution config can list its projects:

```json
{
  "files": [],
  "references": [{ "path": "./library" }, { "path": "./application" }]
}
```

A library config for tsc's referenced declaration-output workflow:

```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

Record actual dependencies in each consuming project's `references`, not only in the solution root. Referenced library dependencies must provide the required composite/declaration outputs; disabling emit is not interchangeable with this workflow. Frameworks may use separate solution-style configurations for independent type checking; follow their supported commands.

Use a package-local script such as `"build:types": "tsc --build"` or `"watch:types": "tsc --build --watch"`. `tsc --noEmit` on a root containing `files: []` does not traverse the graph. Independently checking unrelated browser/server configs is also valid. TypeScript resolves inherited paths relative to their defining config; `references` are not inherited through `extends`.

**Validation:** Config examples parsed with TypeScript 5.9.2; reference builds verified using separate library/application fixtures.

**Source:** [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html), [configuration inheritance](https://www.typescriptlang.org/tsconfig/extends.html)
