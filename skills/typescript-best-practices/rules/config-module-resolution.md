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
