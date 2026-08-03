---
name: codebase-storybook
description: Turn a codebase's (or subsystem's) git history into an illustrated, page-flipping HTML storybook — narrative chapters, a cast of real contributors with GitHub portraits, period illustrations from Wikimedia Commons, and a timeline appendix, rendered as a self-contained flip-book file. Use when the user wants the history/story/evolution of a repo, app, package, or feature told as a story, storybook, flip-book, or "how did this codebase come to be" document.
---

# Codebase Storybook

Produce a single self-contained HTML file that looks and flips like a hardcover book,
telling the true history of a codebase area from its git record. The flip-book engine,
book styling, and image plumbing are prebuilt — never rebuild them from scratch.

## Workflow

1. **Research (git archaeology).** Spawn parallel Explore subagents over the relevant
   repo(s). Deliverables: chronological eras with dates and PR numbers, top contributors
   (`git shortlog -sn -- <path>`), and *why* evidence from commit messages. See
   [REFERENCE.md](REFERENCE.md) § Research for the command playbook (imports, renames,
   `--follow`, squash-body echoes of predecessor repos).

2. **Write the story.** Structure: cover → colophon → title page → dramatis personae
   (contributors with epithets) → 4–6 chapters (one era each) → epilogue → timeline
   appendix → "The End". Every date, name, and PR must come from the record. See
   REFERENCE.md § Story for tone and the era/moral pattern.

3. **Build the book.** Copy `assets/book-template.html` to the session scratchpad and
   fill in the leaves. The template documents the leaf/spread model and every content
   pattern (chapter page, cast card, callout, beats, moral, timeline, plate). Budget
   ~200–300 words per page; a title block costs about a third of a page. Reference
   images with tokens, don't inline URLs:
   - `%%AVATAR:login%%` — resolve logins via
     `gh api repos/OWNER/REPO/commits/<sha> --jq .author.login` (sha from
     `git log --author="Name" --format=%H -1`)
   - `%%PLATE:File:....jpg%%` — find plates with
     `python3 scripts/commons-search.py "lighthouse wood engraving" ...`
     (pick public domain/CC0; CC BY requires source in the caption)
   - `%%IMG:https://...%%` — any other direct image URL

4. **Embed images.** `node scripts/embed-images.mjs <book.html>` replaces all tokens
   with compressed base64 data URIs (idempotent; exits 2 listing any failures).

5. **Verify in a browser.** Use the agent-browser skill; screenshot and *look at*:
   closed cover, first spread, every spread containing a plate (captions/folios clip
   when a page overruns — trim text or shrink the plate), and the End state. Fix and
   re-verify.

6. **Deliver.** Send the file with SendUserFile (display: render). For Slack sharing,
   copy it to ~/Desktop — it's fully offline-capable; recipients download and open.

## Hard rules

- Truth over drama: invent nothing; if the record is silent, say the record is silent.
- Metaphor-match plates to chapters (standalone era → lighthouse; convergence → rivers
  meeting) and caption with the story's language, not just the source.
- Keep the final file under ~1MB (the embed script recompresses; check its report).
- They/them for any contributor whose pronouns aren't stated.
