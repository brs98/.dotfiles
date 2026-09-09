# Choose an appropriate TypeScript script runner

**When:** Running development scripts without a separate output build is useful.

`tsx` is an option when the repository supports it. Install development tooling with the project's package manager, then use a package-local script:

```json
{
  "scripts": {
    "script:example": "tsx scripts/example.ts"
  }
}
```

`tsx` transpiles and executes TypeScript without type checking. Keep a separate checker covering the script and its intended runtime globals. Compiling with the project config and then running the emitted JavaScript is also valid, especially for published/deployed output.

Supported Node versions can run erasable TypeScript directly, for example `node scripts/example.ts`. Native type stripping ignores `tsconfig.json`, requires runtime-resolvable import paths, and does not transform enums, parameter properties, runtime namespaces or JSX. Use `erasableSyntaxOnly` (TypeScript 5.8+) to check relevant syntax restrictions when choosing that runtime; still verify the installed Node version and its documented support. Do not replace a working runner solely because native support exists.

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [Node TypeScript execution](https://nodejs.org/api/typescript.html), [workshop tsx](https://www.totaltypescript.com/workshops/typescript-pro-essentials/typescript-in-the-build-process/quickly-create-scripts-with-tsx)
