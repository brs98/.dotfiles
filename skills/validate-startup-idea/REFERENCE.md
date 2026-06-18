# Reference — Hormozi × YC Validation

The frameworks, question banks, thresholds, and sources behind the skill. All concepts restated in plain language; short attributed phrases are quoted from primary sources listed in §7. Heed the attribution cautions in §8.

---

## 1. The scorecard (Hormozi + YC)

Rate each 0–5 from the conversation; demand evidence, not self-belief. Weights are baked into `scripts/idea-score.mjs`.

| Dimension | Key (for script) | Weight | What a 5 looks like | Roots |
|---|---|---|---|---|
| Problem intensity | `problem_intensity` | 3 | Painful, urgent, "hair on fire", mandatory to solve | Hormozi pain · Hale urgent/mandatory · Seibel intensity |
| Problem frequency | `problem_frequency` | 2 | Hits multiple times a week/day | Hale frequent · Seibel frequency |
| Market size & growth | `market` | 2 | Large and growing ~20%+/yr; big in aggregate $ | Hale popular/growing/expensive · Hormozi growing |
| Willingness to pay | `willingness_to_pay` | 3 | Already pays (or clearly would) real money to solve it | Hormozi purchasing power · Seibel willing-to-pay · YC "charge early" |
| Reachability | `reachability` | 2 | Easy to find/target as a group; a cheap/organic channel exists | Hormozi easy-to-target · Hale acquisition advantage |
| Unfair advantage / founder-market fit | `unfair_advantage` | 2 | Founder is ~1-in-10 in the world for this; or monopoly dynamics | Hale insight (founder/monopoly) · PG founder-market fit |
| Differentiation | `differentiation` | 2 | 10x better than the alternative, not 2–3x — score it with the Value Equation (below) | Hale product (10x) · Hormozi Value Equation |
| Timing ("why now?") | `timing` | 1 | A real tailwind changed in last ~12mo (tech/cost/regulation/behavior) | YC RFS |
| Tarpit risk *(reverse)* | `tarpit_risk` | 2 | 5 = severe tarpit (easy praise, many have failed); 0 = not a tarpit | Caldwell/Seibel |
| Real demand evidence | `demand_evidence` | 3 | Strangers have paid/committed (not opinions/signups) | Mom Test · YC commitment ladder |

**Gating rules (enforced by the script):**
- `demand_evidence < 2` → verdict capped at **PIVOT** (you have a hypothesis, not validation — go test it).
- `tarpit_risk >= 4` → capped at **PIVOT** and flagged.
- Bands on the weighted % otherwise: **GO ≥ 70%**, **PIVOT 45–70%**, **KILL < 45%**.

**Scoring `differentiation` — the Value Equation (Hormozi).** Don't take "it's better" at face value; decompose it into the four levers that set what anyone will pay:

> **Value = (Dream Outcome × Perceived Likelihood of Achievement) ÷ (Time Delay × Effort & Sacrifice)**

