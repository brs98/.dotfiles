# Rename symbols with semantic tooling

**When:** Renaming a variable, function, type or imported binding across its known references.

Use **Rename Symbol** in the editor/LSP (typically F2 in VS Code), inspect its preview, then verify the resulting diff. It follows the selected binding instead of replacing every textual match; unrelated same-named symbols should remain unchanged.

A semantic rename can update references across the loaded project, but cannot guarantee updates to external consumers, dynamic string lookups, generated contracts or another package's public API usage. Treat exported names as API changes when appropriate and run the relevant checks. Plain search remains useful to review those non-semantic references.

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [VS Code TypeScript refactoring](https://code.visualstudio.com/docs/typescript/typescript-refactoring)
