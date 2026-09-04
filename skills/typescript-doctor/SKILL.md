---
name: typescript-doctor
description: Review a TypeScript project with the local TypeScript Doctor CLI after significant changes, alongside the project compiler and tests. Use for source or configuration reviews; its heuristic score is not proof of correctness.
---

# TypeScript Doctor

Run the bundled launcher from the project being reviewed:

```sh
bash <skill-directory>/scripts/run.sh . --verbose
```

The launcher uses `TYPESCRIPT_DOCTOR_REPO` when set, then `$HOME/personal/typescript-doctor`, then an installed `typescript-doctor` command. It does not download or install anything. The source runner requires Bun and installed checkout dependencies; the built CLI requires Node 22+. Resolve `<skill-directory>` to this skill's actual path.

Use the repository's package manager to run its compiler and relevant tests too. Doctor uses ts-morph's bundled TypeScript; the project's compiler version and configuration remain authoritative.

## Review findings

- Default `recommended` checks cover targeted safety and configuration issues. Use `--profile all` only when a broader design review is requested; advisory findings do not affect scores or CI gates.
- Confirm that a suggested change preserves runtime behavior and the intended public contract. Do not remove runtime freezing, replace validation with an assertion, broaden a restricted union, or change a required argument slot solely to improve a score.
- Inspect JSON `coverage` and `totalFiles` (scanned source files), separately from `affectedFiles`. No applicable input yields `score: null`; a clean scan does not imply compiler success.
- Use the checked-out tool's generated `docs/rules.md` for actual IDs and current rule inventory; do not infer capabilities from category names.

## Useful options

| Option | Meaning |
| --- | --- |
| `--json` | Structured findings, coverage, profile and advisory status |
| `--verbose` | File paths and line numbers |
| `--profile all` | Include optional design/style advice |
| `--diff [base]` | Committed changes from merge base to HEAD, default base `main`; excludes uncommitted changes |
| `--fail-on error` | Fail for non-advisory errors |
| `--fail-on warning` | Fail for non-advisory warnings or errors |
| `--fail-on none` | Disable diagnostic failures; execution errors still fail |
| `--no-config` / `--no-ast` | Restrict the analysis scope |
| `--save-baseline path` / `--baseline path` | Save or compare compatible scope/profile snapshots |

Doctor config `include` adds root-project inputs and `exclude` removes reporting inputs. Unknown rule IDs and malformed configuration fail explicitly. Respect project overrides and disabled rules. Report material remaining findings and validation results; do not keep rerunning the tool without a relevant change or unresolved concern.
