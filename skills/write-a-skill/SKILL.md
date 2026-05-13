---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing Skills

## Process

1. **Gather requirements** - ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?

2. **Draft the skill** - create files at `~/.dotfiles/skills/<skill-name>/`:
   - `SKILL.md` with concise instructions (required)
   - Additional reference files if content exceeds 500 lines
   - Utility scripts if deterministic operations needed

3. **Review with user** - present draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?
   - Should any section be more/less detailed?

4. **Activate locally via symlink** - skills you author live in `~/.dotfiles/skills/` and
   are exposed to every harness through a symlink under `~/.agents/skills/`. For a new
   skill, create the symlink once:
   ```bash
   ln -s ~/.dotfiles/skills/<skill-name> ~/.agents/skills/<skill-name>
   ```
   Editing an existing dotfiles-authored skill needs no symlink step — the symlink chain
   (`~/.claude/skills/` → `~/.agents/skills/<skill-name>` → `~/.dotfiles/skills/<skill-name>`)
   means edits in dotfiles are live across all harnesses immediately.

5. **Commit and push to dotfiles** - once approved:
   ```bash
   cd ~/.dotfiles
   git add skills/<skill-name>
   git commit -m "Add <skill-name> skill"
   git push origin main
   ```
   The push is for version history and distribution to other machines — not for local
   activation (the symlink already handles that).

### Bootstrapping a new machine

On a fresh machine, install the dotfiles-authored skills via `npx skills`:
```bash
npx -y skills add brs98/.dotfiles --skill <skill-name> -g -y
```
This installs them as real copies under `~/.agents/skills/` and registers them in
`~/.agents/.skill-lock.json`. After bootstrapping, replace each one with a symlink to the
dotfiles checkout for the same instant-edit workflow:
```bash
rm -rf ~/.agents/skills/<skill-name>
ln -s ~/.dotfiles/skills/<skill-name> ~/.agents/skills/<skill-name>
```

### Caveats

- **Do not run `npx skills update`** for skills you've symlinked from dotfiles — it would
  overwrite the symlink with a freshly-fetched copy from GitHub. Only run `skills update`
  for third-party skills (mattpocock, vercel-labs, etc.) that remain as real copies under
  `~/.agents/skills/`.
- **Don't snapshot upstream skills into dotfiles.** If a skill is installed from an
  upstream source (e.g. `mattpocock/skills`), don't keep a duplicate in `~/.dotfiles/skills/` —
  it'll drift from upstream and create confusion. Either fork it intentionally (and remove
  the upstream tracking from `~/.agents/.skill-lock.json`) or just consume it from upstream.

## Skill Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if needed)
├── EXAMPLES.md        # Usage examples (if needed)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

## SKILL.md Template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [REFERENCE.md](REFERENCE.md)]
```

## Description Requirements

The description is **the only thing your agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give your agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives your agent no way to distinguish this from other document skills.

## When to Add Scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to Split Files

Split into separate files when:

- SKILL.md exceeds 100 lines
- Content has distinct domains (finance vs sales schemas)
- Advanced features are rarely needed

## Review Checklist

After drafting, verify:

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md under 100 lines
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep
