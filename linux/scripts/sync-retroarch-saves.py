#!/usr/bin/env python3
"""Bridge Rooms-compatible Card A files to the Git save repository."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

CARD = Path('dolphin-emu/User/GC/USA/Card A')


def playing():
    # Linux comm names are limited to 15 bytes (dolphin-emu-nogui truncates).
    result = subprocess.run(
        ['pgrep', '-x', 'retroarch|dolphin-emu|dolphin-emu-qt2|dolphin-emu-nog'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError('Cannot check for running emulators; sync stopped safely')
    return result.returncode == 0


def link_file(source, target):
    """Publish a link atomically; caller holds the Rooms and sync locks."""
    fd, temporary = tempfile.mkstemp(prefix='.save-sync-', dir=target.parent)
    os.close(fd)
    os.unlink(temporary)
    try:
        os.symlink(source, temporary)
        os.replace(temporary, target)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def bridge(card, tracked, backup):
    if card.resolve() == tracked.resolve():
        return
    for path in sorted(card.glob('*.gci')):
        destination = tracked / path.name
        if path.is_symlink():
            if path.resolve() != destination.resolve():
                raise RuntimeError(f'Unexpected save symlink: {path}')
            if not path.exists():
                path.unlink()  # A committed remote deletion removed the target.
            continue
        if not path.is_file():
            raise RuntimeError(f'Unexpected save entry: {path}')
        # Keep every imported version, and the version it replaces, outside Git.
        for original in (path, destination):
            if original.is_file():
                digest = hashlib.sha256(original.read_bytes()).hexdigest()
                backup.mkdir(parents=True, exist_ok=True)
                archived = backup / (digest + '-' + original.name)
                if not archived.exists():
                    shutil.copy2(original, archived)
        shutil.copy2(path, destination)
        link_file(destination, path)


def publish(card, tracked):
    if card.resolve() == tracked.resolve():
        return
    for source in sorted(tracked.glob('*.gci')):
        if source.is_symlink() or not source.is_file():
            raise RuntimeError(f'Unexpected repository save: {source}')
        target = card / source.name
        if not os.path.lexists(target):
            link_file(source, target)


def main():
    home = Path.home()
    repo = Path(os.environ.get('RETROARCH_SAVES_REPO', home / '.dotfiles/shared/symlink/retroarch/.config/retroarch/saves')).absolute()
    card = Path(os.environ.get('RETROARCH_CARD_DIR', home / '.config/retroarch/saves' / CARD)).absolute()
    tracked = repo / CARD
    state = Path(os.environ.get('XDG_STATE_HOME', home / '.local/state')) / 'retroarch-save-sync'
    state.mkdir(parents=True, exist_ok=True)
    if not card.is_dir() or not tracked.is_dir():
        raise RuntimeError('Card A or save repository is missing; setup is required')
    with (state / 'bridge.lock').open('a') as guard:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        key = hashlib.sha256(os.path.normcase(str(card)).encode()).hexdigest()
        lockdir = card.parent / '.rooms-save-sync' / key
        lockdir.mkdir(parents=True, exist_ok=True)
        with (lockdir / '.rooms-personal-saves.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print('Save sync deferred: Rooms session is active', flush=True)
                return 0
            for journal in (lockdir / 'recovery').glob('*/journal.json'):
                if json.loads(journal.read_text()).get('state') not in ('prepared', 'complete', 'rolled-back'):
                    raise RuntimeError(f'Rooms save recovery required: {journal.parent}')
            if playing():
                print('Save sync deferred: emulator is running', flush=True)
                return 0
            # Validate before importing anything into the repository.
            branch = subprocess.check_output(['git', '-C', str(repo), 'branch', '--show-current'], text=True).strip()
            if branch != 'main':
                raise RuntimeError('Save repository must be on main before synchronization')
            if subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-u']):
                raise RuntimeError('Save repository has unresolved conflicts')
            bridge(card, tracked, state / 'import-backups')
            script = Path(__file__).resolve().with_name('backup-retroarch-saves.sh')
            result = subprocess.run([str(script)], env={**os.environ, 'RETROARCH_SAVES_REPO': str(repo)})
            # Local imports remain linked even when offline; publish remote files only
            # after successful sync, when the repository is known to be consistent.
            if result.returncode == 0:
                publish(card, tracked)
            return result.returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(f'RetroArch save sync: {error}', file=sys.stderr)
        sys.exit(1)
