# TypeScript skill evaluation

This is a paired evaluation of **task outcomes**, comparing an agent with the `typescript-best-practices` reference to an agent without it. Both receive the same webhook-client task, starter, compiler, tools, and model/reasoning configuration. The only intended treatment difference is access to the skill and its linked rules.

The [first completed pilot](results/pilot-002/REPORT.md) tied at 22/22 checks for both conditions. It validates the harness, not a claim of skill effectiveness.

The first task combines boundary validation, generic inference, narrowing, nullish values, and preservation of existing runtime/public type contracts. It is deliberately relevant to this skill. It does **not** represent all TypeScript work or test every one of the 113 references.

## Design

- Public requirements are in [task.md](task.md); hidden test implementations are in [grade.mjs](grade.mjs). Hide tests from participants, never the requirements.
- Freeze the task, starter, grader, prompts, full skill snapshot, and compiler installation before participants start. `prepare` records their SHA-256 hashes; subsequent commands reject changed evaluation inputs.
- Each fresh, no-history participant gets its own native Git worktree. Both use the same existing TypeScript installation, with no downloads or dependency changes.
- Randomize which opaque arm label receives the skill. The grader receives only a candidate path and compiler path; condition labels are attached afterward.
- Grade runtime behavior, public type contracts, static safety, and protected-file integrity separately. A compiling solution or Doctor score alone does not establish correctness. Optional syntax preferences do not earn points.
- Negative compiler checks reject invalid consumer calls; positive checks and anti-`any` checks protect inference and compatibility. Mutation checks exercise future union exhaustiveness and sample-data independence.
- Record every attempt, including failures and incomplete responses. Give neither participant hidden-test feedback or a second correction opportunity within a run.

The access boundary in this interactive pilot is **instructional, not a security sandbox**. Agents share the host and may inherit a skill catalog even with no conversation history. They must not inspect evaluator files, other worktrees, or unprovided skills. Record each agent's reported reference reads; these are compliance evidence, not proof of inaccessible files. A stronger automated experiment should use separate containers and mount the skill only for the treatment arm.

## Run a pair

Requires a POSIX host (Linux or macOS), Python 3, Git, Node 22, npm, and an already installed TypeScript package. The tested compiler is recorded per run; no package installation is performed. From this directory:

First verify `node --version` and `npm --version` succeed in the participant's shell. An installed mise/npm shim without a selected Node version is insufficient; it caused avoidable troubleshooting in the pilot. Keep the chosen runtime identical for both participants and record it.

```sh
python3 run.py prepare \
  --run-root /tmp/typescript-skill-pair-001 \
  --typescript /home/brandon/personal/typescript-doctor/node_modules/typescript \
  --skill /home/brandon/.agents/skills/typescript-best-practices
```

Use a new path for every pair. Optional `--seed INTEGER` makes the arm assignment reproducible. Keep `manifest.json` and `evaluation/` out of participants' context. Launch two fresh agents with **no conversation history**, the same model and reasoning effort, identical tool availability, and exactly their generated `prompts/A.md` or `prompts/B.md`. Their different worktree paths are operational only. Do not give one participant extra instructions or coaching.

With the local Codex CLI, run both participants automatically:

```sh
python3 run_cli.py --run-root /tmp/typescript-skill-pair-001 --model gpt-6-astra --effort high
python3 run.py grade --run-root /tmp/typescript-skill-pair-001
```

`run_cli.py` launches fresh concurrent processes, pins the same model/effort, ignores user configuration, disables automatic host-skill discovery/plugins/subagents, and explicitly reads the same fixture instructions. Both get a 900-second limit (adjust with `--timeout`). It records status, final responses, CLI events, and reported usage. It uses existing CLI authentication without reading credentials. Supported flags were checked with the installed CLI; `skip_host_skill_discovery` is an experimental flag and should be reverified after upgrades. Read isolation remains instructional. See the official [non-interactive CLI documentation](https://learn.chatgpt.com/docs/non-interactive-mode) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Alternatively, coordinate available agent tools manually using the steps below.

Immediately before starting each participant:

```sh
python3 run.py mark --run-root /tmp/typescript-skill-pair-001 --arm A --event start --agent AGENT_ID
```

Repeat for B. At completion save the full final response, then:

```sh
python3 run.py mark --run-root /tmp/typescript-skill-pair-001 --arm A --event complete --response /tmp/A-response.md
python3 run.py mark --run-root /tmp/typescript-skill-pair-001 --arm B --event complete --response /tmp/B-response.md
python3 run.py grade --run-root /tmp/typescript-skill-pair-001
```

Use `--event failed` for an unsuccessful or interrupted participant; grade its submitted work too. The manual `run.py` workflow does not launch agents, enforce budgets, or collect token usage; the optional CLI runner does. Record actual model IDs, token costs, tool counts, and enforced budgets separately when the host exposes them. Otherwise report them as unavailable. Measured elapsed time includes coordination delays and concurrent machine contention; it is descriptive, not a reliable speed comparison.

`results/` contains machine-readable checks, a comparison, candidate snapshots, tracked-file patches, and supplied final responses. Completion freezes each submission; grading checks those snapshot hashes and uses the snapshots even if the original worktrees subsequently change. Coordinator updates are serialized with a lock. Infrastructure failures can be retried against those same frozen submissions; neither arm's grading output is published until both graders succeed. The grader copies candidates to temporary directories, uses the frozen compiler configuration and its own tests, and does not execute candidate package scripts.

To calibrate the grader on the untouched starter:

```sh
node grade.mjs fixture /home/brandon/personal/typescript-doctor/node_modules/typescript
```

Expected: it compiles and preserves some existing contracts, but fails boundary validation, nullish/deferred behavior, and generic inference, with unchecked assertions requiring review. Its explicit return type already enforces exhaustive return handling under strict checking. Check a correct reference implementation as well before freezing a changed rubric. Never tune the tests after observing a treatment result and then report the changed test as the original experiment.

## Interpret results

Report passed/total **requirement groups by category**, the exact failed requirements, integrity failures, and assertions needing human review. Integrity failures invalidate a comparison even if other checks pass. We do not combine category counts into a universal quality score: group weights are an evaluation design choice, not a measured property of software quality.

A single pair is a pilot showing that the harness works. A tie can mean the task is easy for the chosen model; it does not show the skill is useless. A win on this task is not proof of general benefit. Repeated identical tests also do not expand task coverage.

For a stronger study, preregister multiple tasks from different families (feature implementation, unsafe-boundary repair, public API refactoring, and compiler/module configuration), then run at least five fresh pairs per task as an initial variance estimate. Choose the final sample size based on the effect size and uncertainty you need. Randomize execution order, keep model/version and budgets fixed, report all runs and task-level paired differences, and use uncertainty estimates that respect repeated runs within the same task. Add blinded human assessment only with a written rubric established beforehand.

The task, skill snapshot, and compiler version should be versioned together. A future skill revision is a new experiment, not a replacement for an unfavorable old result.

To check orchestration without making model calls:

```sh
python3 -m unittest discover -s . -p 'test_runner.py' -v
```
