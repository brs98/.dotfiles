#!/usr/bin/env python3
"""Validate the skill inventory and local Markdown links without network access."""
from pathlib import Path
import re
import sys
root = Path(__file__).resolve().parents[1]
index = (root / 'SKILL.md').read_text()
rules = sorted((root / 'rules').glob('*.md'))
errors = []
for rule in rules:
    if f'(rules/{rule.name})' not in index:
        errors.append(f'Not linked in SKILL.md: {rule.name}')
for path in [root / 'SKILL.md', *rules]:
    text = path.read_text()
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if '://' in target or target.startswith('#'):
            continue
        local = target.split('#')[0]
        if not (path.parent / local).exists():
            errors.append(f'{path.name}: broken link {target}')
    if path in rules and not re.search(r'https://(?:www\.)?(?:typescriptlang.org|totaltypescript.com|github.com/(?:total-typescript|microsoft)|esbuild.github.io|nodejs.org|vite.dev|code.visualstudio.com|tsx.is|swc.rs)', text):
        # A compatibility stub can cite its canonical local rule.
        if not re.search(r'\]\([^):]+\.md\)', text):
            errors.append(f'{path.name}: missing source or canonical cross-reference')
if errors:
    sys.exit('\n'.join(errors))
print(f'{len(rules)} rule references and local links verified')
