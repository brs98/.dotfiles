# Find usable package types before writing replacements

**When:** A dependency has no usable types under the project's actual module resolution.

Check its bundled declarations and package exports first. If types are absent, check DefinitelyTyped for a matching package. Use this repository's package manager and existing dependency conventions; for example, in an npm application:

```bash
npm install --save-dev @types/lodash
```

The conventional mapping is `package` → `@types/package` and `@scope/name` → `@types/scope__name`. Package subpaths use the root package's type package; Node core modules use `@types/node`, not packages named after individual built-ins.

Development dependencies are normal for application type checking. If published declarations expose a dependency's external types, arrange dependencies so consumers receive the needed declarations too. Package authors should verify the published artifact from a consumer project. Manual declarations remain appropriate when no maintained or accurate types exist; declarations for an external-module augmentation are not replacement library typings.

**Validation:** Dependency guidance source-reviewed 2026-09-04; installation command is an npm example, not executed.

**Source:** [TypeScript declaration publishing and dependencies](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)
