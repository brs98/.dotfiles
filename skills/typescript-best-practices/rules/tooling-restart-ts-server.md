# Restart stale language-service state after checking the project context

**When:** Editor diagnostics or completions disagree with the actual project after configuration, dependency or generated-file changes.

In VS Code, run **TypeScript: Restart TS Server** from the Command Palette. Other editors may expose a corresponding language-server restart. Check that the editor uses the intended workspace TypeScript version and project configuration.

A restart refreshes analysis without reinstalling dependencies or restarting the machine. It is troubleshooting for stale state, not evidence that a compiler error has been fixed. Compare with the repository's real typecheck command; if the error persists, diagnose the source/configuration rather than repeatedly restarting.

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [VS Code TypeScript compiler versions](https://code.visualstudio.com/docs/typescript/typescript-compiling#_using-newer-typescript-versions)
