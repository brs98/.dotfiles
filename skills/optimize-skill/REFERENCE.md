# Optimize Skill — Reference

## Script conventions

Every extracted script must have:

- **Usage header**: top-of-file comment with one-line purpose, `Usage:` line, a real
  example invocation, and what the output/exit codes mean. The header is agent-facing
  documentation — the next agent reads the script before running it.
- **Stdlib-only runtimes**: bash (`set -euo pipefail`), `node` (no npm deps, `.mjs`),
  or `python3` (stdlib). If a system tool genuinely helps (e.g. `gh`, `sips`), degrade
  gracefully when it's missing and say so in output.
- **Idempotency**: re-running must be safe (token-replacement schemes are naturally
  idempotent — resolved output contains no tokens; state-changing scripts must check
  before acting).
- **Exit codes**: 0 = clean, 1 = warnings/lint findings, 2 = hard failures. Print
  machine-scannable lines (`ok …` / `FAIL …` / `WARN: …`) so agents can grep results.
- **Gotchas live in docstrings**: when a fix was learned through retries (an API that
  400s on hand-built URLs, a tool that bloats output, a query phrasing trick), write
  the lesson INTO the script or its docstring — the next agent won't have this
  session's context.
- `chmod +x` everything; keep scripts one level deep in `scripts/`.

## Template conventions

- Ship a **full working example**, not a fragment — the agent should be able to open
  the template in a browser/runtime and see it work with placeholder content.
- Two slot syntaxes, used consistently:
  - `{{TEXT_SLOT — with inline guidance}}` for content the agent writes.
  - `%%KIND:value%%` for resources a script resolves (survives HTML attributes;
    avoid `()` delimiters — real-world values contain parentheses).
- Every distinct content pattern the skill supports gets one demonstrated instance in
  the template with an explanatory comment (a cast card, a callout, a timeline row…).
  Agents duplicate patterns reliably; they reinvent them badly.
- Document the template's *mechanics* (how pages/sections compose, budgets/limits) in
  a comment at the point of use, not only in the skill docs.

## The four buckets, with tells

**Deterministic op → script.** Tells: the skill prose contains exact commands with
fixed flags; an external API with quirks (auth, URL formats, pagination); multi-step
data plumbing (fetch → transform → insert). Example: resolving contributor GitHub
logins from commit SHAs; fetching + recompressing + base64-embedding images.

**Repeated artifact → template/asset.** Tells: the skill asks the agent to "create an
HTML page / config / scaffold that has …" with a long feature list; the first real run
produced a large artifact that later runs would approximately reproduce. Extract the
actual artifact from the successful run, generalize content into slots, keep all the
debugged mechanics (CSS fixes, JS edge cases) verbatim.

**Measurable check → check script.** Tells: verification steps phrased as "look at X
and make sure Y" where Y is countable — overflow, missing fields, sequence gaps, file
size, unresolved tokens. Convert the *defects actually hit in real runs* into numeric
checks first (they're proven failure modes). Keep genuinely aesthetic checks as
eyeball steps, but let the script do the walking (screenshots, state cycling).

**Judgment → prose, fed by scripts.** Naming, narrative, taste, synthesis,
prioritization. The optimization is to hand judgment better inputs (fact sheets,
lint reports), never to replace it.

## Testing rules

- Test each script against the real thing that motivated it (the repo, the produced
  artifact, the live API). Synthetic fixtures only when real data is unavailable.
- For check scripts, verify both directions when cheap: clean input passes, and a
  known-bad input (e.g. the pre-fix version of an artifact) fails.
- Record what was tested in the commit message.

## Case study: codebase-storybook hardening

First real run produced these scars → scripts:

| Scar (took retries in session) | Extraction |
|---|---|
| Hand-built Wikimedia thumb URLs 400'd | `embed-images.mjs` asks the Commons API for thumburls |
| `sips` kept a 520px scan at 450KB (metadata bloat) | PIL recompression with sips fallback, lesson in comments |
| Multi-step login resolution (`git log` → `gh api`) per person | `git-archaeology.sh` resolves all top contributors in one pass |
| Clipped captions found only by staring at screenshots | `verify-book.sh` prints `scrollHeight − clientHeight` per page |
| Flip-book engine (CSS/JS) debugged over several rounds | `assets/book-template.html` keeps every fix verbatim |

Judgment kept as prose: era construction, epithets, metaphors, captions, pagination
choices — fed by the fact sheet and lint output.

## Audit script

`scripts/audit-skill.sh <skill-dir>` is the deterministic first pass: inventory,
frontmatter/trigger check, SKILL.md size, long fenced code blocks (extraction
candidates), script hygiene (shebang/usage/exec bit), and template token stats. Its
warnings are candidates, not verdicts — classify them with the four buckets before
extracting.
