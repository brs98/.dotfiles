# Product Contract Reference

## Evidence-led interview guide

Ask one question at a time. Prefer the sequence below, but follow the most revealing thread rather than mechanically completing a questionnaire.

1. **Concrete episode:** “Tell me about the last time this happened.”
2. **Mission:** “What were you trying to accomplish, and why did it matter then?”
3. **Existing behavior:** “Walk me through what you actually did.”
4. **Friction or workaround:** “Where did it break down, and what did you do instead?”
5. **Valuable mechanism:** “What helped in a way an ordinary alternative did not?”
6. **Capability:** “What could you do afterward that you could not do before?”
7. **Evidence:** “How did you determine you could do it well enough?”
8. **Stopping point:** “Why did you continue, change direction, or stop?”
9. **Sharing or handoff:** “What should happen for another person receiving this?”

Do not ask whether someone hypothetically wants a feature. Reframe the feature into behavior:

- “We need a mobile app” → When and where could the customer not continue?
- “Lessons need video” → What could the customer not understand or perform in the current medium?
- “Let users share” → What should the recipient be able to do, and what must remain private?
- “It is for everyone” → What breadth promise is intended, and who is the current design center?

## Evidence classification

Keep these categories visibly distinct:

- **Confirmed observation** — a past episode, behavior, workaround, number, artifact, or exact quote. Record the capture date and event date separately; mark an unknown event date rather than guessing.
- **Product hypothesis** — an interpretation that can be tested but is not yet established broadly.
- **Implementation accident** — current technology, architecture, debug UI, or data shape without product evidence.
- **Solution idea** — a possible mechanism such as an app, media type, marketplace, or workflow.
- **Strategic decision** — an explicitly chosen promise or boundary, including its evidence level.

Quote only words preserved in the conversation or source artifact. Use clearly labeled paraphrase for everything else. One person’s two experiences can ground an initial contract; they do not constitute independent market validation. Say so.

## Synthesis prompts

After each episode, identify:

- Actor and triggering situation
- Job or mission
- Desired capability
- Mechanism that created value
- Proof of progress
- Natural stopping point
- Portability, ownership, trust, or privacy constraints

Across contrasting episodes, ask:

- What job and value loop remain stable across domains?
- Which medium, depth, and proof of progress must vary?
- Is the product’s unit of value an artifact, an ongoing journey, a transaction, or something else?
- Which supporting actors can contribute without displacing the primary customer?
- What attractive adjacent product would create the most dangerous scope drift?

## Boundary design

Every contract should make these tensions explicit when relevant:

- Breadth vision versus initial design center
- Customer outcome versus buyer or supporting-actor incentives
- Product responsibility versus real-world/customer responsibility
- Adaptive journey versus fixed artifact
- Private ownership versus sharing or collaboration
- Expert framing versus customer agency
- Appropriate modality versus maximizing media
- Mission achievement versus engagement and retention
- Useful capability versus content completion, certification, or output volume

When presenting options, explain the product direction each option creates, its tradeoff, and the recommended boundary. Record only decisions the user accepts; keep the rest in assumptions or the learning agenda.

## Contract lint

### Purpose and language

- [ ] States that the contract is strategy, not roadmap, PRD, implementation description, or backlog
- [ ] Uses consistent canonical terms and defines ambiguous nouns
- [ ] Separates current implementation from intended product identity
- [ ] Distinguishes settled decisions from assumptions and evidence
- [ ] Every material strategy claim has traceable evidence or is labeled as a decision or hypothesis

### User, problem, and outcome

- [ ] Names a concrete primary-user design-center segment and triggering situation
- [ ] Separates primary beneficiary, buyer/customer, and supporting actors when they differ
- [ ] Keeps any universal ambition as a breadth vision rather than the prioritization audience
- [ ] States the customer’s real-world mission or job without solution language
- [ ] Defines success as changed capability, behavior, understanding, skill, or judgment
- [ ] Describes how “enough” or a stopping point can be recognized

### Product shape and boundaries

- [ ] Defines a stable value loop that can survive changing features
- [ ] Divides responsibility among product, primary user, buyer/customer when distinct, and supporting actors
- [ ] Includes an “is / is not” boundary that can reject plausible work
- [ ] Addresses ownership, privacy, provenance, and sharing when relevant
- [ ] Prevents current architecture from becoming strategy without evidence
- [ ] Records dangerous adjacent categories as explicit non-goals

### Success and learning

- [ ] Names an outcome direction without inventing an unvalidated target
- [ ] Includes guardrails against proxy optimization and engagement traps
- [ ] Marks unsupported claims as hypotheses
- [ ] Contains dated origin evidence and an explicit learning agenda

### Future bets

- [ ] Requires a queryable primary-user segment rather than “users” or “everyone”
- [ ] Requires an evidenced obstacle and customer outcome
- [ ] Requires a direct citation to the contract’s “Why now?” claim
- [ ] Says whether conflicts are rejected or require an explicit amendment
- [ ] Preserves the separate discovery gates for evidence, appetite, metric, and solution test

## Common failure modes

- **Architecture constitution:** the document mainly describes services, clients, tenants, or deployment boundaries.
- **Feature catalog:** the “contract” is a prioritized list of things to build.
- **Persona theater:** invented demographics substitute for observed situations and behavior.
- **Everyone-first:** universal accessibility prevents choosing between conflicting needs.
- **Solution laundering:** apps, AI, video, social features, or marketplaces appear as needs.
- **Engagement capture:** return rate, streaks, or time spent replace customer value.
- **Unfalsifiable virtue:** words such as simple, delightful, trusted, or empowering lack an observable consequence.
- **Permanent no-go:** a boundary cannot be amended even when strategy legitimately changes.
- **Silent pivot:** a product bet contradicts the contract but proceeds without a strategy decision.

## Review response format

Present the draft with:

1. The one-sentence product promise
2. The strongest “is / is not” boundary
3. The primary outcome and guardrail
4. The highest-risk assumption
5. The destination and integration changes
6. A direct request for wording approval
