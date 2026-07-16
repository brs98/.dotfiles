# Factory Ticket Framework

## Contract boundary

Relay owns the current machine-checkable contract. Generate it with `relay ticket template --type <type>` and validate it with `relay ticket check`. Do not copy the full template into this skill; that would create a competing source of truth.

The stable intent is:

- `Why` explains the problem, affected party or system, impact, and evidence.
- `What` defines the observable outcome, acceptance examples, scope boundaries, binding constraints, known context, dependencies, and material open questions.
- There is no prescribed `How`. Implementation is discovered from the repository by the implementing agent.

"No how" does not erase settled facts. Compatibility promises, ADRs, security rules, data-retention requirements, platform limitations, and other authoritative decisions remain binding constraints. File names, suspected causes, logs, and diagnostic observations can be useful known context without becoming required implementation.

## Semantic readiness rubric

A ticket is ready only when all of these are true:

- The problem and affected user or system are identifiable.
- The impact explains why the work is worth doing now.
- The desired result is observable from behavior, state, or evidence.
- Acceptance examples cover the normal path and important failure or edge cases.
- In-scope and out-of-scope boundaries prevent likely scope drift.
- Binding constraints and invariants are explicit and internally consistent.
- Dependencies and source references are accessible to the implementer.
- The work is one independently implementable and reviewable change.
- No unresolved question could materially change acceptance, scope, safety, or product behavior.
- The ticket does not contradict linked authoritative decisions.
- Speculative implementation choices remain open.

If a material question remains, ask it directly. When publication is useful before the answer exists, publish without Relay's execution gate and clearly mark the blocker.

## Type overlays

Use these as semantic prompts beneath the same `Why`/`What` contract:

- **Bug:** observed versus expected behavior, reliable reproduction or frequency, affected environment/version, evidence, and regression expectations.
- **Feature:** desired user/system capability, behavior-level acceptance examples, meaningful boundaries, failure behavior, and product decisions such as defaults or permissions.
- **Refactor:** engineering motivation, observable invariants, explicitly permitted behavior changes, completion evidence, and boundaries that keep cleanup focused.
- **Migration:** starting and target states, affected population/data, compatibility window, completion signals, required rollout safety, rollback outcome, and monitoring signals.

## Scope test

Prefer one ticket when one agent can implement it as one coherent change and a reviewer can accept it independently. Split tickets when outcomes can ship independently, require different repositories or owners, have different risk profiles, or would need separate acceptance decisions. Connect split tickets through explicit dependencies rather than hiding a project plan inside one ticket.

## Execution authority

Drafting, validating, or publishing a ticket is not authorization to execute it. Only apply Relay's configured gate after an explicit request to enqueue, delegate, hand off, or run that ticket. Structural validation alone is insufficient: semantic readiness must also pass.
