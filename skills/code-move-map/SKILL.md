---
name: code-move-map
description: Build a local, self-contained HTML "code move map" for a refactor — before-files on the left and after-files on the right, each split into labeled blocks with real line ranges, and colored arrows from where each piece of code lived to where it lives now, plus a moves table and an optional Mermaid diagram. Use when the user asks to show what code moved where, visualize a refactor, map where the code went in a PR/branch/commit stack, see an architecture view of what was moved or extracted, or wants "that before/after arrows page" again.
---

# Code Move Map

The page (layout, arrows, hover, filters, table, Mermaid) is prebuilt in
`templates/code-move-map.html`. Your job is the data: accurate blocks, moves and notes in
one JSON file. `scripts/render.py` validates it and writes the page. Never hand-edit HTML.
Script paths below are relative to this skill's base directory (`SKILL_DIR`, normally
`~/.agents/skills/code-move-map`). Both scripts are Python 3 with no dependencies.

## Inputs

A repo, a **base** ref, and one or more **head** refs or commits (a PR, a branch, or a stack
of commits). Optionally, the files to focus on. If the base is unclear, use
`git merge-base main HEAD`. The "after" side is always the final head; with several heads,
each commit or PR becomes its own color category.

## Workflow

1. **Find what moved.**
   - `git log --reverse --format='%h %s' BASE..HEAD` lists the commits, which become the categories.
   - `git diff --stat -M -C BASE..HEAD` lists the touched files, including renames and copies.
   - `git diff --color-moved=dimmed-zebra --color-moved-ws=allow-indentation-change BASE..HEAD -- FILES`
     shows moved lines. Run it per commit (`git show --color-moved=… SHA`) to see which commit moved what.
   - Focus on files that lost or gained whole sections. Leave out one-line call-site edits.
2. **Read both sides.** Read each file at BASE and at HEAD: `git show REF:path`.
3. **Divide each file into logical blocks**, one per function, helper group, endpoint set, or
   phase of a long function. Write labels in plain language ("Plan check", "Answer stream: save,
   errors"), with identifiers in backticks. Cover the whole file in order, with no overlaps.
4. **Get real line numbers. Never guess them.**
   `git show REF:path | grep -n 'function foo\|^export'` finds starts,
   `git show REF:path | awk 'NR>=120 && NR<=140'` confirms ends, and
   `git show REF:path | wc -l` gives `lines`. Give each block an `anchor`: text that
   appears on its start line. `render.py --repo` then fails on any range that drifts.
5. **Decide each block's destination(s) and category.** Every before-block gets a move
   (one or more destinations; a split is several moves from the same block) or the
   `removed` category. Every after-block has a source or the `new` category. Use a `stay`
   category for code that stayed in place.
6. **Say what changed while moving.** For moves you call pure, prove it:
   `python3 SKILL_DIR/scripts/compare.py --repo R BASE:old.ts:90-99 HEAD:new.ts:1-10`
   (an empty ref, as in `:new.ts:1-10`, reads the working tree) prints IDENTICAL, or a
   diff of the changed lines after whitespace is normalized (`--ignore '^\s*//'` drops
   comments). Write the result in plain words ("Only `export` added", "No",
   "~20 lines: send error → `output.refuse`").
7. **Write the data file** in the session scratchpad (e.g. `<topic>-moves.json`), using
   [REFERENCE.md](REFERENCE.md) for the format and `examples/example.json` as the model.
   Add a `diagram` (a Mermaid flowchart of how the code fits together after the change)
   only when the call flow changed.
8. **Render, check and open.**
   ```bash
   python3 SKILL_DIR/scripts/render.py DATA.json -o OUT.html --repo REPO --open
   ```
   Fix every error. Treat warnings as gaps to explain or fix (a block with no move, overlapping
   ranges). `--strict` turns warnings into errors.
9. **Report** the path to the HTML file and a two-line summary of the biggest moves.
   The page stays local. Do not publish or upload it unless the user asks.

## Rules

- Real line numbers only. They come from `grep -n`, `awk` or `wc -l` on `git show REF:path`
  output, and `--repo` must pass.
- Plain-language labels. The table's "Changed while moving?" column holds verified facts,
  not guesses.
- Before `--repo` can check a file, `path` must be its real path in the repo. Put the short
  name to show on the page in `display`.
- Use one category per commit or PR that moved code. Name it so a reader can find the
  commit: `a1b2c3d · helpers extracted`.
