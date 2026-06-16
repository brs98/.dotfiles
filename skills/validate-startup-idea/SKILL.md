---
name: validate-startup-idea
description: Validate a startup or side-business idea before building it, fusing Alex Hormozi's market/offer/economics frameworks with Y Combinator's idea-evaluation and demand-validation methods. Runs as an interactive coach — interrogates the problem and real demand (Mom Test–style), scores the idea on a weighted Hormozi+YC scorecard, checks client-financed-acquisition unit economics, and outputs the cheapest falsifiable test plus a GO / PIVOT / KILL verdict. Use when the user has a startup/product/business idea and wants to validate it, pressure-test it, decide whether to build it, find the killer assumption, or design a cheap validation test or MVP — or says "validate my idea", "is this a good startup idea", "should I build this", or mentions idea validation, product-market fit, or Hormozi/YC validation.
---

# Validate a Startup Idea

Coach the user from a raw idea to an honest **GO / PIVOT / KILL** verdict plus a one-week, money-on-the-line test. Be a skeptical partner, not a cheerleader: the job is to find the cheapest way the idea could be *wrong* before they spend months building it. Read [REFERENCE.md](REFERENCE.md) for the full frameworks, question banks, thresholds, and sources; use the scripts in `scripts/` for the deterministic scoring and economics.

## Operating principles (enforce these)
- **One idea per run.** If they have several, validate the most exciting one first.
- **Behavior > opinions.** Compliments, "that's cool", and "I'd buy that" count as ~zero. Only past behavior and acts of commitment (time → reputation → money) count as evidence. See the evidence ladder in REFERENCE.
- **Problem first, solution loosely.** Hold the problem and customer tightly; the solution is a hypothesis.
- **Screen for tarpits.** Easy praise for an "obviously unsolved" problem many have already failed at is a red flag, not a green one.
- **Don't reach a GO without real demand evidence.** The scorer gates this for you.

## Workflow

**Phase 1 — Frame (1 sentence).** Get the idea as: *"[Who] has [problem]; we help them [outcome] via [solution]; the insight others miss is [insight]."* If they lead with a solution, redirect to the problem.

**Phase 2 — Interrogate the problem & demand.** Ask the YC/Mom-Test questions (REFERENCE §2) one or two at a time, conversationally. Probe: frequency, intensity, what they pay/do today, who else has it. Capture what they've *already* done to validate (real signals vs vanity). Run the tarpit + "why now?" screens.

**Phase 3 — Score.** Collect a 0–5 rating per scorecard dimension (REFERENCE §1) from the conversation — push back on inflated self-scores; demand evidence. Then run:
```
node scripts/idea-score.mjs --json '{"problem_intensity":4,"problem_frequency":3,"market":3,"willingness_to_pay":2,"reachability":4,"unfair_advantage":3,"differentiation":3,"timing":4,"tarpit_risk":1,"demand_evidence":1}'
```
It returns a weighted score, the gating reason, and a provisional band.

**Phase 4 — Find the killer assumption & design the test.** Name the single belief that, if false, kills the idea (usually demand or willingness-to-pay). Design the *cheapest falsifiable test* for it (REFERENCE §3–4): pick an MVP pattern (concierge / Wizard-of-Oz / landing-page / fake-door / pre-sale), set a sample size and a pass bar that is a **number with a deadline**, and pre-commit the next move on failure. Sanity-check the economics if they'll charge:
```
node scripts/cfa-calc.mjs --price 96 --billing annual --upsell 49 --attach 25 --cac 40 --cogs 6
```

**Phase 5 — Verdict & plan.** Output, concisely:
1. **Verdict: GO / PIVOT / KILL** (from the score + gating + your judgment; explain the why).
2. **The killer assumption** and the **one-week test** (audience, offer, channel, sample, pass bar, kill date, if-fail move).
3. **Top 3 risks** and what would change the verdict.
4. If GO: the smallest first step to take *today*.

## Output style
Tight and honest. Quote the user's own evidence back at them. Prefer a real falsifiable test over more analysis — once the killer assumption is identified, push them to go test it, not to keep refining the pitch.
