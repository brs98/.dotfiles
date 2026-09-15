#!/usr/bin/env python3
"""Merge only setup-owned keys; preserve the remainder of user configuration."""
import argparse
from pathlib import Path
import re
import os
import tempfile
import datetime
import shutil

def set_key(text, section, key, value):
    header = re.search(r'^\[' + re.escape(section) + r'\][ \t]*(?:#.*)?$', text, re.M)
    if not header:
        return text.rstrip() + f'\n\n[{section}]\n{key} = {value}\n'
    rest = text[header.end():]
    boundary = re.search(r'^\[', rest, re.M)
    end = header.end() + (boundary.start() if boundary else len(rest))
    body = text[header.end():end]
    match = re.search(r'^[ \t]*' + re.escape(key) + r'\s*=([^\n]*)$', body, re.M)
    if match:
        old = match.group(1).split('#')[0].strip()
        if old.startswith('[') and not old.endswith(']'):
            raise ValueError(f'Review multiline {section}.{key} manually before merging')
        body = body[:match.start()] + f'{key} = {value}' + body[match.end():]
    else:
        body = body.rstrip() + f'\n{key} = {value}\n\n'
    return text[:header.end()] + body + text[end:]

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Follow an existing config symlink intentionally; preserve it and its mode.
    path = path.resolve()
    if path.exists() and path.read_text() == text:
        return
    if path.exists():
        backups = Path.home() / '.dotfiles-backups' / 'user-config'
        backups.mkdir(parents=True, exist_ok=True, mode=0o700)
        saved = backups / (path.name + '.' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        shutil.copy2(path, saved)
        saved.chmod(0o600)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as f:
        f.write(text)
        tmp = Path(f.name)
    if path.exists(): tmp.chmod(path.stat().st_mode & 0o777)
    os.replace(tmp, path)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        print('Plan: Merge Codex Ctrl+G follow-up keymap; add local CLI/Homebrew PATH and SSH config.d include.')
        print('TOML validation and config comparison run on apply after installing Brewfile Python.')
        return
    try:
        import tomllib
    except ModuleNotFoundError:
        parser.error('Applying user config requires Python 3.11 or newer. Run the packages phase, then rerun the config phase with Homebrew Python.')
    home = Path.home()
    codex = home / '.codex/config.toml'
    text = codex.read_text() if codex.exists() else ''
    tomllib.loads(text)  # Refuse to edit an already-invalid config.
    updated = set_key(set_key(text, 'tui.keymap.global', 'open_external_editor', '[]'), 'tui.keymap.chat', 'edit_queued_message', '"ctrl-g"')
    tomllib.loads(updated)  # Validate the whole document before backups or writes.
    if text != updated:
        print('Merge Codex Ctrl+G follow-up keymap')
        if args.apply: write(codex, updated)
    shell = home / '.zprofile'
    text = shell.read_text() if shell.exists() else ''
    additions = []
    for line in ['export PATH="$HOME/.local/bin:$PATH"', 'if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; elif [[ -x /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)"; fi']:
        if line not in text: additions.append(line)
    if additions:
        print('Add local CLI and Homebrew to login shell PATH')
        if args.apply: write(shell, text.rstrip() + '\n' + '\n'.join(additions) + '\n')
    ssh = home / '.ssh/config'
    include = 'Include ~/.ssh/config.d/*.conf'
    text = ssh.read_text() if ssh.exists() else ''
    if include not in text.splitlines():
        print('Add SSH config.d include')
        if args.apply: write(ssh, include + '\n\n' + text)
    if args.apply:
        (home / '.ssh').chmod(0o700)
        (home / '.ssh/config.d').mkdir(exist_ok=True, mode=0o700)

if __name__ == '__main__': main()
