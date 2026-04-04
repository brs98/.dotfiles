---
name: obsidian-vault-personal
description: Search, create, and manage notes in the personal Obsidian vault with wikilinks and index notes. Use when user wants to find, create, or organize notes in their personal Obsidian vault.
---

# Obsidian Vault (Personal)

## Vault location

`/Users/brandon/personal/obsidian-vault-personal/`

## Structure

```
├── Inbox.md                 # Quick capture, triage to proper location
├── Dashboard.md             # Vault-wide entry point, links to all indexes
├── Projects/                # Scoped, time-bound work
│   └── _Index.md
├── Areas/                   # Ongoing responsibilities (no end date)
│   └── _Index.md
├── Decisions/               # ADRs and significant decisions
│   └── _Index.md
├── Journal/                 # Daily and weekly reflections
│   └── _Index.md
├── References/              # Evergreen research and external docs
│   └── _Index.md
└── Templates/               # Obsidian templates (Project, Decision, Journal, Reference)
```

## Naming conventions

- **Title Case** for all note names
- **Date prefix** for journal entries: `YYYY-MM-DD.md` (daily) or `YYYY-Www.md` (weekly)
- **`_Index.md`** in each folder: Map of Content linking to all notes in that folder
- **No abbreviations** in filenames — prefer clarity over brevity

## Frontmatter

Every note MUST have YAML frontmatter. This is what makes the vault queryable.

```yaml
# Required on all notes
type: project | decision | journal | reference | index | dashboard
status: active | paused | completed | archived | proposed | accepted | superseded

# Common optional fields
tags: []
project: "[[Project Name]]"    # Links note to a project
parent: "[[Parent Note]]"      # For child/variant documents
created: YYYY-MM-DD
date: YYYY-MM-DD               # For journal entries and decisions
source: ""                     # For references (URL or citation)
```

### Querying frontmatter

```
# Find all active projects
Grep pattern="status: active" glob="Projects/*.md"

# Find all decisions for a project
Grep pattern="project:.*Project Name" glob="Decisions/*.md"

# Find all journal entries this month
Glob pattern="Journal/2026-03*.md"

# Find notes by tag
Grep pattern="tags:.*tag-name" glob="**/*.md"
```

## Linking

- Use Obsidian `[[wikilinks]]` syntax: `[[Note Title]]`
- Add a `## Related` section at the bottom of every note with links to related notes
- Index notes (`_Index.md`) are lists of `[[wikilinks]]` organized by status/category
- Cross-link between folders: a Decision should link to its Project, a Journal entry can link to relevant Projects or Decisions

## Workflows

### Search for notes

```
# By filename
Glob pattern="**/*keyword*.md" path="/Users/brandon/personal/obsidian-vault-personal"

# By content
Grep pattern="keyword" path="/Users/brandon/personal/obsidian-vault-personal" glob="*.md"

# By frontmatter property
Grep pattern="type: decision" path="/Users/brandon/personal/obsidian-vault-personal"
```

### Create a new note

1. Choose the correct folder based on note type
2. Use **Title Case** for the filename (date prefix for journal entries)
3. Apply the matching template from `Templates/` (or use Obsidian's insert template command)
4. Fill in all frontmatter fields
5. Add `[[wikilinks]]` to related notes in the `## Related` section
6. Update the folder's `_Index.md` to include a link to the new note

### Find related notes (backlinks)

```
# Find all notes that link to a specific note
Grep pattern="\\[\\[Note Title\\]\\]" path="/Users/brandon/personal/obsidian-vault-personal" glob="*.md"
```

### Find index notes

```
Glob pattern="**/_Index.md" path="/Users/brandon/personal/obsidian-vault-personal"
```

### Navigate vault structure

Start with `Dashboard.md` for a vault overview, or read a folder's `_Index.md` to understand what's in that area.

### Open in Obsidian app

```bash
# Open a specific file
obsidian open file="Dashboard"

# Open a specific file by path
obsidian open path="Projects/My Project.md"

# Search in Obsidian
obsidian search query="keyword"

# List all files
obsidian files

# Read a note
obsidian read file="My Project"
```

## Templates

Templates live in `Templates/` and are registered with Obsidian's core templates plugin. Available templates:

| Template | Folder | Key frontmatter |
|----------|--------|-----------------|
| Project | Projects/ | type, status, tags, created |
| Decision | Decisions/ | type, status, project, date |
| Journal | Journal/ | type, date, tags |
| Reference | References/ | type, tags, source, created |

## Rules

- **Always update `_Index.md`** when creating or archiving a note
- **Always add frontmatter** — notes without it are invisible to structured queries
- **Always add `## Related` links** — this powers Obsidian's graph and makes backlink searches useful
- **Never nest folders deeper than one level** — keep it flat within each top-level folder
- **Use wikilinks, not markdown links** — `[[Note]]` not `[Note](Note.md)`
