# Produce and publish library declarations deliberately

**When:** Consumers need type information for JavaScript distributed by a library.

These settings add to the existing host/module configuration; they do not replace it.

When tsc owns JavaScript and declaration output:

```json
{
  "compilerOptions": {
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

When a bundler produces JavaScript, a separate declaration build can still use tsc:

```json
{
  "compilerOptions": {
    "strict": true,
    "rootDir": "src",
    "declarationDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": true,
    "noEmit": false
  },
  "include": ["src"]
}
```

`noEmit: true` disables all this invocation's output; it does not delegate declaration generation. `composite: true` defaults declaration emit on. A library may instead ship verified handwritten or separately generated declarations.

Publish the declaration files and wire `types` and applicable package `exports` conditions to the real artifacts. Missing declarations reduce consumer type information; they do not inherently prevent JavaScript use. Declaration maps improve source navigation when mapped sources are accessible to consumers.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript declaration publishing](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html), [emitDeclarationOnly](https://www.typescriptlang.org/tsconfig/emitDeclarationOnly.html)
