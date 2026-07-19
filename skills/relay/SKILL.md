---
name: relay
description: Operates Relay's tracker-gated, multi-repository coding-agent workflow and its live run viewers. Use when the user mentions Relay, Relay instances, eligible agent work, ticket readiness, or the `relay doctor`, `plan`, `run`, `watch`, `ui`, or `ticket` commands.
---

# Relay

Relay turns explicitly gated tracker tickets into sandboxed agent work and ends
at a pull request for mandatory human review. The local source checkout is
`/Users/brandon/personal/relay`; prefer the globally linked `relay` command.

## Start safely

```bash
command -v relay
relay instances
relay doctor --instance <name>
relay ticket check ISSUE-ID --instance <name> --json
relay plan --instance <name>
```

Use `plan` before `run` unless the user explicitly selected an issue or supplied
an already-reviewed plan. `plan` does not mutate the tracker, but it can inspect
GitHub, build/start a sandboxed planner, and write local run evidence.

## Eligibility

A ticket is only a Relay candidate when all applicable conditions hold:

- Fresh: configured gate label + configured Todo state.
- Resume: gate label + In Progress + configured changes-requested label.
- A configured `repo:<name>` route label; avoid ambiguous multiple routes.
- Fresh description has meaningful `## Why` and `## What` sections.

Blockers, open PRs, conflict areas, missing routes, and ticket readiness can
still make a candidate deferred or dropped. Do not equate “gate-labeled” with
“runnable.” Use `relay ticket check` and `relay plan` for the final decision.

## Wayfinder handoff

When work originates from a Wayfinder map, follow
`/Users/brandon/personal/relay/docs/agents/wayfinder-relay-handoff.md`.

- Wayfinder maps and decision tickets are never Relay candidates.
- Use `to-issues` and `write-factory-ticket` to create separate, self-contained
  delivery tickets from resolved decisions.
- Treat source links as provenance only; Relay agents cannot read the tracker,
  so every binding decision and constraint must be copied into the delivery
  ticket.
- Publish without the Relay gate. Apply the configured gate only after Relay
  validation, semantic human review, and an explicit enqueue request.
- If a decision changes, remove the gate and return affected tickets to shaping.

## Run and observe

```bash
relay run --instance <name>
relay run --instance <name> --issue ISSUE-ID

relay watch                         # newest active run
relay watch --run <id-or-prefix>    # selected live or historical run
relay watch --run <id> --once       # persistent snapshot
relay ui --port 0                   # local dashboard; prints capability URL
```

Run `watch` or `ui` in another terminal. Pressing `q` in `watch`, or stopping a
viewer, detaches without stopping Relay. Keep the UI capability URL private.

## Safety boundaries

- `run` changes tracker state and can create branches, commits, pushes, and PRs.
- Never run `doctor --apply` without explicit approval; it mutates tracker schema.
- Never read, print, or copy instance `.env` contents. Presence checks are enough.
- Treat timelines and agent logs as private even though secrets are redacted.
- Do not merge Relay-created PRs automatically; the human review gate is intentional.
- Use the same `RELAY_HOME`/`--home` for a run and its viewers.

See [REFERENCE.md](REFERENCE.md) for the command matrix, instance/state paths,
readiness checks, output interpretation, and troubleshooting.
