#!/usr/bin/env python3
"""Mac-only file linking: preflight all targets; preserve conflicts unless backed up."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

RUNTIME_DIRS = ['.config/ricekit', '.local/share/nvim', '.local/state/nvim', '.agents/skills', '.claude', 'Library/LaunchAgents']
RUNTIME_LINKS = {'.config/sketchybar/colors.sh', '.config/nvim/colors/ricekit.lua'}

def manifest(repo, home):
    result = {}
    paths = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-z', '--cached', '--others', '--exclude-standard', 'shared/stow', 'mac/stow']).decode().split('\0')
    for path in filter(None, paths):
        parts = Path(path).parts
        if len(parts) < 4 or parts[2] == 'starship':
            continue
        rel = Path(*parts[3:])
        if rel.name.startswith('.stow') or str(rel) in RUNTIME_LINKS or rel.name.endswith(('.bak', '.ricekit-backup')):
            continue
        src = repo / path
        if not src.is_file() and not src.is_symlink():
            continue
        target = home / rel
        if target in result and result[target] != src:
            raise RuntimeError(f'duplicate target: {target}')
        result[target] = src
    for skill in (repo / 'skills').iterdir():
        if (skill / 'SKILL.md').is_file():
            result[home / '.agents/skills' / skill.name] = skill
    result[home / '.claude/skills'] = home / '.agents/skills'
    return result

def inspect(links, home):
    conflicts, changes = [], []
    for target, source in links.items():
        parent = target.parent
        while parent != home:
            if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
                raise RuntimeError(f'unsafe parent (review manually): {parent}')
            parent = parent.parent
        if target.is_symlink() and target.resolve() == source.resolve():
            continue
        if target.exists() or target.is_symlink():
            conflicts.append(target)
        changes.append(target)
    return conflicts, changes

def apply(links, home, backup_conflicts=False, dry_run=True):
    for rel in RUNTIME_DIRS:
        parent = home / rel
        while parent != home:
            if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
                raise RuntimeError(f'unsafe runtime directory (review manually): {parent}')
            parent = parent.parent
    conflicts, changes = inspect(links, home)
    for target in changes:
        print(('BACKUP + LINK ' if target in conflicts else 'LINK ') + str(target))
    if conflicts and not backup_conflicts:
        raise RuntimeError('Conflicts preserved. Review targets above; rerun with --backup-conflicts to move them to a recoverable backup.')
    if dry_run:
        return
    for rel in RUNTIME_DIRS:
        (home / rel).mkdir(parents=True, exist_ok=True)
    backup = home / '.dotfiles-backups' / datetime.datetime.now().strftime('mac-%Y%m%d-%H%M%S-%f')
    if conflicts:
        backup.mkdir(parents=True)
        (backup / 'manifest.json').write_text(json.dumps([str(p.relative_to(home)) for p in conflicts], indent=2))
    for target in changes:
        if target in conflicts:
            saved = backup / target.relative_to(home)
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(saved))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(links[target], target_is_directory=links[target].is_dir())
    if conflicts:
        print(f'Backups: {backup}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--dry-run', action='store_false', dest='apply')
    parser.add_argument('--backup-conflicts', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('macOS only')
    repo = Path(__file__).resolve().parents[2]
    apply(manifest(repo, Path.home()), Path.home(), args.backup_conflicts, not args.apply)

if __name__ == '__main__':
    try:
        main()
    except RuntimeError as exc:
        sys.exit(str(exc))
