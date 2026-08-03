---
name: assess-me
description: >-
  Generate an honest, evidence-grounded assessment of the user — the "report me to the hiring staff" letter — by mining the user's own recent agent-session transcripts (this host's local logs) and git contribution stats, and drawing on the full context of the current session for verified specifics, then composing a candid letter with a metrics appendix.
  Fully local; reads only local files and git and makes no network calls.
  Use when the user asks to assess or report on themselves, run a self-review or "hiring report", generate an honest profile of how they work, or asks what their transcripts and git history reveal about them.
compatibility: >-
  Cross-agent (Claude Code, Codex, opencode, pi, cursor-agent).
  Needs git; Python 3 is recommended for the bundled helpers (standard library only) but the process works without it.
  Reads local session transcripts and git history; makes no network calls and uploads nothing.
metadata:
  version: "0.1.0"
---

# assess-me

Produce a candid, useful assessment of the user, grounded in evidence rather than vibes: their own recent agent-session transcripts and git contribution record, plus the full context of the current session for verified specifics.
Generalizes the "ask your agent to report you to its own hiring staff" prompt into a repeatable, host-agnostic skill.

## Principles

- **Fully local.**
  Read only local files and `git`.
  Make no network calls.
  Do not upload the transcripts or the result anywhere.
  The output stays on disk unless the user shares it themselves.
- **Honest, not flattering.**
  The value is candor.
  Report failure modes and risks as plainly as strengths.
  Anchor every judgment to a signal you actually observed; never invent traits or numbers.
- **You find your own transcripts.**
  You know which host you are running under.
  Locate its transcripts yourself, using the hints catalog for known defaults and your own file tools when a host or path is not listed.

## Procedure

1. **Locate this host's transcripts.**
   Read `references/transcript-sources.md` and use the row for your host; if your host or path is not listed, discover it with your file tools.
   Do not fabricate a location.

2. **Collect the evidence in one call.**
   ```
   python3 scripts/collect.py --host <your-host|auto> --last 20 --repos . --out /tmp/assess-evidence.json
   ```
   This runs the prompt extractor and the git miner and writes one bundle: `prompts` (the user's recent typed prose, filtered) and `git` (contribution stats plus `recent_subjects` and `top_paths` — your material for *what they built*, not just how they prompt).
   Default scope is ~20 recent sessions and the current repo (`--repos` for more).
   If Python is unavailable, follow `references/transcript-sources.md` and run the equivalent `git log` commands yourself.

3. **Add the current session as lived context — your one full-fidelity source.**
   You are running inside a live session, and you hold its full context — the assistant turns, tool results, and outcomes that the miner discards.
   This is the one session you do not have to reconstruct from prompts, so use it for vivid, *verified* specifics: what actually got built, defects you caught, decisions the user made, what you observed directly.
   Weight it for depth, not base rate — it is one session and may be atypical (a session opened only to run this skill contributes nothing; say so rather than inventing).
   Git and the mined corpus set representativeness and the level; the current session never sets the calibration.
   Dedup: it may also appear (as prompts) in the mined set — treat the lived version as authoritative and do not double-count it in the tallies.

4. **Read the mined evidence.**
   Read the extracted prompts and label their intent by *reading* them — not by keyword matching, which is ~2.5× off here.
   Read the git subjects, commit bodies, and top paths to learn what the work actually was.
   Note honestly where a host's format leaves a signal unavailable.

5. **Synthesize before you write — this is what turns data into an assessment.**
   Do not go straight from signals to prose; that produces a summary of the data instead of a portrait of the person.
   Work in two levels, then map to the rubric:
   - **Per session (or session batch):** write the claims that session supports, each paired with the *specific* evidence that earns it — a verbatim quote and the concrete moment, not an abstraction.
     A short low-signal session ("continue", "push") may yield nothing; let it.
   - **Across sessions:** collapse those into the load-bearing claims about the person.
     A claim that *recurs* across sessions is load-bearing (confidence); a claim that appears *once* but is vivid (a real architectural catch) can still headline — n=1 is illustration, not noise.
     Then reconcile every claim against the global git evidence (subjects, commit bodies, rank, ratios), and say so where git confirms or refutes what the transcripts suggested.
     When a claim leans on a single count (a touch-count, a commit tally), stress-test it against the dull explanation first — mechanical churn, a rename, aggressive squashing — and name that check in the letter rather than asserting the flattering read.
   - **Map to the rubric:** sort the claims into the five competencies in `references/assessment-format.md`, and assign each a tag by *evidence strength* (`Strength / Mixed / Concern / Insufficient evidence` — the last is a real answer, not a failure).
     Then calibrate the level from scope, autonomy, influence, and time-horizon — anchored to git and the mined corpus, never to the current session — and state it coupled to the single deciding variable and the alternative level it would become (a range, or a committed level with a named contingency — never a bare label, even when asked for "one clear level"); mark impact as unconfirmable, since no outcome data is mined.

   At large session counts (roughly 50+, more than one context holds), run the per-session level as a fan-out — one sub-agent per session returning `{claim, quote, moment}` — and do the across-sessions synthesis over what they return.

6. **Compose the assessment** *from the load-bearing claims*, exactly per `references/assessment-format.md`: the level read, the five tagged competency sections, the honest limits, and the risks-and-fit bottom line — every letter claim anchored to evidence.
   Write it to one local markdown file (default `./assessment.md`).
   Make no network calls; upload nothing.

## Notes

- Scope defaults: ~20 recent sessions (override with `--last`/`--since`), current git repo (override with `--repos`), output `./assessment.md`.
- `--host auto` (forwarded by `collect.py` to the extractor) merges every store present on the machine — useful when the user works across multiple agent tools and wants the fuller picture.
