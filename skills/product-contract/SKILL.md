---
name: product-contract
description: Defines and maintains a repository-level product strategy contract through evidence-led interviews, product-claim audits, explicit boundaries, and a compatibility gate for future bets. Use when a user wants to establish what a product is or is not, create or revise PRODUCT.md, align future product bets, separate product intent from architecture, or prevent features from silently changing strategy.
---

# Product Contract

Create an agreed strategy constitution that future product bets can cite and be challenged against. The output is normally `PRODUCT.md`; it is not a roadmap, PRD, feature wishlist, or product bet.

## Rules

- Do not invent customer evidence, product intent, or market validation.
- Do not let existing architecture decide the audience or product identity.
- Separate confirmed evidence, product hypotheses, implementation accidents, and solution ideas.
- Keep a broad vision separate from the concrete design-center segment used for prioritization.
- Define success as primary-user capability or behavior, not feature adoption or engagement alone.
- Interview with concrete past episodes; avoid hypothetical “would you use” questions.
- Ask one high-leverage question at a time and synthesize after every answer.
- Recommend a boundary when options exist; do not make the user choose from an unexplained menu.
- Get wording approval before integrating or publishing the contract. Adoption governs decisions; it does not upgrade the evidence level or imply market validation.

## Workflow

### 1. Audit current claims

Inspect the repository’s product copy, domain docs, user-facing flows, schemas, tests, history, plans, and metrics. If no repository exists, audit the supplied documents and current conversation and write to the requested destination. Inspect only available, in-scope sources. Map:

- Explicit claims about user, problem, outcome, and value
- Implemented product capabilities
- Architecture or debug behavior masquerading as product intent
- Contradictions, missing decisions, and promise-capability gaps

Follow repository workspace instructions and preserve unrelated changes. Use a focused independent reviewer when available.

If a contract already exists, classify the work as an evidence update, wording clarification, or strategic amendment. Interview only the gaps, preserve accepted claims and amendment history, and never replace the contract wholesale without explicit agreement.

### 2. Interview from evidence

Start with the last concrete time the user experienced the problem or received the intended value. Establish:

- Who they were, what triggered the need, and their real-world mission
- What they tried, what was difficult, and any workaround
- What made the experience useful
- What they could do afterward and how they knew
- What “enough” meant and why they continued or stopped

Capture the interview date separately from the event date. Quote only exact words available in the interview or an artifact; otherwise paraphrase, and mark unknown event dates honestly. For universal product ambitions, seek two contrasting episodes and extract the invariant job without claiming market validation. Use the interview guide in [REFERENCE.md](REFERENCE.md).

### 3. Resolve strategic boundaries

Synthesize the product promise, design center, promised outcome, stable value loop, product/primary-user/buyer/supporting-actor responsibilities, ownership and sharing model, success direction, guardrails, and explicit non-goals. Identify the primary beneficiary, any distinct buyer, and whose outcome wins when incentives conflict. Reframe requested features into underlying needs before including them.

### 4. Draft the contract

Use [TEMPLATE.md](TEMPLATE.md). Label the status and evidence level honestly. Define canonical terms, record origin evidence, and list assumptions as a learning agenda. Make non-goals strong enough to reject work but amendable through an explicit strategy decision.

### 5. Add the pre-bet gate

Require every future bet to name a queryable primary-user segment, address an evidenced obstacle, target an outcome, preserve ownership and trust, stay inside product boundaries, and cite the contract claim behind “Why now?”. A failed bet is passed on or triggers a separate contract amendment; an unknown answer triggers evidence gathering.

This gate precedes rather than replaces the normal product-bet discovery gates. Do not create or publish a bet unless the user also asks.

### 6. Review and integrate

Lint the draft with [REFERENCE.md](REFERENCE.md), then place the working draft in an isolated workspace or review destination and show it to the user. After wording approval:

- Save it as `PRODUCT.md` or the requested destination
- Link it from README/domain documentation so architecture docs cannot supersede it silently
- Verify the documentation diff and preserve unrelated work
- Commit or publish only when authorized

Set the contract status to current when it is adopted for product decisions. Keep evidence level independent: an adopted contract may still consist largely of hypotheses.

### 7. Amend explicitly

When evidence changes the strategy, update the version, date, rationale, evidence level, affected boundaries, and amendment history. Never smuggle a strategy pivot through one feature bet.
