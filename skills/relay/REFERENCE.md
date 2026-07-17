# Relay Reference

## Command and effect matrix

| Command | External effects |
|---|---|
| `relay instances` | Reads configured instance names. |
| `relay doctor --instance NAME` | Reads live tracker schema. |
| `relay doctor --instance NAME --apply` | Creates low-blast-radius tracker labels; pauses on high-blast-radius state work. Requires explicit approval. |
| `relay ticket template --type TYPE` | Prints the versioned ticket contract. |
| `relay ticket check --file FILE --type TYPE --json` | Reads a local draft and validates its structure. |
| `relay ticket check ID --instance NAME --json` | Reads a tracker ticket and validates its structure. |
| `relay plan --instance NAME` | Reads tracker/GitHub state, may build/run the planner sandbox, and writes local evidence; no tracker mutation. |
| `relay run --instance NAME` | Runs the eligible queue and mutates tracker, Git, and GitHub state. |
| `relay run --instance NAME --issue ID` | Runs one selected issue, still enforcing fresh-ticket readiness. |
| `relay watch` | Read-only terminal attachment to the newest active run. |
| `relay ui` | Read-only loopback dashboard with a per-launch capability token. |

Supported ticket types are `bug`, `feature`, `refactor`, and `migration`.

## Instance workflow

```bash
relay init <name>
relay instances
relay doctor --instance <name>
```

Each instance owns a tracker team/schema, gate label, repository routes, sandbox
configuration, policy, and credentials. Its `.env` overrides ambient shell
variables for that instance.

Default config roots:

- macOS: `~/Library/Application Support/relay/instances/`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/relay/instances/`
- Windows: `%APPDATA%/relay/instances/`

Use `RELAY_HOME=/path` or `--home /path` for an isolated config/state root.
Relative repo and Dockerfile paths resolve from `relay.config.json`. Legacy
checkout-local instances are fallback-only; heed Relay's migration warning.

## Environment readiness

Before a real run, verify without printing secrets:

```bash
node --version             # Node 20+
docker info
gh auth status
relay doctor --instance <name>
```

Also confirm configured repository paths and Dockerfiles exist. Agent auth must
provide `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`; Linear auth and any
repo-specific forwarded secrets must be present in the instance `.env`.

## Interpreting planning

`relay plan` reports:

- `eligible`: tracker candidates matching state and gate rules.
- `runnable now`: the host-validated first batch.
- `deferred`: valid candidates waiting on dependencies or conflict locks.
- `dropped`: missing/unknown repo routes, planner omissions, or other invalidity.

An eligible count greater than zero does not imply runnable work. Resolve the
reported route, contract, blocker, ownership, or conflict problem instead of
forcing `run --issue`.

## Ticket contract

Fresh tickets require outcome-focused content:

```md
## Why

The problem, impact, and why it matters.

## What

Observable outcomes, acceptance criteria, boundaries, and constraints.
```

Do not prescribe implementation details unless they are genuine constraints.
Changes-requested work is grandfathered so existing review loops are not stranded.

## Observability

Every `plan` and `run` prints a run ID, writes a protected per-run manifest, and
appends a secret-redacted JSONL timeline in the Relay state root. `watch` and
`ui` choose the newest active run by default, then fall back to history.

Use `relay watch --once` for scripts or a durable status snapshot. The browser
viewer binds only to `127.0.0.1`; do not publish or paste its tokenized URL.
Viewer shutdown never stops the underlying run.

## Troubleshooting

- **No runs found:** start `relay plan` or `relay run`, or pass the same `--home`.
- **Nothing eligible:** check state, gate label, and changes-requested mode.
- **Eligible but dropped:** add/fix the configured `repo:<name>` route.
- **Eligible but deferred:** inspect blockers, open parent PRs, and conflict areas.
- **Fresh ticket rejected:** run `relay ticket check` and repair `Why`/`What`.
- **Viewer selects the wrong run:** pass `--run <id-or-unique-prefix>`.
- **Global CLI missing/stale:** from `/Users/brandon/personal/relay`, run
  `pnpm build` and `pnpm link --global`, then verify `command -v relay`.

For implementation work on Relay itself, use an isolated Patchtree workspace,
run the complete test/typecheck/build/package checks, and preserve unrelated
changes in the main checkout.
