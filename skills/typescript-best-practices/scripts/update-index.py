#!/usr/bin/env python3
"""Regenerate the discoverable rule index from the actual Markdown inventory."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
groups = [
    ('narrowing', 'Narrowing'), ('safety', 'Type safety'), ('generics', 'Generics'),
    ('objects', 'Objects'), ('deriving', 'Deriving types'), ('config', 'Configuration'),
    ('modules', 'Modules and declarations'), ('essentials', 'Essentials'),
    ('classes', 'Classes'), ('tooling', 'Tooling'), ('ts-only', 'TypeScript-only features'),
]
files = sorted((root / 'rules').glob('*.md'))
intro = '''---
name: typescript-best-practices
description: Write, review, and refactor TypeScript with version-aware Total TypeScript patterns for narrowing, generics, contracts, and compiler configuration. Distinguish safety requirements from optional design choices.
---

# TypeScript best practices

Apply the relevant guidance to the project's TypeScript version, compiler options, runtime, and intended contracts. Read the matching rule before making a recommendation; this catalog is a reference, not a checklist of mandatory refactors.

## Review approach

- Identify the host and emit pipeline before changing compiler settings. Inspect the effective configuration and run the project's compiler with its existing package manager.
- Preserve runtime behavior, public argument/return contracts, mutation intent, and domain ownership. Structural similarity alone does not justify abstraction or derivation.
- Prefer flow-narrowed types and compiler evidence over syntax heuristics. Modern TypeScript supports correlated destructuring, preserved closure narrowing, and inferred predicates under specific conditions.
- Treat unchecked external data as unknown and validate it. Assertions express trusted contracts; `satisfies` is not runtime validation and does not turn any into a checked type.
- Distinguish static readonly guarantees from freezing. Keep runtime protection when it is required.
- Explain whether a finding is a compiler/type-safety issue, a trusted-invariant review, or optional design/style advice. Do not rewrite valid code merely to match an example.

## Sources and versions

Reviewed against Total TypeScript Pro Essentials and its [workshop source](https://github.com/total-typescript/pro-essentials-workshop/tree/7491e6c5ed45dfcb3593289397e3a68244898128), with current compiler behavior checked using TypeScript 5.9. Each substantive rule links its sources and states relevant assumptions. Specific features require newer minimum versions even where older workshop examples are valid. Verify newer compiler/runtime behavior when it matters.

The examples are isolated unless file markers explicitly form a multi-file example. Intentional negative examples use `@ts-expect-error`; configuration/tooling snippets depend on their stated host. A compiling example alone is not proof of semantic equivalence.

## Rule catalog

'''
text = intro + f'{len(files)} reference files across {len(groups)} categories. Compatibility entries link to canonical guidance rather than duplicating it.\n'
for prefix, title in groups:
    selected = [f for f in files if f.name.startswith(prefix + '-')]
    text += f'\n### {title} ({len(selected)})\n\n'
    for f in selected:
        heading = next((line.removeprefix('# ').strip() for line in f.read_text().splitlines() if line.startswith('# ')), f.stem)
        text += f'- [{heading}](rules/{f.name})\n'
text += '''
## Maintaining this reference

After changing rules, regenerate the index with `python3 scripts/update-index.py` and check references with `python3 scripts/check-index.py`. Validate isolated TypeScript examples using an already installed compiler:

```sh
node scripts/check-examples.cjs /path/to/typescript/lib/typescript.js
```

Use focused compiler/runtime checks for configuration-sensitive and behavior-changing examples as well. Never download dependencies just to run this reference's checks without applying the project's normal package-management workflow.
'''
(root / 'SKILL.md').write_text(text)
