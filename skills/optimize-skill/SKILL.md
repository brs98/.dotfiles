---
name: optimize-skill
description: Audit and harden an existing agent skill by moving improvised LLM work into deterministic scripts, reusable templates, and measurable checks — so repeat runs are cheaper, more reliable, and less model-dependent. Use when the user wants to optimize/harden a skill, make a skill more deterministic or reusable, extract scripts from a skill, reduce LLM dependence in a workflow, or right after a skill's first real-world run exposed fiddly or retry-prone steps.
---

# Optimize Skill

Take an existing skill and shrink the share of it that depends on LLM improvisation.
The output is the same skill with more of its workflow as tested scripts, templates,
and numeric checks — and less as prose the agent must re-derive every run.

## Workflow

1. **Inventory.** Run `scripts/audit-skill.sh <skill-dir>` — file/line inventory,
   frontmatter and description-trigger checks, long fenced code blocks in the markdown
   (prime extraction candidates), script hygiene (shebang, usage header, exec bit),
   and oversized-prose warnings.

2. **Classify every workflow step** in the skill's SKILL.md into four buckets:

   | Bucket | Test | Action |
   |---|---|---|
   | Deterministic op | Same inputs → same outputs; exact commands/API calls | Extract to a script |
   | Repeated artifact | Agent regenerates similar large output each run (HTML shell, config, boilerplate) | Extract to an asset/template with documented slots |
   | Measurable check | "Look at X and verify Y" where Y is countable (overflow, missing fields, size) | Convert to a check script with exit codes |
   | Judgment | Interpretation, synthesis, naming, taste | Keep as prose — but feed it script output |

3. **Mine real usage for retry scars.** The best script candidates are steps that took
   multiple attempts in actual sessions (URL formats that 400'd, tools whose output
   was bloated, queries that needed rephrasing). Ask the user what was fiddly, or scan
   the conversation/transcripts that produced the skill. Encode the *learned fixes* in
   the scripts and their docstrings, not just the happy path.

4. **Extract.** Write scripts and templates per the conventions in
   [REFERENCE.md](REFERENCE.md) — usage headers, stdlib-only, idempotent, meaningful
   exit codes; templates as full working examples with `{{TEXT_SLOTS}}` and
   `%%RESOLVABLE:tokens%%` plus inline comments documenting every pattern.

5. **Test on real data — hard rule.** Every script runs against a real repo, real
   file, or real API before it ships. A hardening pass that adds untested scripts made
   the skill *less* reliable. Name what you tested in the commit message.

6. **Rewire the docs.** SKILL.md steps become "run X, then judge its output"; delete
   the prose the scripts replaced (keep raw commands in REFERENCE.md for targeted
   follow-ups). Re-run the audit script to confirm the smells are gone.

7. **Ship.** Commit + push via the dotfiles flow (skills live in
   `~/.dotfiles/skills/`, symlinked through `~/.agents/skills/`).

## Boundaries

- **Never script judgment** — era-naming, prose style, metaphor choice, design taste.
  Over-scripting these makes every output identical and worse.
- Don't add dependencies for convenience; a fiddly-but-stdlib script beats a clean one
  that needs `npm install`.
- Optimize skills after they've been used at least once for real — first-run scars are
  the roadmap; speculative hardening usually scripts the wrong things.
