# Compatibility link: TypeScript as a type checker

This rule is maintained in [config-no-emit-linter](config-no-emit-linter.md).

Use `noEmit` only for a checking invocation whose output is owned elsewhere. It does not cause a bundler to generate declarations; retain intentional declaration-only or JavaScript emit. The canonical rule covers those boundaries and project-reference checking.

**Validation:** Compatibility rule retained; canonical compiler guidance validated in config-no-emit-linter.

**Source:** [TypeScript noEmit](https://www.typescriptlang.org/tsconfig/noEmit.html)
