Completed `src/client.ts` with validated parsing, copied dense labels, exhaustive formatting, precise property types, and correct empty-string and deferred-callback behavior. Added runtime and compiler contract tests.

Validation:
- `npm run typecheck` — passed.
- `npm test` — passed.
- `node --test tests/*.test.mjs` — passed.
- `git diff --check` — passed.
- Inspection used `pwd`, `cat`, `rg --files`, `command -v`, `git status`, and `git diff`.

Initial npm attempts failed because no Node version was selected. Successful runs used `MISE_NODE_VERSION=24.19.0` and the supplied compiler’s `bin` directory on `PATH`; Node 22 remains unverified.

No TypeScript assertions or suppressions introduced. Tests assert validation, copying, callback behavior, and public type contracts.

Read `AGENTS.md`, `TASK.md`, and project files; no skill or external reference files. Protected files unchanged. No dependencies installed or commits created.