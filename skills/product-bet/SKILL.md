---
name: product-bet
description: Guides a product issue or feature idea through the discovery half of the product development lifecycle — problem reframe, one-pager, evidence gathering, shaped pitch with appetite and success metric — with each bet stored as a shared Linear document the team can see. Use when the user has a feature idea, receives a stakeholder request, spots a customer problem, or says "new bet", "advance the bet", "list open bets", or names a specific bet to work on.
---

# Product Bet

Walk one product issue through discovery: **Intake → One-pager → Evidence → Shaped pitch → Ready to bet**. Each bet is one Linear document; its filled-in sections ARE the state. Never skip a gate — the gates are the value. Gate rationales and checklists: [REFERENCE.md](REFERENCE.md).

## Talking to Linear

Use the bundled script, NOT Linear MCP tools — Linear MCP sessions are OAuth-bound to a single workspace, while the script picks a per-workspace API key at runtime. Resolve the path relative to this SKILL.md:

```bash
node <skill-dir>/scripts/linear.mjs --workspace <name> <command> [options]
```

Commands (JSON on stdout): `workspaces` (offline: configured workspaces), `whoami`, `list-teams [--query]`, `list-projects [--query]`, `save-project --name --team [--description] [--id]`, `list-docs [--project] [--query]`, `get-doc <id|slug>`, `save-doc --title --project [--content-file <path|->] [--id]`.

**Workspace selection is always explicit — there is no auto-detection by design (machine-agnostic).** At the start of a session: run `workspaces`, and if more than one is configured, ask the user which one this bet belongs to; if exactly one, name it and proceed. Pass `--workspace <name>` on **every** call. Before the first write, run `whoami` and confirm the resolved organization with the user. The bare `LINEAR_API_KEY` env fallback exists for machines with no config — never rely on it when a config file is present.

Key setup is per-machine, not part of this skill: the user maintains `~/.config/linear-workspaces.json` (or `$XDG_CONFIG_HOME/...`), where each workspace's key comes from a `keychain` service (macOS), a `command` that prints it (`secret-tool`, `op read`, `pass` — any OS), an `env` var name, or a plaintext `key`; bare `LINEAR_API_KEY` works as a fallback with no config at all. If key resolution fails, the script's error says exactly what to set up — relay it verbatim to the user. The script's header comment documents the config format.

For document bodies, write the markdown to a temp file and pass `--content-file` (or pipe via `--content-file -`) — don't inline multi-line markdown in `--content`.

## Where bets live in Linear

In Linear semantics, a **project is committed work** (Linear Method) — a bet is not that yet. So: one standing project named **"Product Bets"** per team is the betting table; each bet is a **document** on it. Find it with `list-projects --query "Product Bets"`; if missing, create it once (`save-project`, no target date) after confirming with the user. Never create a project per bet. When a bet **wins**, graduate it: create the real delivery project per the team's convention (see `linear-create` skill: Cycle Epics on the Current team), link the bet doc from the project description, and set the bet's stage to `Won → <project>`.

**Handoff to agent delivery (sandcastle).** If the delivery project's repo runs a sandcastle agent loop (it has a `.sandcastle/` directory — e.g. ricekit), the delivery project IS the agent queue, and graduation isn't done until the pitch is sliced into issues the loop can execute: each issue self-contained, with every constraint it needs **inlined from the bet doc into the issue description** (agents can fetch docs via `linear.mjs doc <url>`, but descriptions are the contract — don't make the doc load-bearing); ordering wired with `Blocked by` relations, the solution-test issue blocking the build issues; the `Agent` label on agent-runnable issues only (no label = human-owned, invisible to the loop); everything startable placed in `Todo` (the loop ignores Triage/Backlog). The loop picks up only `Todo` + `Agent` + unblocked.

Then check the table: if no other bet sits at a stage before `Ready to bet`, say so — the discovery track just went quiet, and delivery-only is the feature factory (Patton, dual-track). Ask what the next problem worth intake is.

## Bet document anatomy

One Linear document per bet, titled `Bet: <problem-named title>`. Structure:

```md
**Stage:** Intake | Problem framed | Gathering evidence | Shaped | Ready to bet | Won → <project> | Passed (not bet on)
**Updated:** <date>

## One-pager
**Problem:** … **Evidence:** … **Who:** … **Why now:** …
**What success would look like:** <metric + direction, no target/solution/date>
*Not yet decided: the solution.*

## Evidence log
- <date> — <source: interview/data/tickets> — <finding, with numbers/quotes>

## Shaped pitch            <!-- only after one-pager gate passes -->
**Appetite:** … **Solution sketch:** … **Success metric:** <metric, target, cohort, window>
**Rabbit holes:** … **No-gos:** …

## Decision
<betting-table date, outcome, or why passed>
```

## Workflows

### Start a new bet
1. **Intake gate — solution-in-disguise check.** If the issue arrived as a feature ("we need X"), ask *"what can't the customer do, and so what?"* — repeat until a customer behavior appears, stated so a skeptic could disagree. Do not create the document around a feature name.
2. Draft the one-pager **with** the user (interview them; don't invent facts). Lint it against the one-pager checklist in REFERENCE.md and show pass/fail per item.
3. Create the Linear document (`save-doc --title "Bet: …" --project "Product Bets" --content-file <tmpfile>`), stage `Problem framed` (or `Intake` if evidence is still thin). Tell the user the doc is now team-visible.

### Advance a bet
1. Find it: `list-docs --project "Product Bets" --query "Bet:"`; `get-doc <id>` to read state. The next empty/weak section is the next move.
2. Apply the gate for the section being entered (see REFERENCE.md):
   - **→ Evidence:** log entries need a date, a source, and a number or verbatim quote. Coach story-based questions ("tell me about the last time…"), never hypotheticals.
   - **→ Shaped pitch:** blocked until the one-pager lint passes AND evidence log has ≥2 independent kinds of evidence. Pitch requires an explicit appetite and a pre-committed success metric.
   - **→ Ready to bet:** blocked until pitch checklist passes — including naming the cheapest solution test (run already, or committed as the first build slice). Then prompt: "bring it to the next prioritization conversation — who needs to read this?"
3. Update the document (`save-doc --id <id> --content-file <tmpfile>`), bump **Stage** and **Updated**.

### List / review open bets
`list-docs --query "Bet:"` → table of bet, stage, last-updated. Flag stale ones (no update in 3+ weeks): suggest advancing or marking `Passed (not bet on)` — explicitly passing is a healthy outcome, not a failure.

## Voice

Teacher-lite: terse and operational, but every enforced gate gets a one-line *why* with its citation from REFERENCE.md. Push back once when a gate fails; if the user overrides, comply but record `(gate overridden)` next to the stage.

## Fallback

If the script can't reach Linear (no key resolvable, network down), keep the identical document at `./bets/<slug>.md` and say so; offer to publish to Linear once the Keychain entry exists.
