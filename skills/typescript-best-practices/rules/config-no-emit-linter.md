# Use noEmit for a typecheck-only invocation

**When:** This TypeScript invocation should check types while a separate tool owns the corresponding output.

Add this to the existing environment-specific configuration:

```json
{
  "compilerOptions": {
    "noEmit": true
  }
}
```

For example, a package-local script can check one application config:

```json
{
  "scripts": {
    "typecheck": "tsc --project tsconfig.app.json --noEmit"
  }
}
```

This is type checking, not a general-purpose linter. `noEmit` disables JavaScript, declaration and source-map output for that invocation. It does **not** make a bundler generate declarations.

Keep output enabled when tsc intentionally produces JavaScript or declarations, possibly using a separate [declaration build](config-declaration-files.md). The presence of a bundler dependency or `moduleResolution: bundler` does not prove that all tsc emit is unwanted. A solution config's `tsc --noEmit` also does not traverse project references; use the project's actual checking/build commands.

**Validation:** Config options checked with TypeScript 5.9.2; script paths are project-specific examples.

**Source:** [TypeScript noEmit](https://www.typescriptlang.org/tsconfig/noEmit.html)
