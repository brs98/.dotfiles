# Fluid Bug Lifecycle Reference

## Canonical bug packet

Maintain one source packet and reuse it across the challenge site, Linear, tests, and the PR:

```markdown
# <concise symptom>

Discovery source:
Environment/build:
Affected URL or API:
Website submitter: Brandon Southwick

## Expected
<observable expected behavior>

## Actual
<observable actual behavior, including status/error when useful>

## Reproduction
1. <starting state>
2. <action>
3. <result>

Reproduction count:
Impact/scope:
Evidence:
Linear:
Challenge report:
PR:
```

Do not invent missing fields. Redact tokens, cookies, personal data, payment data, private
payloads, and unrelated customer records from text, screenshots, traces, and attachments.

## Authorization and checkpoints

`assess` permits only read-only repository, browser, Linear, and GitHub inspection. It may
create temporary local evidence but must not submit forms, create/update Linear issues, push,
comment, request reviews, or merge.

`run` with one concrete bug authorizes, within that bug's scope:

1. Creating/updating the matching Fluid Linear issue.
2. Submitting one matching challenge report.
3. Creating an isolated branch/worktree, commits, and a PR.
4. Posting review triggers/replies and fixing unambiguous in-scope review findings.
5. Merging only after the complete merge gate passes.

Do not carry this authorization to a different symptom, adjacent cleanup, another repository,
or a second bug. Ask before product decisions or expanded scope.

Before each irreversible checkpoint, reconcile external state so retries are idempotent:

| Checkpoint | Reconcile first | Success evidence |
| --- | --- | --- |
| Linear create | Search title, surface, repro signature, URL, and active AI markers | Issue ID + verified Fluid workspace envelope |
| Challenge submit | Search visible reports and Linear for a challenge ID | Confirmation text plus report ID/URL |
| PR create | Check linked PRs and current branch | PR number/URL linked from Linear |
| Committee request | Check whether requested for current head SHA | Request comment/action timestamp and SHA |
| Merge | Re-fetch head SHA, checks, reviews, threads, mergeability | GitHub merged state + merge commit SHA |

On a timeout, inspect the resulting state before retrying. Never repeat a final form submit,
issue creation, committee request, or merge merely because the first response was unclear.

## Reproduction and browser evidence

Use `agent-browser` as the browser adapter:

1. Open the affected page in a named session and record the starting URL, viewport, environment,
   and relevant build identifier.
2. Clear page errors and console output. Start a trace or video only when it materially helps.
3. Snapshot interactive elements and use semantic labels or fresh refs.
4. Perform the minimal safe reproduction. Capture screenshots around the decisive state.
5. Inspect relevant console errors and filtered network status. Never print secret headers,
   auth storage, cookies, or broad response bodies.
6. Repeat once when safe, stop recording, and close the session.

For the challenge form:

1. Open `https://www-fc6f09.wecommerce.dev/challenge/bugs` in headed mode on the first real run.
2. Discover labels, required fields, reporter options, attachment limits, and duplicate visibility
   from the current page. Do not hardcode element refs or assume the schema.
3. Fill from the canonical packet. Prefer evidence links or narrow attachments.
4. Read values back and capture a pre-submit screenshot.
5. Require the reporter value to equal `Brandon Southwick`; abort if unavailable or ambiguous.
6. Click Submit once, wait for network idle or a success URL/text, and capture the result.
7. Record the returned report ID/URL in Linear. If success is ambiguous, inspect before retrying.

Stop for CAPTCHA, unexpected authentication, permissions, a new required product judgment, or
validation that cannot be satisfied without fabricating data.

## Fluid Linear contract

Use only the workspace-locked `linear-fluid-commerce` launcher. Resolve team, state, labels, and
users by querying the Fluid workspace; follow pagination and verify the Fluid organization
envelope after every operation. Use GraphQL variables, never string interpolation.

Before creation:

- Search likely duplicates using title terms, surface, URL/endpoint, and reproduction signature.
- Inspect labels, comments, relations, attachments, and linked PRs for plausible matches.
- If `ai:triaging`, `ai:in-progress`, or an open linked PR already exists, stop duplicate work.
- Resolve the affected team. If repository ownership and code evidence do not identify one team
  unambiguously, ask Brandon.

Create or update the issue with:

- A concise symptom-oriented title.
- The canonical packet, customer impact, evidence, and initial acceptance criteria.
- `bug` plus exactly one AI state marker when available.
- The challenge URL/ID after submission.

AI lifecycle:

```text
ai:triaging -> ai:in-progress -> ai:pr-opened -> no AI marker after merge
          \-> ai:needs-human
```

When updating labels, preserve `bug` and every unrelated existing label; Linear label updates may
replace the full set. If an AI label is unavailable, post an equivalent state comment.

