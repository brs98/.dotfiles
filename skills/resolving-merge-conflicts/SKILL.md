---
name: resolving-merge-conflicts
description: Use when encountering git merge conflicts, seeing conflict markers in files, or when git status shows unmerged paths - analyzes commit history, code context, and change intent to suggest resolutions with explanations
---

# Resolving Merge Conflicts

## Overview

Resolve conflicts by understanding **intent**, not just diffing text. Combine commit analysis, git history, and code context to propose intelligent resolutions.

**Core principle:** The best resolution preserves the intent of both branches, not just the code of one.

## Quick Reference

| Step     | Command                            | Purpose                      |
| -------- | ---------------------------------- | ---------------------------- |
| Commits  | `git log --oneline -10 -- <file>`  | Recent changes to file       |
| Incoming | `git log HEAD..<branch> -- <file>` | What incoming branch changed |
| Blame    | `git blame <file>`                 | Who wrote each line and when |
| Context  | `git log -p -1 <commit>`           | Full change context          |
| Base     | `git merge-base HEAD <branch>`     | Where branches diverged      |

## Process

### 1. Parse the Conflict

Extract HEAD vs incoming sections from conflict markers. Note file path and line range.

### 2. Analyze Intent

- **Commit messages:** Look for the "why" - features, fixes, refactors
- **Git blame:** Understand authorship and timing
- **Code context:** Read surrounding function/class, check related files and tests

### 3. Classify and Resolve

| Type          | When                                               | Approach                         |
| ------------- | -------------------------------------------------- | -------------------------------- |
| Clear winner  | One side objectively correct (bug fix vs outdated) | Choose correct side, explain why |
| Complementary | Both changes valid and combinable                  | Merge both, preserve all intent  |
| Semantic      | Changes contradict each other                      | Present options, ask user        |
| Structural    | Same code modified differently                     | Careful manual merge             |

### 4. Present Resolution

For each conflict, provide:

```markdown
## Conflict in `<file>:<line-range>`

### What Each Side Intended:

**HEAD:** <explanation of current branch's goal>
**Incoming:** <explanation of incoming branch's goal>

### Suggested Resolution:

<merged code>

### Reasoning:

<why this preserves intent>

### Confidence: High | Medium | Low
```

**Always wait for user approval before applying changes.**

## Handling Ambiguity

When confidence is low, present 2-3 options:

```markdown
### Option A: Preserve current behavior

<code + reasoning>

### Option B: Accept incoming change

<code + reasoning>

### Option C: Combine both

<code + reasoning>
```

Ask clarifying questions: "Is X meant to replace Y, or work alongside it?"

## Common Mistakes

| Mistake                       | Why It's Wrong                   | Do This Instead                   |
| ----------------------------- | -------------------------------- | --------------------------------- |
| Auto-resolving without asking | User loses control               | Always wait for approval          |
| Only reading conflict markers | Misses the "why"                 | Check commits and history         |
| Favoring shorter code         | Intent matters more than brevity | Evaluate by purpose               |
| Ignoring related changes      | May miss larger refactor         | Check other files in same commits |
| Assuming latest = correct     | Older code may be intentional    | Analyze both sides equally        |

## Edge Cases

- **Binary files:** Cannot merge - ask user which version to keep
- **Generated files (lock files, etc.):** Suggest regenerating instead of manual merge
- **Large conflicts (50+ lines):** Break into logical sub-conflicts
- **Sparse history (rebased/squashed):** Lean more on code context analysis

## When to Escalate

Ask the user directly for: business logic decisions, conflicting test expectations, architectural choices, or anything where "correct" depends on product direction.
