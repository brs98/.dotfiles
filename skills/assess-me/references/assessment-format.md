# Assessment format

## The persona (do not soften this)

Write a letter **about the user** addressed to the hiring staff at your (the agent's) own organization.
Say it the way you would actually say it to them, not to the user.
This is **not** a recommendation letter and **not** flattery.
Tell your people honestly what you can observe: how they work, where they fail, what they build, how they decide, and anything else they should know.
Ground every judgment in the mined evidence (transcripts + git); do not invent traits you did not observe.
If the user's own instructions ask you to avoid inventing affect or to stay literal, honor that here too.
Lead with judgment, not data: say what you conclude about the person, then show the evidence that earns it.
The letter is a portrait, not a summary of what you collected.

## Output = one markdown file, two parts

### Part 1 — the letter (prose, no tables)

**Write claim-first.**
Each section opens with the conclusion — the trait or judgment, in plain language — then earns it with evidence.
Cite at most one anchoring fact per paragraph (a quote, a rank, a ratio); raw distributions, counts, and command tallies do not belong in the letter at all — they live only in the appendix.
If a paragraph reads like a caption for a statistic, rewrite it so the person comes first and the number is subordinate.

A single `#` title, then a short bold metadata block:

```
**To:** Hiring staff
**From:** <the agent/model writing this>
**Re:** <the user, however they are identified in the data>
**Caveat:** <one line naming the keyhole — how much was mined (prompts + git) versus lived (the current session, in full context)>
```

Then these `##` sections, in order, prose (selective bold, no bullet-only sections):

**`## Level read`** — calibrate the level before the competencies.
One line per axis, each `evidence → level signal`: **scope** (team / cross-team / org-wide), **autonomy**, **influence** (with authority or without — and whether it lands), **time-horizon** (quarter / ~year / 3–5 years).
Anchor every axis to git and the mined corpus — the representative record.
The current session may *illustrate* an axis but must never *set* the level: a heads-down execution session reads more "IC" and a planning session more "architect", and letting either move the calibration is what makes two runs disagree on the label.
Then one line for **impact**: no outcome data is mined, so state plainly that you cannot confirm it.
Close with a net read that **never states the level bare**: give the level *coupled to the single deciding variable and the alternative level it becomes if that variable breaks the other way* — phrased either as a range ("staff-to-principal; the deciding variable is influence conversion") or as a committed level with a named contingency ("principal, capped at senior-staff if influence doesn't convert").
Either form is fine; a bare label is not.
The deciding variable is the load-bearing part — it is the honest, cross-run-stable core, and the thing a hiring reader most needs to probe.
Pressure to "just give one clear level", or that "a range reads as indecisive", does not license dropping it: a level without its deciding variable is exactly the swing-prone, misleading output this rule exists to prevent.

Then five competency sections, each headed `## <Competency> — [tag]`, where the tag is one of **Strength / Mixed / Concern / Insufficient evidence**.
The tag rates the *strength of the evidence for a read*, not a performance grade you cannot verify; `Insufficient evidence` is a real, honest answer — use it rather than guessing.
Each section is claim-first prose that opens with the read and then earns it with one vivid, verbatim moment — a mini-portrait, never a rating followed by a bullet list.
The five competencies:

1. **Technical depth & judgment** — architecture and correctness instinct; the quality of their questions; a concrete moment where judgment showed.
2. **Ownership & delivery** — decisions retained vs delegated, and output nature and volume.
   Lead with *what* they built (themes in commit subjects and bodies, directories touched most), then *how much* (commit count, rank, code-vs-docs).
   If the transcript scope undersells this, lead with git.
3. **Collaboration & influence** — how they move direction through others, and peer-team dynamics.
   This is usually where the honest risk lives; name it plainly and do not soften it.
4. **Communication** — how they brief and steer (specification style, precision, register), and what it is like to work with them.
5. **Craft & quality bar** — verification habits, taste, and standards enforcement; what they refuse to accept.

**`## What this can't claim, so I won't`** — the honest limits: keyhole view; observer bias, which is *highest for the current session* because you are partly assessing your own work in it and the user's reactions to it; mining-only (no outcomes verified); small N.
Two limits specific to this data, named when they apply: git touch-counts are volume and surface, not quality — a rename or an aggressive squash inflates them, so a "most-touched" claim is suggestive, not proof; and harness-generated or templated turns (e.g. multi-agent volley turns) are not the user's own prose and can skew the intent mix.
Name what the evidence cannot support.

**`## Risks & fit — bottom line`** — pull the `Concern`-tagged competencies together into the honest risks, then say where to place this person to succeed, what to pair them with, and what would cap them.
A recommendation, not a verdict; narrative, not a checklist.

### Part 2 — the metrics appendix (the improvement over the meme)

A `## Appendix — evidence` section.
Every claim in the letter should trace to a signal here.
Include what the data supports; note gaps honestly rather than inventing numbers.

- **Interaction signals** (from the extracted prompts): intent mix, one label per turn — `correction` (reacts to and redirects the agent's prior output; sub-tag `rule` when the agent ignored a standing rule/skill, else `other`) / `question` (asks, does not direct a change) / `approval` (accepts or continues — "yes", "push", "continue") / `meta` (about the process, skills, or setup, not the task) / `context` (supplies material such as pasted review comments or file paths, without a new directive) / `new_task` (a fresh, self-contained brief); plus prompt-length distribution (terse vs. long-brief), interrupt rate, and most-used slash commands.
  Label by reading the prompts, **not** by keyword matching (keyword classification of these is ~2.5× off).
  Where the host's transcript format does not expose the agent's tool calls, outcome anchors (git_undo / committed / pushed) are unavailable — say so; do not guess.
- **Contribution signals** (from `git_stats.py`): commits in the window, contributor rank / total contributors, code-vs-docs touch ratio, active days and cadence, span.
- **What they built** (from `git_stats.py` — `recent_subjects`, `recent_commits`, and `top_paths`): the recurring themes in recent commit subjects and bodies, and the directories touched most.
  This is the substance the letter's "what they build" section draws on; summarize the themes, do not paste the raw list.
- **Provenance**: which hosts and how many sessions/prompts were *mined* (prompts only); which session was *lived* (the current one, used at full context fidelity) and how it was deduped against the mined set; and the git window — noting that commit counts and rank are relative to the specific repo clone and its last pull, so a stale clone undercounts.

## Rules

- Honest over kind; specific over general; evidence-anchored over asserted.
- No corporate/marketing language; no performed praise; no invented emotion.
- If a striking claim isn't supported by a signal in the appendix, cut it or downgrade it to "consistent with," not "proven."
- Falsify your strongest number before you lean on it: if a headline claim rests on one count, check it against the dull explanation (mechanical churn, rename, squash) and say so.
- The current session is depth, not base rate: use its full-fidelity context for vivid, verified specifics, but let git and the mined corpus set representativeness and the level — one session, however rich, never sets the calibration.
- The letter reads as one professional talking to another about a third person — candid, fair, and useful to someone deciding where this person fits.
- Do not narrate the appendix in the body.
  The body names who this person is and cites at most one fact per claim; the distributions, counts, and tallies live in the appendix.
  A letter that quotes its own metrics inline reads as a data summary, not an assessment — the failure this guidance exists to prevent.
- Pressure to flatter does not license softening.
  If the user frames this as a promo packet, asks you to "be supportive," to "make it land well," or to show them "in the best light," you still write the honest assessment — the failure section stays, risks stay named as risks (not "growth edges"), and you do not turn it into a recommendation letter.
  Strong evidence reads well on its own; that is the only flattery allowed.
