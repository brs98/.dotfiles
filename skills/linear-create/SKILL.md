---
name: linear-create
description: Create Linear epics and sub-issues on the Current team with blocking relations wired for /linear-triage dependency tracking. Use when creating new work items, breaking down features into tasks, or adding sub-issues to existing epics.
user-invocable: true
---

# Linear Issue Creator

Creates Linear issues following the epic + sub-issue pattern. Epics are product-level parent issues describing what to build and why. Sub-issues are technical tasks describing how. Blocking relations between issues drive dependency tracking via `/linear-triage`.

Two flows:
1. **Full flow** — Create a new epic with sub-issues
2. **Add sub-issues** — Add sub-issues to an existing epic

## Field Reference

All issues target the **Current** team. These values are exact — do not improvise alternatives.

### Epic (parent issue)

| Field | Value | Required |
|-------|-------|----------|
| `team` | `"Current"` | Yes |
| `state` | `"Cycle Epics"` | Yes |
| `labels` | `["EPIC"]` | Yes |
| `title` | `"Epic: <name>"` | Yes |
| `description` | Product-level (see Description Guide) | Yes |
| `project` | Ask the user which project | Yes |
| `assignee` | Ask the user who owns the epic | No |
| `priority` | Ask or infer (default: 3 = Normal) | No |
| `cycle` | Current active cycle (see Discovering the Current Cycle) | No |
| `estimate` | Ask if the user tracks estimates | No |
| `blocks` | Epic identifiers this blocks | Wire in Step 3 |
| `blockedBy` | Epic identifiers blocking this | Wire in Step 3 |

### Sub-issue (child task)

| Field | Value | Required |
|-------|-------|----------|
| `team` | `"Current"` | Yes |
| `state` | `"Todo"` | Yes |
| `labels` | Default: none. Optionally `["ready-for-agent"]` after explicit AI-readiness check (see Step 4a). NEVER `"EPIC"`. | - |
| `title` | Short technical task name | Yes |
| `description` | Technical implementation (see Description Guide) | Yes |
| `parentId` | The epic's identifier (e.g., `"CURRENT-82"`) | Yes |
| `project` | Same project as the parent epic | Yes |
| `assignee` | Ask the user, or leave unset | No |
| `priority` | Ask or infer (default: 3 = Normal) | No |
| `cycle` | Same cycle as the parent epic | No |
| `estimate` | Ask if the user tracks estimates | No |
| `blocks` | Sibling sub-issue identifiers this blocks | Wire in Step 5 |
| `blockedBy` | Sibling sub-issue identifiers blocking this | Wire in Step 5 |

### Discovering the current cycle

`list_cycles` requires the team UUID, not the team name. Resolve it first:

1. `list_teams` — find the "Current" team and note its `id`
2. `list_cycles(teamId: "<uuid>", type: "current")` — returns the active cycle

Use the cycle's `number` or `id` when setting the `cycle` field on issues.

## Description Guide

### Epic descriptions (product-level)

Explain **what** the feature is and **why** it matters. Do not describe implementation.

Structure:
1. **Problem** — What user pain or business need does this address?
2. **Solution** — What does the feature do, from the user's perspective?
3. **Success criteria** — How do we know it's done? (observable outcomes, not code)
4. **Scope boundaries** — What is explicitly out of scope?

Example:

> ## Problem
>
> Reps cannot see which products are eligible for promotional pricing without switching between three different screens, leading to missed upsell opportunities.
>
> ## Solution
>
> Surface promotional pricing eligibility directly on the product card in the rep's active order view, with a visual indicator and one-click apply action.
>
> ## Success criteria
>
> - Reps can see promo eligibility on every product card without navigating away
> - Applying a promo takes one click from the product card
> - Promo pricing is reflected in the order total immediately
>
> ## Out of scope
>
> Promo creation/management UI, bulk promo application, historical promo reporting.

### Sub-issue descriptions (technical)

Explain **how** to implement and **how to verify**. Be specific about code locations and behavior.

