# Match module resolution to the execution environment

**When:** Choosing import resolution and module emit settings. Start with the runtime or framework that will execute the output.

For Node's module system, this is valid; `NodeNext` supplies the matching resolution default:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "strict": true
  }
}
```

For a bundler that supports preserved imports, this is one suitable configuration (TypeScript 5.4+):

```json
{
  "compilerOptions": {
    "module": "preserve",
    "moduleResolution": "bundler",
    "noEmit": true
  }
}
```

`preserve` also defaults to bundler resolution; spelling it out is optional. Preserve the framework's supported settings rather than changing them solely because `tsc` emits or does not emit.

Node ESM normally needs runtime extensions on **relative ESM imports**, such as `./utils.js` for emitted `utils.ts`. That rule is not a blanket requirement for package imports or Node CommonJS. Native Node TypeScript execution has different source-extension requirements; see [script execution](tooling-tsx-for-scripts.md). Bundler resolution may accept paths that will not work when a published library's external imports run directly in Node. Validate the consumer environment too.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript module reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html), [workshop NodeNext lesson](https://www.totaltypescript.com/workshops/typescript-pro-essentials/configuring-typescript/module-nodenext-with-extensions)

Under NodeNext, each file’s ESM/CommonJS format depends on the nearest package.json `"type"` and its extension: `.mts` is ESM and `.cts` is CommonJS. Align the emitted package layout as well as compiler options. See [Node module format detection](https://www.typescriptlang.org/docs/handbook/modules/reference.html#module-format-detection).

## Choose settings by host and output owner

| Environment | Resolution and output decision |
| --- | --- |
| Bundled browser application | Follow the framework's bundler resolution and module settings; use noEmit for the checker when the bundler owns JS output. Include DOM libraries only where browser globals exist. |
| Node application emitting JS | Match Node's per-file module format and runtime extensions. Let tsc emit when it owns the output; include the matching Node host declarations. |
| Published library | Check the consumer's module environment as well as the build tool. Produce JS and declarations through explicitly owned builds and validate the published entry points. |
| Native type-stripping execution | Follow the runtime's source-extension and syntax rules; erasableSyntaxOnly can reject unsupported transforming syntax. Type stripping does not run the type checker. |
| Multiple projects | Use references when projects form an intended build graph; otherwise run the relevant independent configs explicitly. |

`moduleDetection: "force"` makes implementation files modules without adding imports; it does not convert ambient declaration scripts. Use `extends` for shared settings while respecting defining-file-relative paths and child overrides. In an extends array, later bases take precedence; references are not inherited. Inspect the effective config with the project's `tsc --showConfig`.

`resolveJsonModule` provides inferred types for imported JSON when the host supports those imports; runtime import attributes and loader requirements remain separate. `sourceMap` helps debug emitted JS; `declarationMap` supports navigation from published declarations to their sources. Neither belongs in every checking-only config.

Related sources: [moduleDetection](https://www.typescriptlang.org/tsconfig/moduleDetection.html), [extends](https://www.typescriptlang.org/tsconfig/extends.html), [resolveJsonModule](https://www.typescriptlang.org/tsconfig/resolveJsonModule.html), [sourceMap](https://www.typescriptlang.org/tsconfig/sourceMap.html).
