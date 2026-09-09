# Navigate by symbol identity

**When:** Locating the declaration or references for a specific binding.

Use the editor/LSP's **Go to Definition** or **Find References** command. Semantic navigation distinguishes unrelated bindings that happen to have the same name and can follow imports across files.

With typical VS Code keymaps, F12 invokes Go to Definition and Shift+F12 invokes Find References. Cmd+Click on macOS or Ctrl+Click on Windows/Linux commonly navigates too; bindings can be customized. Agents should use available semantic tools rather than emulate a particular keystroke.

Text/file search remains useful for dynamic references, generated names or unavailable language-service context. A declaration map may let navigation reach source instead of `.d.ts` when those sources are accessible.

**Validation:** Tooling guidance source-reviewed 2026-09-04; commands must use the repository’s installed tools and actual project paths.

**Source:** [VS Code TypeScript code navigation](https://code.visualstudio.com/docs/typescript/typescript-editing#_code-navigation)
