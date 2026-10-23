---
name: pr-roadmap-map
description: Build and refresh a "roadmap as a map" page for driving many stacked GitHub PRs toward one goal. Steps are boxes with dependency arrows in tracks; each step shows its story id and its PRs; stacks, statuses, CI, what is ready to land, what is blocked and each stack's progress are computed from live `gh` data. Use when asked to make, update or refresh a PR roadmap, a stacked-PR map, or "the roadmap map" for a set of PRs and stories.
---

# PR roadmap map

The page is generated. You edit one plan file and run three scripts; you do not hand-edit the HTML
or write status prose. Everything a reader asks of the map (what's next to land, what's blocked and on
what, which PRs are drafts or failing CI, how far each stack has gotten, what a step waits on and
unlocks) is computed by `scripts/build.py` from the plan plus fetched PR data.

```
SKILL=<this folder>
WORK=<a folder for this roadmap>    # holds plan.json, data/, and the built page
```

## Workflow

1. **Plan.** Create or edit `$WORK/plan.json` (schema below; `examples/checkout-service/plan.json` is a
   full example). This is the only hand-written input.
2. **Fetch** (read-only, uses `gh`):
   `python3 $SKILL/scripts/fetch.py $WORK/plan.json $WORK/data`
   It prints any open PR that is stacked on a tracked PR, or matches `discover.match`, but is not in
   the plan. Add those to the right step's `prs` if they belong, then fetch again.
3. **Build:**
   `python3 $SKILL/scripts/build.py $WORK/plan.json $WORK/data $WORK/roadmap.html --report`
   It fails on a bad plan (unknown dep or track, cycle, a PR in two steps, a PR with no data). The
   report prints the computed answers; use it for your summary to the user instead of re-deriving them.
4. **Validate:** `python3 $SKILL/scripts/validate.py $WORK/roadmap.html` must print `OK`. It parses the
   JSON data block with `json.loads`, runs `node --check` on the inline script, and checks the Artifact
   CDN and font rules, the `<title>` and the size. Never publish a page that fails it.
5. **Optional look:** `PLAYWRIGHT=<path to playwright package> node $SKILL/scripts/render-check.cjs
   $WORK/roadmap.html $WORK/shot` renders laptop/light and phone/dark, reports script errors and
   overflow, and saves screenshots.
6. **Publish** with the Artifact tool (load `artifact-design` first in a new session). On an existing
   artifact, `read` it first and publish to its `url`; pass `icon` only on the first publish.

To refresh, run steps 2 to 4 (and 6) again. Nothing else changes.

## Plan file

```jsonc
{
  "title": "Checkout Service Roadmap",      // page name; also the <title>
  "eyebrow": "Storefront · ...",            // optional small line above the title
  "subtitle": "One line on the end goal.",
  "repo": "owner/name",
  "baseBranch": "main",
  "storyUrl": "https://tracker.example.com/story/{id}",      // story ids become links; no state is shown
  "storyPrefix": "st-",
  "metaChecks": { "label": "PR labels" },   // check names that are PR hygiene, not CI; shown separately
  "discover": { "author": "@me", "state": "open", "limit": 100, "match": ["st-1203"] },
  "tracks": [ { "id": "A", "label": "Extract checkout" } ],               // lanes, top to bottom
  "prLabels": { "110": "service package" },                    // optional short PR names for chips
  "goal": { "title": "End state", "deps": ["a5"], "what": "One line.", "links": [ { "label": "", "href": "" } ] },
  "steps": [
    {
      "id": "a3", "label": "Step 3", "title": "Checkout service package",
      "track": "A", "story": 1203,
      "prs": [110, 111, 112],               // base-first order within the step
      "deps": ["a2", "x1"],
      "what": "One line.", "why": "One line.",
      "done": true,                         // override: settled without a PR (e.g. a decision)
      "open": true,                         // override: more work planned after its merged PRs, or started with no PR
      "col": 5, "slot": 0,                  // optional layout overrides (see below)
      "parts": [ { "label": "cart API", "size": "120 lines", "pr": 111 } ],   // optional sub-items
      "related": [ { "pr": 108, "label": "One line" }, { "story": 1290, "label": "One line" } ]
    }
  ]
}
```

Rules for the plan:
- Keep `what` and `why` to one sentence each. Don't write status, progress or "next" text anywhere;
  the page computes it and hand-written status goes stale.
- List each PR in exactly one step, base first. A stack can span steps; the build links it.
- `goal.deps` defaults to every step nothing else depends on.
- Step state is derived from PRs. The only overrides are the two facts GitHub cannot show: `done`
  (the step finished without a PR, such as a decision) and `open` (its PRs merged but more PRs are
  planned, or work started before a PR exists). A "later" step is just Not started. `status` is
  rejected so old plans fail loudly instead of drifting.

## What is computed (build.py)

| Output | Rule |
|---|---|
| Column | `col`, else 1 + the deepest dependency's column |
| Row | track order; within a track, `slot`, else the first free slot in that column |
| PR state | merged, draft, open (closed if closed unmerged). Approval and changes requested are shown on open PRs and count as landing blockers, not as states |
| CI | non-skipped checks outside `metaChecks`: any failure = failing, any pending = running, none = not run |
| Stack | a PR whose base branch is another tracked PR's head is stacked on it. A merged PR listed just before a stack's root in the same step counts as that stack's history (GitHub retargets the child to main when the parent merges) |
| Landing blockers | base PR not merged (or merged but not retargeted), draft, changes requested or no approval, CI failing/running/not run, failing meta checks |
| Ready to land | open, tracked, no blockers. "Front of line" = blocked only by its own state, not its base |
| Step state | `done` flag or every PR merged = Done; `open` flag or any open/draft PR = In progress; otherwise Not started |
| Markers | Blocked = a step that is not done and waits on an unfinished step; Ready to start = Not started and nothing to wait on |
| Waits on / unlocks | direct deps not merged or decided; reverse edges; unfinished ancestors |
| Can start now / after open PRs merge | Not started, every dep Done (or In progress, for the second) |
| Longest chain | longest path of unfinished steps to the goal |
| Stack edges | a step whose PR is stacked on a PR in another step gets a violet dashed arrow |

## Legend

- Step: Done (green check), In progress (blue half circle), Not started (gray ring); markers Blocked (red lock) and Ready to start (green arrow)
- PR: Merged (green check), Open (blue ring with dot), Draft (amber dashed ring); a red ring means CI is failing; a violet dashed arrow means stacked PRs continue in the next step

## Files

- `scripts/fetch.py`: `gh pr view` for every referenced PR, plus discovery. Writes `data/prs.json` and `data/fetch.json`.
- `scripts/build.py`: plan and data to page; `--report` prints the answers.
- `scripts/validate.py`: pre-publish checks.
- `scripts/render-check.cjs`: optional headless render.
- `templates/roadmap.html`: the page. It only renders the model build.py embeds; put new derived facts in build.py, not the template.
- `examples/checkout-service/`: a fictional roadmap (plan and a fetched-data snapshot) that shows every state the page draws: merged, open, draft, failing CI, a stack that spans steps, a decision, blocked and ready-to-start steps. Build it with `build.py examples/checkout-service/plan.json examples/checkout-service/data out.html --report`.

## Hard rules

- Read-only: fetch never writes to GitHub or the tracker, and the plan is never edited by a script.
- Validate before every publish.
- External scripts only from the Artifact CDN allowlist with exact versions; fonts only from Google Fonts. The template uses none besides Google Fonts.