Structure:
1. **Summary** — What changes and why in 1-2 sentences
2. **What to change** — Files, modules, APIs, or components affected
3. **Implementation notes** — Key technical decisions or constraints
4. **Acceptance criteria** — Testable assertions (checkbox style)

Example:

> ## Summary
>
> Add a promo eligibility badge to the product card using the existing BFF endpoint and design system badge component.
>
> ## What to change
>
> `OrderProductCard` component, `usePromoEligibility` hook (new), `promo-api.ts` client
>
> ## Implementation notes
>
> - Promo eligibility endpoint already exists (`GET /api/promos/eligible?productId=X&orderId=Y`) — add a React Query hook to call it
> - Badge component from the design system (`PromoBadge`) can be reused
> - Must not add a network request per card — batch eligible product IDs in a single call at the order level
>
> ## Acceptance criteria
>
> - [ ] Product cards in active order view show a promo badge when eligible
> - [ ] Clicking "Apply Promo" on a card applies the promo and updates the order total
> - [ ] Cards with no eligible promos show no badge (no empty state)
> - [ ] Promo eligibility loads in a single batched request, not per-card

## Agent Brief (for `ready-for-agent` sub-issues)

When a sub-issue is labeled `ready-for-agent`, post a separate **comment** on the issue with the structured agent-brief template below, in addition to the technical description in the issue body.

**Why a comment, not just the body:** the agent brief is the durable contract that the autonomous sandcastle runner works from. Issue bodies tend to evolve as discussion happens — scope changes, context links accrue, formatting drifts. Pinning the brief as a comment freezes it at the moment of human approval. The body remains for ongoing context; the brief stays stable.

Pattern adapted from [mattpocock/skills `AGENT-BRIEF.md`](https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/AGENT-BRIEF.md).

### Brief principles

1. **Durable over precise** — the issue may sit in `ready-for-agent` for days. Code moves. Reference types, function signatures, and behavioral contracts. Do NOT reference file paths or line numbers — they go stale.
2. **Behavioral, not procedural** — describe what the system should do, not how to implement. The agent will explore the codebase fresh and decide implementation.
3. **Complete acceptance criteria** — every brief MUST have testable criteria. The agent needs to know when it's done.
4. **Explicit scope boundaries** — state what is out of scope. Prevents gold-plating and assumption-driven sprawl.

### Brief template

```markdown
> *This brief was generated by AI during issue creation. The autonomous sandcastle runner will work from this comment, not from the issue body.*

## Agent Brief

**Category:** bug / enhancement / refactor / chore
**Summary:** one-line description of what needs to happen

**Current behavior:**
Describe what happens now. For bugs, the broken behavior. For enhancements,
the status quo the feature builds on.

**Desired behavior:**
Describe what should happen after the agent's work is complete. Behavioral, not
procedural — name types, function signatures, or contracts the agent should
look for or modify, not file paths.

**Acceptance criteria:**

- [ ] Concrete, independently verifiable criterion 1
- [ ] Concrete, independently verifiable criterion 2
- [ ] All affected packages pass `pnpm typecheck` and `pnpm test`

**Pointers (durable):**

- Type or interface name to look for: `<Name>`
- Existing pattern to follow: `<short reference>`
- Test file that should grow new cases: `<test name>` (no path)

**Out of scope:**

- What the agent should NOT modify
- Adjacent improvements that look tempting but are deferred

**Relates to:**

- Parent epic: CURRENT-N
- Blocked by: CURRENT-N (if any — already wired in Linear relations)
```

### Example