Post the standard Firefighting Assessment before implementation. Record PR creation, latest-head
Greptile success, committee approval, review invalidation after pushes, and final merge as comments.
Move to a team-local resolved state only after GitHub reports the PR merged.

## Firefighting and implementation

Exhaust safe reproduction and code-level investigation before scoring confidence. Preserve all
`firefighting` stop conditions. In particular, pause automatic implementation for ambiguous product
behavior, auth/permissions/security, payment/refund/payout/tax behavior, destructive data changes,
migrations/backfills/production repair, multi-subsystem root causes, an existing owner/PR, or lack
of meaningful local verification.

For an eligible fix:

1. Create one Patchtree workspace for the affected repository using Git-worktree materialization.
2. Load root and nearest `AGENTS.md` plus technology-specific skills.
3. Use branch `firefighting/<linear-id-lowercase>-<short-slug>`.
4. Add a focused failing test first when feasible; otherwise preserve equivalent before/after
   evidence and explain why an automated regression test is not practical.
5. Fix the root cause without adjacent cleanup.
6. Run focused tests, typecheck/lint/format checks for touched packages, and broader checks when the
   surface is shared. Record commands and exact outcomes.

## PR and review state machine

Use `ship-pr` for commit, push, and PR creation. Stage only files owned by the fix and obey hooks.
The PR must link the Linear issue and challenge report and include:

- Firefighting verdict and confidence.
- Reproduction and root cause with file evidence.
- Fix summary and risk/impact.
- Tests and checks actually run.
- The resolved requester when available.

Run `greploop` for at most its configured iteration limit. Its success predicate is both a
latest-head `5/5` score and zero unresolved Greptile comments. A push invalidates Greptile and
committee evidence; return to Greploop.

After Greploop succeeds, request `@fluid-commerce/reviewer-committee` once for that head. Committee
approval must be a positively identified result produced after the request for the same head SHA.
Accept neither silence nor a merely successful workflow dispatch as approval.

Then run `check-pr` to wait for required checks and inspect status, description, human reviews,
general comments, and GraphQL review-thread resolution. Address actionable feedback. Any code push
restarts Greploop and Committee review.

Maintain a review evidence ledger in the working notes and Linear comment:

| Evidence | Required binding |
| --- | --- |
| PR state | `headRefOid` and `baseRefOid` |
| Greptile | check/review ID, completion time, score, unresolved count, and head SHA |
| Committee request | comment/action ID, request time, and head SHA |
| Committee result | explicit verdict artifact ID, completion time, and head SHA |
| CI/reviews | check IDs/conclusions, review decision, unresolved count, and head SHA |

If an artifact cannot be attributed to the ledger's exact head SHA, it is stale or ambiguous and
cannot authorize merge. A changed base SHA requires mergeability and required checks to be
revalidated even when head SHA is unchanged.

## Merge protocol

Immediately before merging, re-fetch:

- PR `headRefOid`, `baseRefOid`, draft state, mergeable/merge-state status, and review decision.
- Required check conclusions for that head.
- Latest Greptile score and unresolved Greptile threads.
- Committee approval artifact, its timestamp/request relationship, and head-SHA freshness.
- Human change requests and all unresolved actionable threads.

Compare head and base SHAs to the evidence ledger. If the head changed, restart both reviews; if
the base changed, revalidate mergeability and required checks. Never use admin bypass. Prefer a
guarded squash merge:

```bash
gh pr merge <number> --squash --match-head-commit <approved-head-sha>
```

If the repository requires a merge queue, enqueue without bypass only after the same gates pass,
then monitor through the queue and confirm the final merged state. Do not use unattended
`--auto`; a later commit must not inherit stale authorization.

After merge, post the merge SHA and final verification to Linear, transition the issue to the
resolved team state, and remove only the workflow's AI marker. If GitHub does not report `MERGED`,
leave Linear open and report the paused gate.

## First-run configuration gaps

Do not guess these:

- **Linear team routing:** backend/frontend is not enough if multiple Fluid teams match. Infer from
  repository ownership and issue context only when unambiguous; otherwise ask once per bug.
- **Reviewer Committee artifact:** the local workflow delegates its logic externally and does not
  define a stable approval check/comment schema. On the first real PR, observe the committee's
  actual result and require an explicit positive verdict for the current head. If it cannot be
  mapped unambiguously, pause for Brandon; do not merge.
- **Challenge form schema:** discover it on the first authorized live submission. Preserve the
  canonical packet and adapt to supported fields rather than fabricating values.

These gaps do not block assessment, reproduction, Linear documentation, or a safe fix/PR. They
block only the ambiguous mutation or final merge gate.
