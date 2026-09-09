# First completed paired pilot

**Result: a tie on the preregistered checks.** Both agents passed all 22 requirement groups. This task did not demonstrate an incremental correctness benefit from the skill.

Run date: 2026-09-04. Task: `webhook-client-v1`. Model: `gpt-6-astra`, high reasoning, fresh concurrent CLI sessions, 900-second limit each. Task/compiler/grader/skill/prompts were frozen before either participant began; grader and requirements were not changed after seeing submissions. TypeScript 5.9.3 and Node 22.23.2 were used for held-out grading. The skill snapshot corresponds to the guidance accepted on `.dotfiles` main at `ed792cf`.

| Requirement category | Without skill (A) | With skill (B) |
| --- | ---: | ---: |
| Runtime correctness | 11/11 | 11/11 |
| Public type contracts and strict compilation | 9/9 | 9/9 |
| Explicit-any / suppression policy | 1/1 | 1/1 |
| Protected fixture integrity | 1/1 | 1/1 |
| Assertions requiring human review | 0 | 0 |

These groups cover validation, fresh copied values, JSON, exhaustive event handling, exact generic inference, missing versus empty values, deferred callbacks, runtime freezing, and preservation of existing public types. They do not represent the entire 113-rule catalog, module deployment behavior, large-project maintenance, or long-term readability.

The source review found both solutions implemented the specified behavior using narrowing and precise types. Neither used assertions to bypass validation or rewrote the protected legacy contracts. Arm B reported reading `SKILL.md` and 14 relevant rules. Arm A reported no skill/reference reads; captured command records support those reports. Read isolation was instructional, not enforced by a filesystem boundary.

## Effort observations

| CLI-reported measure | Without skill (A) | With skill (B) |
| --- | ---: | ---: |
| Input tokens, including cached input | 210,854 | 283,316 |
| Cached input tokens | 195,968 | 251,904 |
| Output tokens | 4,807 | 7,387 |
| Separately reported reasoning output tokens | 620 | 1,200 |
| Elapsed seconds, rounded | 189 | 256 |

Do not interpret this as a general cost or speed result. Both agents encountered an unconfigured npm/mise shim and selected an already installed Node 24 toolchain to run npm scripts. Arm B also ran its added tests directly on Node 22. Both final submissions passed the external grader on Node 22. Extra environment troubleshooting, skill reading, different validation work, cached inputs, and concurrent execution confound attribution of the observed differences. No dollar costs or statistical estimates were calculated. Before a larger study, ensure npm works in the exact participant shell and runtime environment.

`codex --version` reported `codex-cli 0.153.0`; the separate preflight startup banner reported `v0.153.1`. This discrepancy is recorded rather than treating the CLI version string as an exact binary fingerprint. Both participants used the same executable and explicit model/effort arguments. The experimental `skip_host_skill_discovery` flag was enabled for both, and the treatment was supplied explicitly in its prompt.

## Validation of the evaluation itself

- The untouched starter passed 12/22, failing the intended boundary, generic-inference, and nullish/callback cases.
- A known-correct temporary implementation passed 22/22. The coordinator independently reran both calibrations.
- Grader mutation checks detected weakened `any` contracts, lost exhaustiveness, and sample-coupled statuses. Import failures and a 10-second infinite loop retained the fixed denominator of 22 checks.
- Seven orchestration checks passed, covering matching starters/settings, frozen compiler/inputs, immutable completed submissions, infrastructure retries, failed-arm retention, and prevention of selective reruns.
- The first in-session attempt failed at the agent API thread limit. It was interrupted and retained in [pilot-001-aborted](../pilot-001-aborted/README.md); it contributes no effectiveness result.

## Recommendation

Keep this as a smoke evaluation and a reproducible starting point. The strong model reached the task's scoring ceiling in both conditions. Do not change the skill based on this result or retrofit a winning criterion into this pilot. Add separate, realistic tasks involving public API refactoring and compiler/module configuration, establish their rubrics before runs, and collect multiple fresh pairs per task before making an effectiveness claim.

## Evidence

- [Condition comparison](comparison.json) and complete checks for [A](A.json) / [B](B.json).
- Frozen [input manifest](manifest.json), [execution settings and usage](cli-execution.json), and [command audit](command-audit.json).
- Submitted implementations: [A](A.submission/src/client.ts) / [B](B.submission/src/client.ts), with their added tests alongside them.
- Final responses: [A](A.response.md) / [B](B.response.md); [B's detailed validation report](B.submission/VALIDATION.md).
- Independent calibration reports: [starter](calibration-starter.json) / [correct implementation](calibration-correct.json).

The original live worktrees and full CLI event streams remain at `/tmp/typescript-skill-pilot-002`. This directory preserves the submissions, results, input fingerprints, and command audit in the repository. Re-run instructions are in the [evaluation README](../../README.md).