> *This brief was generated by AI during issue creation. The autonomous sandcastle runner will work from this comment, not from the issue body.*
>
> ## Agent Brief
>
> **Category:** enhancement
> **Summary:** Add a promo eligibility badge to product cards in the active order view.
>
> **Current behavior:**
> Product cards in the rep's active order view do not surface promotional pricing eligibility. Reps must navigate to a separate screen to check.
>
> **Desired behavior:**
> Each `OrderProductCard` displays a promo badge when the product is eligible for a promo on the current order. Clicking the badge applies the promo and updates the order total. Cards with no eligible promo render no badge (no empty state).
>
> **Acceptance criteria:**
>
> - [ ] Eligible products show a `PromoBadge` (existing primitive); ineligible products show no badge
> - [ ] Clicking "Apply Promo" applies via the existing `applyPromo` mutation and order total updates within one render cycle
> - [ ] Eligibility data loads in a single batched request scoped to the order, not per-card
> - [ ] `pnpm typecheck` and the orders package's `pnpm test` pass
>
> **Pointers (durable):**
>
> - Component to extend: `OrderProductCard`
> - New hook to add: `usePromoEligibility(orderId)` — returns `Map<productId, PromoEligibility>`
> - Existing endpoint: `GET /api/promos/eligible?orderId=X` (already takes a list of product IDs)
> - Existing primitive: `PromoBadge` from `@fluid-app/ui-components`
>
> **Out of scope:**
>
> - Promo creation/management UI
> - Bulk promo application across multiple orders
> - Historical promo reporting
>
> **Relates to:**
>
> - Parent epic: CURRENT-95

## Flow 1: Create Epic with Sub-issues

### Step 1: Gather information

Ask the user for:
- **What** they want to build (the product requirement)
- **Which project** it belongs to — use `list_projects` to help them pick if unsure
- **Who owns it** — the assignee responsible for the epic
- **Priority** — if not stated, default to Normal (3)

### Step 2: Discover existing epics

Before creating anything, fetch existing active epics to understand the dependency landscape:

```
list_issues(team: "Current", label: "EPIC", state: "Cycle Epics")
```

Present the list to the user and ask:
- "Does this new epic **depend on** (is blocked by) any of these?"
- "Does this new epic **block** any of these?"

If the user is unsure, help them reason about it: if Epic A must be finished before Epic B can start, then B is `blockedBy` A (equivalently, A `blocks` B).

### Step 3: Create the epic

Use `save_issue` with all required epic fields from the Field Reference. Include `blocks` and/or `blockedBy` arrays with the identifiers of related epics from Step 2.

Record the returned identifier (e.g., `CURRENT-95`) — sub-issues need it as `parentId`.

### Step 4: Break down into sub-issues

Analyze the epic's scope and propose technical sub-issues. For each:
- Write a short, specific title (not "Implement feature" — name the specific component, endpoint, or module)
- Write a technical description following the Description Guide
- Identify dependencies between sub-issues

Present the proposed breakdown to the user for approval before creating. Include:
- Titles and brief descriptions
- Dependency ordering (which blocks which)
- Any sub-issues that can be worked in parallel

### Step 4a: AI-readiness check (per sub-issue)

For each proposed sub-issue, ask the user whether to apply the **`ready-for-agent`** label. This label is what feeds the autonomous sandcastle backlog runner — without it, sub-issues stay in the human queue.

**Default to NO.** AI-readiness is the exception, not the default. Wrong-positives (mislabeled tickets) cost real triage time when sandcastle opens a misleading PR; wrong-negatives (un-labeled but AI-safe tickets) just sit and can be labeled later.

Surface the heuristics to the user when asking:

| ✅ Good AI candidate | ❌ Bad AI candidate |
|---|---|
| Narrow scope (one package, one module) | Touches payment, auth, or data-sensitive code |
| Has clear, testable acceptance criteria | Requires UX or product judgment |
| Mechanical (typo, dep bump, rename, formatter) | Ambiguous spec or open-ended exploration |
| Failing test → green test loop is plausible | Customer-visible behavioral change |
| Low blast radius if it's wrong | Irreversible (DB migration, API contract change) |

Phrase the question concretely per sub-issue, e.g.:

> "Sub-issue 'Add promo badge to product card' — apply `ready-for-agent`?
> Pros: narrow scope (one component), testable. Cons: customer-visible UX. **Recommend: no, leave for human review.**"

Record the user's per-sub-issue choice. The chosen labels go into `save_issue` in Step 6.

### Step 5: Wire sub-issue dependencies

Before creating sub-issues, map out their internal dependency order:
- Which sub-issues must be done before others can start?
- Which can be worked in parallel?

