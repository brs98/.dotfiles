# Product Bet — Gates, Checklists, and Rationales

Compressed from the product-development-lifecycle teaching workspace
(`~/teaching/product-development-lifecycle/reference/`). Primary sources cited per item.

## Gate rationales (the one-liners to show users)

| Gate | Why (say this) | Source |
|---|---|---|
| Intake reframe | "We don't support X" is a solution wearing a problem costume — no customer behavior means nothing to evaluate or argue with. | [SVPG — problem vs. solution](https://www.svpg.com/discovery-problem-vs-solution/) |
| One-pager before pitch | Cheap evidence before expensive commitment: the one-pager forces "worth further discovery, yes/no?" for an hour's work, not a cycle's. | [Lenny — templates](https://www.lennysnewsletter.com/p/my-favorite-templates-issue-37) |
| Evidence before shaping | Yes-to-a-hypothetical is polite fiction; demand is past behavior — tickets, workarounds, hours spent. | [Torres — Product Discovery Basics](https://www.producttalk.org/2021/08/product-discovery/) |
| Appetite, not estimate | Fix what the problem is worth, then shape the solution to fit; scope is the variable, time is the budget. | [Shape Up](https://basecamp.com/shapeup) |
| Metric before build | A success metric defined after launch is a justification, not a bet; pre-commit so the loop can close honestly. | [GitLab flow](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/), [Perri — Build Trap](https://melissaperri.com/blog/2014/08/05/the-build-trap) |
| Solution test before bet | A bet placed on an untested solution shape converts the whole appetite into the test; a fake door or hand-built artifact tests value in days, not weeks. | [SVPG — Product Discovery](https://www.svpg.com/product-discovery/), [Shape Up](https://basecamp.com/shapeup) |
| Empty-table check at graduation | Discovery and delivery are concurrent tracks; when discovery goes quiet, delivery keeps shipping anyway — that is the feature factory. | [Patton — dual-track](https://www.jpattonassociates.com/dual-track-development/) |
| Passing is healthy | Bets, not backlogs: an explicit "no" frees the appetite for a better problem. | [Shape Up — Bets, Not Backlogs](https://basecamp.com/shapeup) |

## One-pager lint (all must pass before pitch stage)

- [ ] **Falsifiable problem** — 2–4 sentences of customer behavior a skeptic could dispute with evidence
- [ ] **Zero solution language** — no add/build/integrate/redesign, no feature/UI nouns, anywhere
- [ ] **Evidence is specific** — at least one number AND one verbatim quote, both dated
- [ ] **Who is queryable** — a segment you could pull a list of; "users"/"everyone" fails
- [ ] **Why-now survives the swap test** — wouldn't justify any random problem equally well; "a stakeholder asked" is provenance, not priority. Should name which standing outcome-level goal or strategy claim it serves; if that claim lives nowhere outside this bet doc, flag it once and recommend a one-page strategy doc, then proceed (nudge, not a blocker)
- [ ] **Success is an outcome direction** — metric + direction only; targets, solutions, and dates fail here
- [ ] **One page** — if longer, it contains decisions that haven't been earned yet
- [ ] **Ends with** "Not yet decided: the solution."

## Evidence-log entry standard

Each entry: `date — source — finding`. A finding must contain a number or a verbatim quote.
Two **independent kinds** required before shaping (e.g. funnel data + interview quotes; tickets + observed workaround). Interview coaching, when asked:

- Ask for specific past stories: "Tell me about the last time you…" / "Walk me through…"
- Never: "Would you…?", "How likely…?", "Do you find X confusing?" (hands over the hypothesis)
- Generalizations ("usually, how do you…") yield ideal-self answers — chase the incident behind them
- A workaround the customer already maintains is the strongest demand signal there is

## Shaped-pitch checklist (all must pass for "Ready to bet")

- [ ] **Appetite** stated as a time budget ("worth N weeks, no more") — not an estimate
- [ ] **Solution sketch** concrete enough to evaluate, abstract enough to leave room (no pixel-level specs)
- [ ] **Cheapest solution test named** — the fastest/cheapest way to test the sketch's value with a human (fake door, hand-assembled artifact, paper walkthrough); either already run with its result in the evidence log, or committed as the *first slice* of the build. "We'll find out when we ship" fails
- [ ] **Success metric** pre-committed: metric, target, cohort, and measurement window
- [ ] **Rabbit holes** named — the known time-sinks, each with a v1 boundary
- [ ] **No-gos** named — what this bet explicitly will not touch
- [ ] **Instrumentation implied by the metric exists or is in the sketch** — if the events can't be measured, the metric is decoration. If the metric requires recruited humans, recruitment starts at bet time, not ship time — name who recruits them and by when

## Stale-bet review

A bet untouched 3+ weeks gets one of: an evidence task this week, a shaping session, or `Passed (not bet on)` with a one-line reason in **Decision**. Lingering "maybe"s are backlog sludge — the thing this skill exists to prevent.

## Deeper reading

Learner's own references: `~/teaching/product-development-lifecycle/reference/` (lifecycle map, glossary, one-pager template).
Primary sources: [Shape Up](https://basecamp.com/shapeup) · [SVPG articles](https://www.svpg.com/articles/) · [Product Talk](https://www.producttalk.org/2021/08/product-discovery/) · [GitLab flow](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/) · [Cutler — Feature Factory](https://cutle.fish/blog/12-signs-youre-working-in-a-feature-factory)
