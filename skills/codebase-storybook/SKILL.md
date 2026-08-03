---
name: codebase-storybook
description: Turn a codebase's (or subsystem's) git history into an illustrated, page-flipping HTML storybook — narrative chapters, a cast of real contributors with GitHub portraits, period illustrations from Wikimedia Commons, and a timeline appendix, rendered as a self-contained flip-book file. Use when the user wants the history/story/evolution of a repo, app, package, or feature told as a story, storybook, flip-book, or "how did this codebase come to be" document.
---

# Codebase Storybook

Produce a single self-contained HTML file that looks and flips like a hardcover book,
telling the true history of a codebase area from its git record. The flip-book engine,
book styling, and image plumbing are prebuilt — never rebuild them from scratch.

## Workflow

1. **Research (git archaeology).** First run the fact collector:
   `scripts/git-archaeology.sh <repo-dir> [pathspec]` — creation date, volume,
   contributors with resolved GitHub logins/avatars, monthly activity, largest commits
   (import detection), and incident-flavored "why" subjects, in one pass. Then spawn
   parallel Explore subagents only for what needs judgment: era narratives, commit-body
   quotes, cross-repo connections — telling each to SendMessage its full report to
   "main" (idle notifications carry no content). See [REFERENCE.md](REFERENCE.md) § Research for the
   playbook (imports, renames, `--follow`, squash-body echoes of predecessor repos).

2. **Write the story.** Structure: cover → colophon → title page → dramatis personae
   (contributors with epithets) → 4–6 chapters (one era each) → epilogue → timeline
   appendix → "The End". Every date, name, and PR must come from the record. See
   REFERENCE.md § Story for tone and the era/moral pattern.

3. **Build the book.** Copy `assets/book-template.html` to the session scratchpad and
   fill in the leaves. The template documents the leaf/spread model and every content
   pattern (chapter page, cast card, callout, beats, moral, timeline, plate). Budget
   ~200–300 words per page; a title block costs about a third of a page. Reference
   images with tokens, don't inline URLs:
   - `%%AVATAR:login%%` — logins come from the git-archaeology.sh output (never guess
     from names)
   - `%%PLATE:File:....jpg%%` — find plates with
     `python3 scripts/commons-search.py "lighthouse wood engraving" ...`
     (pick public domain/CC0; CC BY requires source in the caption)
   - `%%IMG:https://...%%` — any other direct image URL

4. **Lint + embed.** `node scripts/check-book.mjs <book.html>` catches leftover
   placeholders, broken leaf structure, folio jumps, and pages over the word budget
   (the overflow predictor). Then `node scripts/embed-images.mjs <book.html>` replaces
   all tokens with compressed base64 data URIs (idempotent; exits 2 on failures).
   Re-run check-book after embedding (it also checks final size).

5. **Verify in a browser.** `scripts/verify-book.sh <book.html> <outdir>` (needs the
   agent-browser CLI) prints a numeric overflow report — any listed folio is clipping
   its caption/folio; trim text or shrink the plate — and screenshots every spread.
   Then *look at* the screenshots: cover, cast spread, every plate page, End state.
   Fix and re-verify.

6. **Deliver.** Send the file with SendUserFile (display: render). For Slack sharing,
   copy it to ~/Desktop — it's fully offline-capable; recipients download and open.

## Hard rules

- Truth over drama: invent nothing; if the record is silent, say the record is silent.
- Metaphor-match plates to chapters (standalone era → lighthouse; convergence → rivers
  meeting) and caption with the story's language, not just the source.
- Keep the final file under ~1MB (the embed script recompresses; check its report).
- They/them for any contributor whose pronouns aren't stated.