Maximize the top (what they want, and their belief it'll work for *them* — moved by proof/guarantees, not just results); minimize the bottom (how long it takes, how much work/risk it costs them). A true 5 is **categorically different** so direct price comparison fails — not a 2–3x feature edge. Probe each lever: is the dream outcome big and specific? Is perceived likelihood backed by evidence? Is it faster *and* lower-effort than the status quo? A weak score on any single lever caps how compelling the offer can feel. *(Caution: the Value Equation grades offer strength, not real demand — a beautifully-scored offer with `demand_evidence < 2` is still a hypothesis.)*

---

## 2. Question banks (use in Phase 2)

**The Mom Test — 3 rules (Fitzpatrick):** talk about *their life*, not your idea; ask about *specific past behavior*, not opinions/futures; talk less, listen more.

**Migicovsky's 5 questions for every user interview (YC):**
1. What's the hardest part about [the thing]?
2. Tell me about the last time you ran into that.
3. Why was that hard?
4. What have you done to try to solve it?
5. What don't you love about the solutions you've tried?

**Seibel's problem questions:** How often do they hit it? How intense is it? Are they willing to pay? Do they know others with it?

**Never:** pitch your idea, ask "would you use/pay for…?", ask which features they want, or fish for compliments. "Compliments are the fool's gold of customer learning."

**Tarpit screen:** Is the only validation *easy praise*? Have many others independently tried and failed? If yes, raise `tarpit_risk`.

**"Why now?" screen:** What changed in the last ~12 months that makes this newly possible? No tailwind = weak timing.

---

## 3. The evidence ladder (what counts)

From worthless → real. Push every conversation toward the next rung.

| Signal | Weight |
|---|---|
| "That's cool" / "I'd buy that" / friends & family enthusiasm | ~zero |
| Email/waitlist signup, demo interest, press spike | weak |
| **Commitment of TIME** (books a real next meeting, runs a trial) | moderate |
| **Commitment of REPUTATION** (intros others, public testimonial) | strong |
| **Non-binding LOI** | weak-for-B2B ("cool story") — not traction |
| **Money** (deposit, pre-order, signed paid pilot, recurring revenue) | strongest |

Rule: treat anything below a paid/signed commitment as a hypothesis. Charging money is a far higher bar than a survey or a signup.

---

## 4. MVP patterns & the test design

Pick the cheapest pattern that can *falsify the killer assumption*:
- **Concierge** — deliver the outcome manually, by hand; customer knows it's hands-on. Best first move for services/B2B.
- **Wizard-of-Oz** — front-end looks automated; humans do the work behind it; users don't know.
- **Landing-page / smoke test** — a page + a real CTA; measure signup→pay conversion (~200–500 visitors for a stable rate).
- **Fake-door (painted-door)** — a button for a not-yet-built feature inside something live; measure click-through.
- **Pre-sale / LOI-to-cash** — sell it before building; money is the validation.

"Do things that don't scale" (PG): recruit the first users manually, set them up yourself, delight a tiny core. Math: ~10%/week from 100 users compounds fast — unscalable effort is cheap while numbers are small.

**A valid test has all of:** a specific audience, an offer they can act on *today*, a channel, a sample size (~50 contacts / ~200+ pageviews), a **pass bar that is a number + a deadline**, and a pre-decided move if it fails.

---

## 5. Validation metrics & thresholds (for "is it working yet?")

- **Weekly growth** (PG, *Startup = Growth*): 5–7% good, 10% exceptional, ~1% = not figured out yet. Measure revenue (or active users pre-revenue).
- **Cohort retention** = truest PMF signal: the curve must *flatten to a non-zero plateau*; sloping to zero = no PMF.
- **Sean Ellis PMF survey:** "How would you feel if you could no longer use this?" → ≥40% "very disappointed" ≈ PMF (sample ≥ ~30).
- **One primary metric** (Cheung): the one you'd bet the company on; it must measure value *already delivered*, not potential.
- **Default alive vs default dead** (PG): on current burn and growth, do you reach profitability on the cash you have?
- **Vanity metrics to ignore:** cumulative signups/downloads, page views, press, headcount, money raised.

---

## 6. Economics — Client-Financed Acquisition (Hormozi)

The unit-economics gate, via `scripts/cfa-calc.mjs`:
- **CFA passes when 30-day gross profit ≥ 2 × (CAC + COGS)** — one customer's early cash funds acquiring + fulfilling them *plus* the next 1–2.
- Levers: charge enough; collect annual/up-front (pulls cash forward); add a point-of-sale upsell (the profit engine).
- Long-run health: **LTGP:CAC ≥ 3:1**. Founders usually price too low — aim for perceived value ≈ 10x price (Hale, Pricing 101).

---

## 7. Sources (primary)

- Kevin Hale, *How to Evaluate Startup Ideas* — ycombinator.com/library/6e-how-to-evaluate-startup-ideas
- Paul Graham — *How to Get Startup Ideas* (paulgraham.com/startupideas.html), *Do Things That Don't Scale* (paulgraham.com/ds.html), *Organic Startup Ideas* (paulgraham.com/organic.html), *Schlep Blindness* (paulgraham.com/schlep.html), *Startup = Growth* (paulgraham.com/growth.html), *Default Alive or Default Dead* (paulgraham.com/aord.html)
- Michael Seibel, *How to Plan an MVP* — ycombinator.com/library/6f-how-to-plan-an-mvp ; *The Real Product/Market Fit* — ycombinator.com/blog
- Dalton Caldwell & Michael Seibel — *Where Do Great Startup Ideas Come From*, *Tarpit Ideas*, *The Two Mindsets That Can Kill Your Startup* — ycombinator.com/library
- Eric Migicovsky, *How to Talk to Users* — ycombinator.com/library/Iq-how-to-talk-to-users
- Gustaf Alströmer, *How to Get Your First Customers* — ycombinator.com/library/Ip
- Tyler Bosmeny (CEO, Clever), *How to Sell* — ycombinator.com/blog/how-to-sell-by-tyler-bosmeny
- *YC's Essential Startup Advice* — ycombinator.com/library/4D
- Rob Fitzpatrick, *The Mom Test* — momtestbook.com
- Alex Hormozi — *$100M Offers / Leads / Money Models* (acquisition.com/books, free training at acquisition.com/training)

## 8. Attribution cautions (keep the skill accurate)
- **"Value/growth hypothesis" is Andy Rachleff / Lean Startup, not Kevin Hale.** Hale's own pair is **threshold belief** (does it work at all) vs **miracle belief** (could it be huge). Don't attribute it to YC/Hale.
- **There is no "PUGMF" acronym** — Hale's six problem traits (popular, growing, urgent, expensive, mandatory, frequent) are an unordered list.
- **Concierge / Wizard-of-Oz / fake-door** are lean-startup vocabulary YC aligns with, not verbatim Seibel terms.
- **"If you're not embarrassed by v1…"** is Reid Hoffman, not YC.
- **"Why now?" and "who desperately needs this?"** are interview/evaluation themes, not fixed application questions (YC's form wording changes yearly).
- Tyler Bosmeny is CEO of **Clever** (edtech), not Clearbit.
