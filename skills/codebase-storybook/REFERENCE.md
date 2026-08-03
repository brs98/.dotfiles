# Codebase Storybook — Reference

## Research: git archaeology playbook

Start with `scripts/git-archaeology.sh <repo-dir> [pathspec]` — it emits the whole
deterministic fact sheet (creation, volume, contributors + GitHub logins + avatar URLs,
monthly activity, largest commits, incident-flavored subjects) in one pass. Run it once
per repo/subsystem involved.

Then run judgment research in parallel Explore/general-purpose subagents (one per repo
or concern) so the main context stays clean: era narratives, commit-body quotes,
cross-repo influence, predecessor-repo echoes. Ask each for a structured report with
dates, PR numbers, authors, and direct quotes — and **tell each subagent explicitly to
SendMessage its full report to "main" when done**: background agents' idle
notifications carry no content, and chasing reports afterward costs a round trip per
agent (real-run lesson).

Commands behind the script, for targeted follow-ups:

```bash
# When did a path first appear? (survives renames)
git log --follow --diff-filter=A --format="%h %ad %s" --date=short -- <path>

# Who worked on it, by volume and by recency
git shortlog -sn -- <path>
git shortlog -sn --since="60 days ago" -- <path>

# Latest commit by a given author (to resolve their GitHub login later)
git log --author="Full Name" --format=%H -1

# Resolve author login + avatar from any commit they made
gh api repos/OWNER/REPO/commits/<sha> --jq '.author.login'

# Era detection: cluster subject lines by month
git log --format="%ad %s" --date=format:%Y-%m -- <path> | sort | less
```

Archaeology gotchas that changed the story last time:
- **Imported apps**: a giant initial commit (tens of kloc) means the app predates the
  repo. The squash body often preserves the predecessor repo's PR numbers and ticket
  prefixes — quote them; they're the only surviving record.
- **Directory moves** (e.g. packwerk removal, `packages/` → `app/`) hide true creation
  dates; always `--follow` before claiming "X was born on date D".
- **Squash-merge repos**: PR numbers in subjects (`(#1234)`) let you cite PRs without
  API calls; `gh pr view` only when the subject isn't enough.
- **Why-evidence** lives in commit bodies: search for `revert`, `fallback`, `leak`,
  `race`, `deprecat`, `harden`, `fix` clusters after big landings (incident signature).
- **AI contributors** (Devin, Claude co-author trailers) are part of the record — keep
  their names; readers love this detail.

## Story: structure and tone

Spine: **cover → colophon → title page → dramatis personae → chapters (one era each) →
epilogue → timeline appendix → The End.**

- **Eras, not features.** Cut history at inflection points (a migration, a rewrite, an
  org decision), 4–6 chapters. Give each a two-word title and a date range.
- **Dramatis personae**: 5 cast cards per page, each with an epithet ("The Platform
  Architect", "The Migrator") earned by their commits. Duos and bot+org pairs share a
  card with `portrait-pair`.
- **Why-callouts**: when a commit message explains a weird design (payload limits,
  token leaks), put it in a `.callout` box titled as the question a reader would ask.
- **The moral**: one `.moral` box near the end synthesizing the pattern (e.g. "every
  oddity was the previous era's fix; the failure was never deleting what was
  superseded"). Derive it from the record, don't import one.
- **Epilogue** points forward: what the current in-flight work is, framed as "the next
  chapter is being written / is someone's to make".
- Present-tense beats for pivotal moments; drop caps on chapter openers; forgive
  people, not facts ("nothing invented; a few things forgiven").

## Pagination model (template mechanics)

The template is a stack of `.leaf` elements. Each leaf = one sheet: `.page.front` is a
right-hand page, `.page.back` becomes the *next* left-hand page after the flip. After
flipping k leaves the visible spread is `back(leaf k-1) | front(leaf k)`. The JS counts
leaves automatically — add/remove leaves freely, keep folios sequential.

Budget per page (580×740px, padding included):
- ~200–300 words of body text; justify + hyphens are on by default.
- Chapter title block (kicker + h2 + dates) ≈ ⅓ page.
- A plate (`max-height: 148px` + caption) ≈ ⅓ page. One plate per chapter, on
  whichever of its two pages has slack.
- 5 cast cards, or ~7 timeline rows, per page. `.beats` items and `.callout` boxes
  cost height beyond their words (~18 and ~25 words of budget each) — check-book.mjs
  accounts for this.
- Pages clip overflow (`overflow: hidden`): an overrun eats the folio/caption
  silently — this is the #1 verification target. **Content must end ≈658px from the
  page top** (740 − 52 bottom padding − folio). Do not debug overflow with
  `scrollHeight − clientHeight`: the folio's `margin-top: auto` absorbs slack, so
  that delta stays ~constant while the page overruns by 50px+ (verify-book.sh
  measures content-end correctly).

Plan the leaf count before writing: pages = 2×leaves − 1 (cover face excluded), and
"The End" must land on a `.page.back`. Worked example (10 leaves): cover+colophon |
title+cast | cast2+ch1 | … | timeline2+The End — i.e. colophon, title, 2 cast pages,
12 chapter pages, 2 timeline pages, The End = 19 pages = 2×10 − 1. If your page plan
comes out even, add or drop one page (an ornament verso, a split chapter) rather than
leaving The End on a front.

## Images

- **Portraits**: resolve real logins from commit SHAs (never guess from names), then
  `%%AVATAR:login%%`. GitHub App bots (e.g. `devin-ai-integration[bot]`) don't resolve
  via `github.com/<login>.png` — use their `avatars.githubusercontent.com/in/<app-id>`
  URL (from the commits API `.author.avatar_url`) with `%%IMG:...%%`.
- **Plates**: `scripts/commons-search.py "query" ...` → pick PD/CC0 (or CC BY with
  caption credit) → `%%PLATE:File:exact title.jpg%%`. Never hand-build Commons thumb
  URLs (they 400 for many files); the embed script asks the API. Any exact title is
  safe in the token — spaces, parentheses, ellipses — because resolution goes through
  the API's `titles` param; only `%` in a title would break the token syntax.
  Wikimedia 429-rate-limits bursts; embed-images.mjs retries with backoff in-process,
  so just let it run (it can take a few minutes on plate-heavy books).
- **Embedding**: `node scripts/embed-images.mjs book.html`. Recompresses via PIL
  (sips keeps huge metadata blocks — a 520px scan can stay 450KB through sips; PIL
  gets it to ~45KB). Idempotent; re-run after adding tokens.
- **Credits**: colophon names the sources collectively; CC BY works also get named in
  their own captions.

## Verification (scripted + eyeballs)

```bash
node scripts/check-book.mjs book.html        # static lint: placeholders, folios, word budgets
scripts/verify-book.sh book.html ./verify    # overflow report + screenshot of every spread
```

The overflow report is authoritative for clipping: any folio with `over > 2` is losing
its caption/folio — trim that page's text or shrink its plate, then re-run. The
screenshots still need reading (scripts can't judge typography): (1) closed cover —
only the cover visible, no board sticking out; (2) cast spread — portraits round,
sepia, nothing clipped; (3) every plate page — caption AND folio visible; (4) End
state — "The End" page centered, no right board.

## Sharing

Self-contained file → SendUserFile (render), copy to ~/Desktop for Slack drag-and-drop
(recipient downloads, opens in browser; works offline). Artifacts need restructuring
(no doctype/html wrapper) — only do that if the user wants a claude.ai link.