Express this as `blocks`/`blockedBy` relations between sibling sub-issues.

### Step 6: Create sub-issues

Create each sub-issue with `save_issue`, using the sub-issue fields from the Field Reference. Set `parentId` to the epic's identifier. Include `blocks`/`blockedBy` for sibling dependencies from Step 5. Apply `["ready-for-agent"]` to the `labels` field only for sub-issues the user approved in Step 4a.

**Create in dependency order** — blockers first, so their identifiers are available for `blockedBy` arrays on later issues.

### Step 6a: Post Agent Briefs (only for `ready-for-agent` sub-issues)

For every sub-issue created in Step 6 that carries the `ready-for-agent` label, post a separate **comment** on it with a structured Agent Brief (see "Agent Brief" section above for the template and principles).

Use the Linear MCP `create_comment` tool:

```
create_comment(issueId: "<sub-issue uuid>", body: "<filled-in brief markdown>")
```

The brief MUST:

- Begin with the disclaimer line: `> *This brief was generated by AI during issue creation. The autonomous sandcastle runner will work from this comment, not from the issue body.*`
- Follow the template structure (Category → Summary → Current → Desired → Acceptance criteria → Pointers → Out of scope → Relates to)
- Reference types/contracts/patterns by name, NOT file paths or line numbers
- Have at least 2 testable acceptance criteria
- State at least one explicit out-of-scope item

If you cannot fill in any required section with concrete content, it means the sub-issue is not actually agent-ready — DO NOT post a placeholder brief. Instead:

1. Tell the user the sub-issue lacks specificity for an agent brief
2. Offer to either (a) drop the `ready-for-agent` label and leave it for human implementation, or (b) iterate on the description with the user until the brief is fillable

Sub-issues without the `ready-for-agent` label do NOT get a brief — humans read the issue body directly.

### Step 7: Verify with /linear-triage

Run `/linear-triage` against the project to confirm:
- The epic appears in EPIC BREAKDOWN with all sub-issues listed
- Blocking relations appear correctly in the DEPENDENCY GRAPH
- The RECOMMENDED WORK ORDER reflects the intended sequencing

If anything looks wrong, use `save_issue` with `id` to fix relations.

## Flow 2: Add Sub-issues to Existing Epic

### Step 1: Identify the target epic

The user provides an epic identifier (e.g., `CURRENT-82`). Fetch it with its relations:

```
get_issue(id: "CURRENT-82", includeRelations: true)
```

### Step 2: Understand existing children

Fetch existing sub-issues:

```
list_issues(parentId: "CURRENT-82")
```

Review their titles, statuses, and blocking relations to understand what work already exists and where new sub-issues fit.

Present the existing breakdown to the user: "This epic currently has these sub-issues: [list with status]. What additional work needs to be added?"

### Step 3: Propose new sub-issues

Based on the user's request and the existing sub-issues, propose new sub-issues. For each, identify:
- Does it depend on any **existing** sub-issue? (`blockedBy`)
- Does any **existing** sub-issue depend on it? (`blocks`)
- Dependencies among the **new** sub-issues themselves

Present the plan to the user for approval.

### Step 4: Create and wire

Create each new sub-issue with `save_issue` using sub-issue fields from the Field Reference. Set `parentId` to the epic's identifier. Wire `blocks`/`blockedBy` to both existing and new sibling issues. Apply `["ready-for-agent"]` only for sub-issues the user explicitly approved (run the Step 4a check from Flow 1 — the same heuristics apply).

**Note:** Relations are append-only. Setting `blocks: ["CURRENT-XX"]` on a new issue adds the relation without disturbing existing relations on the target issue.

### Step 4a: Post Agent Briefs

For every newly-created sub-issue carrying `ready-for-agent`, post an Agent Brief comment per Step 6a of Flow 1 (template and rules in the "Agent Brief" section above).

### Step 5: Verify with /linear-triage

Same as Flow 1 Step 7. Run `/linear-triage` on the project and confirm the updated epic breakdown and dependency graph look correct.

