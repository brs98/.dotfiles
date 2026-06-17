---
name: manage-skills
description: Add, author, update, or audit agent skills so they stay tracked in the ~/.dotfiles repo and in sync with the universal pool (~/.agents/skills). Use when the user wants to install/clone a skill from GitHub, create a new skill, update cloned skills, or check that skills aren't drifting out of the dotfiles repo.
---

# manage-skills

Keeps every agent skill — authored or cloned — physically tracked in `~/.dotfiles/skills/`
and symlinked into the universal pool (`~/.agents/skills`, which Claude Code and Pi share).
The deterministic engine is the `skills-sync` script; this skill just drives it.

## The invariant (never break it)

- The dotfiles repo (`~/.dotfiles/skills/<name>/`) is the **one physical home** for every skill.
- The pool (`~/.agents/skills/<name>`) holds **only symlinks** back into the repo (plus
  whitelisted external links like app-bundled skills).
- `~/.agents/.skill-lock.json` (provenance for clones) is copied into the repo on each sync.

## Common tasks

**Clone a skill from someone else.** Use the wrapped CLI — the zsh `skills` function runs
`npx skills` and then auto-reconciles:

```bash
skills add <github-owner/repo>        # or a URL / local path
```

If invoked somewhere the wrapper isn't loaded, run the raw command then reconcile:

```bash
npx -y skills add <source> -g -y && skills-sync
```

**Author a new skill.** Create it directly in the repo (use the `write-a-skill` skill for
structure), then reconcile so it links into the pool:

```bash
# create ~/.dotfiles/skills/<name>/SKILL.md ...
skills-sync                            # links repo → pool
```

**Update cloned skills** to their latest upstream version:

```bash
skills update                          # wrapper reconciles the refreshed clone back into the repo
```

**Audit / verify there's no drift** (read-only; exits non-zero on drift):

```bash
skills-sync check
skills-sync status                     # human-readable summary
```

## Always commit afterwards

Adopted/authored skills are real folders in the repo. The repo's `pre-commit` hook runs
`skills-sync --stage` automatically, so committing captures a consistent tree:

```bash
git -C ~/.dotfiles add skills && git -C ~/.dotfiles commit -m "skills: <what changed>"
```

## Engine reference

`skills-sync [sync|check|adopt|link|prune|status] [--stage] [--quiet]`
(source: `~/.dotfiles/shared/stow/scripts/.local/bin/skills-sync`)

- `sync` (default): adopt untracked pool dirs → repo, link repo skills → pool, prune dangling
  links, copy the lockfile into the repo.
- `check`: report drift and exit 1 — used by the pre-commit hook and CI.
