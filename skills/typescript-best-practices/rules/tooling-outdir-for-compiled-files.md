# Separate compiler output when the project wants an output directory

**When:** tsc emits JavaScript or declarations and adjacent source/output files would make artifacts harder to manage.

```json
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

This preserves the source directory structure beneath `dist`. Choose `rootDir` to match the real source layout, not a guessed convention. It controls output structure; `include`/`files` control source selection.

Ignoring generated output in Git is a repository policy, not a compiler requirement:

```gitignore
dist/
```

`outDir` is irrelevant to a `noEmit` invocation. `moduleResolution: bundler` does not disable emit, and declaration-only output may also need `outDir` or `declarationDir`. Adjacent output or an `outFile` bundle can be intentional alternatives.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript outDir](https://www.typescriptlang.org/tsconfig/outDir.html), [rootDir](https://www.typescriptlang.org/tsconfig/rootDir.html)