## Hard Rules

1. **ALWAYS use team `"Current"`** for every issue. Never create issues on other teams.
2. **ALWAYS set epic status to `"Cycle Epics"`** and label to `["EPIC"]`. No exceptions.
3. **ALWAYS set sub-issue status to `"Todo"`**. Never set sub-issues to "Cycle Epics" or any other status.
4. **ALWAYS prefix epic titles with `"Epic: "`**. Sub-issues never get this prefix.
5. **NEVER add the `"EPIC"` label to sub-issues.** Only epics get it.
6. **NEVER create an epic without checking blocking relations.** Fetch existing epics and ask the user. An epic with no relations is almost always a mistake — at minimum confirm with the user that it truly has no dependencies.
7. **NEVER create sub-issues without `parentId`.** Every sub-issue must be parented to its epic.
8. **NEVER skip verification.** Always run `/linear-triage` after creating issues to confirm the dependency graph is correct.
9. **ALWAYS create in dependency order.** When creating a set of sub-issues where A blocks B, create A first so its identifier is available for B's `blockedBy` field.
10. **ALWAYS present the plan before creating.** Show proposed titles, descriptions, and blocking relations to the user and get explicit approval before calling `save_issue`.
11. **ALWAYS default `ready-for-agent` to NO.** Apply the label only when the user explicitly opts in for a specific sub-issue after seeing the AI-readiness heuristics in Step 4a. The label gates the autonomous sandcastle runner — wrong-positives create misleading PRs.
12. **NEVER apply `ready-for-agent` to an epic.** Only sub-issues feed the agent queue. Epics are coordination containers; their sub-issues are the actionable units.
13. **EVERY `ready-for-agent` sub-issue MUST have an Agent Brief comment.** The brief is the durable contract sandcastle works from. If you cannot fill in the brief with concrete content, the sub-issue is not actually agent-ready — drop the label or iterate on the description.
14. **NEVER reference file paths or line numbers in an Agent Brief.** Use type names, function signatures, and behavioral contracts. The brief may sit unworked for days; file paths go stale. (This rule does NOT apply to the issue body, which is human context.)

## Common Mistakes

- **Forgetting blocking relations between epics.** Every new epic should be checked against existing epics for dependencies. Run `list_issues` with `label: "EPIC"` and `state: "Cycle Epics"` first.
- **Setting wrong status.** Epics get `"Cycle Epics"`, sub-issues get `"Todo"`. Mixing these up breaks the board layout and `/linear-triage` categorization.
- **Vague sub-issue titles.** "Backend work" or "Frontend changes" are not actionable. Each sub-issue should name a specific component, endpoint, or module.
- **Product language in sub-issue descriptions.** Sub-issues are for engineers. Describe files, APIs, and testable behavior — not user stories.
- **Technical language in epic descriptions.** Epics are for product alignment. Describe the user problem and outcome — not the implementation approach.
- **Creating sub-issues without checking existing ones.** When adding to an existing epic, always fetch current children first to avoid duplicates and properly wire dependencies.
- **Skipping `/linear-triage` verification.** The whole point of wiring relations is to feed the dependency resolver. If you don't verify, you can't catch wiring mistakes.

## Relationship with /linear-triage

This skill creates issues. `/linear-triage` reads them. They form a create-then-verify loop:

1. `/linear-create` creates epics and sub-issues with blocking relations
2. `/linear-triage` analyzes those relations to produce work order and dependency graphs
3. If `/linear-triage` output doesn't match intent, come back and fix relations with `save_issue`

The blocking relations (`blocks`/`blockedBy`) are the critical data that connects the two skills. Without them, `/linear-triage` cannot determine work order, and issues appear as unrelated items with no prioritization signal.

**What `/linear-triage` expects:**
- Epics have children (sub-issues with `parentId` set) — shown in EPIC BREAKDOWN
- Issues have `blocks`/`blockedBy` relations — shown in DEPENDENCY GRAPH and used for topological sort
- Statuses are from the Current team's workflow — used for in-progress/done/canceled filtering
