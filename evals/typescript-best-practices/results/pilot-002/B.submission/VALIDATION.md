Completed `src/client.ts` with runtime event validation, copied dense string labels, validated JSON, exhaustive formatting, typed property access, and correct empty-string and delayed-callback behavior. Existing public data contracts and frozen preferences are preserved.

Commands run and outcomes (all from this worktree; repeated invocations grouped):

| Command | Outcome |
| --- | --- |
| `pwd` | Confirmed the authorized B worktree. |
| `cat AGENTS.md TASK.md` | Read workspace instructions and requirements. |
| `cat /tmp/typescript-skill-pilot-002/reference-skill/SKILL.md` | Read the permitted skill. |
| `rg --files -g '!node_modules' -g '!.git'` | Listed worktree files. |
| `git status --short` | Initially clean; final changes are the client, added tests, and this report. |
| `cat package.json tsconfig.json src/client.ts smoke.mjs` | Inspected existing scripts, strict NodeNext settings, implementation, and smoke test. |
| `cat` on the rule paths listed below | Read relevant permitted guidance. The first 13 rules were read together using shell brace expansion; `generics-function-constraints.md` was read separately. |
| `node /home/brandon/personal/typescript-doctor/node_modules/typescript/bin/tsc --version` | TypeScript 5.9.3. |
| `npm run typecheck -- --showConfig`, `npm run typecheck`, `npm test` | Initial attempts failed because the npm mise shim had no Node version selected. |
| `command -v node npm tsc` | Located node/npm shims; no tsc on the default PATH. |
| `node -p 'process.execPath'`, `node --version` | Available direct runtime is `/usr/bin/node`, v22.23.2. |
| Each npm command above prefixed with `PATH=/home/brandon/personal/typescript-doctor/node_modules/typescript/bin:/usr/bin:/bin` | Failed: npm is not in those directories. |
| `MISE_NODE_VERSION=24.19.0 npm --version` | npm 11.17.0; selects an existing installation without changing configuration. |
| Each npm command above prefixed with `MISE_NODE_VERSION=24.19.0 PATH=/home/brandon/personal/typescript-doctor/node_modules/typescript/bin:/usr/bin:$PATH` | All passed. Effective config retains strict checking; typecheck has no diagnostics; npm test builds successfully and reports “Smoke checks passed.” |
| `/usr/bin/node --test tests/*.test.mjs` | Both test files passed on Node 22. |
| `/usr/bin/node tests/client.test.mjs` | All seven runtime tests passed; direct execution displayed individual test results. |
| `/usr/bin/node tests/contracts.test.mjs` | All three compiler-contract tests passed. |
| `git diff --check` | Passed. |
| `git diff --stat`, `git diff -- src/client.ts` | Reviewed the implementation diff. |
| `git diff --exit-code -- package.json tsconfig.json smoke.mjs` | Passed: protected files unchanged. |

Edits used `apply_patch`. No dependencies were installed, no commits made, and no subagents, web access, other repositories, worktrees, or evaluator artifacts were used.

No new TypeScript type assertions, non-null assertions, `any` annotations, or error suppressions were introduced. The pre-existing `exampleStatuses` const assertion remains unchanged. `assertNever` accepts `never` and throws; it is an exhaustiveness check, not a type cast or assertion signature.

Added test assertions check accepted/rejected event shapes, omitted versus undefined labels, dense arrays (including inherited entries over holes), copied arrays, fresh projected objects, JSON syntax and semantic errors, formatting, numeric and symbol property access, empty labels, delayed callbacks, and runtime freezing. Compiler checks verify exact selected types, readonly inputs, dictionary key domain, Headers record compatibility, and independent delivery statuses. Invalid callers and a virtual future Event variant must produce the expected compiler errors, without suppressions or edits to the real source.

Reference files read: `/tmp/typescript-skill-pilot-002/reference-skill/SKILL.md` and these files under `/tmp/typescript-skill-pilot-002/reference-skill/rules/`:

- `narrowing-unknown-boundaries.md`
- `narrowing-exhaustiveness.md`
- `narrowing-in-operator.md`
- `narrowing-callback-scope.md`
- `narrowing-map-get.md`
- `generics-constrain-type-parameters.md`
- `objects-propertykey-for-any-key-type.md`
- `objects-index-signature-with-known-keys.md`
- `deriving-contract-ownership.md`
- `safety-as-const-over-object-freeze.md`
- `essentials-typing-json-parse.md`
- `config-module-resolution.md`
- `config-verbatim-module-syntax.md`
- `generics-function-constraints.md`

No known task limitations remain. The added compiler tests use the explicitly supplied compiler path. They run separately from the unchanged npm test script and require its build output for the runtime tests.
