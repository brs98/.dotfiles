#!/usr/bin/env python3
import argparse
import getpass
import json
import os
from pathlib import Path
import sys
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'shortcut-rest' / 'scripts'))
from shortcut_core import SafeError, identity, operation, private_directory, read_credentials, request

SLUG = 'sixfifty'
CREDENTIALS = Path.home() / '.config/shortcut/workspaces/sixfifty/credentials.json'


def hidden_token(prompt):
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        try:
            return getpass.getpass(prompt)
        except getpass.GetPassWarning:
            raise SafeError('Cannot disable terminal echo; token entry cancelled') from None


def setup():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise SafeError('Setup requires an interactive terminal')
    private_directory(CREDENTIALS.parent)
    if CREDENTIALS.exists() or CREDENTIALS.is_symlink():
        raise SafeError('Credentials already exist; use rotate-token to replace the token')
    token = hidden_token('Shortcut v3 API token (hidden; paste then Enter): ')
    if not token or any(c.isspace() for c in token):
        raise SafeError('Invalid token format')
    workspace = identity(request(token, 'GET', '/member'), SLUG)
    fd = os.open(CREDENTIALS, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump({'token': token, 'workspace': workspace}, stream)
    print(json.dumps({'status': 'ready', 'workspace': workspace}))


def main():
    parser = argparse.ArgumentParser(description='SixFifty-locked Shortcut REST client')
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('setup', 'rotate-token', 'whoami', 'members', 'workflows', 'groups', 'labels', 'epics', 'iterations'):
        sub.add_parser(name)
    search = sub.add_parser('search')
    search.add_argument('query')
    search.add_argument('--page-size', type=int, choices=range(1, 26), default=25)
    search.add_argument('--next', help='Relative next URL from the previous search response')
    for name in ('story', 'comments', 'create-story', 'update-story', 'add-comment'):
        cmd = sub.add_parser(name)
        if name != 'create-story':
            cmd.add_argument('id', type=int)
        if name in ('create-story', 'update-story', 'add-comment'):
            cmd.add_argument('--body-file', required=True)
    args = parser.parse_args()
    if args.command == 'setup':
        setup()
        return
    spec = None if args.command == 'rotate-token' else operation(args)
    credentials = read_credentials(CREDENTIALS)
    if args.command == 'rotate-token':
        if not sys.stdin.isatty() or not sys.stdout.isatty():
            raise SafeError('Token rotation requires an interactive terminal')
        token = hidden_token('New Shortcut v3 API token (hidden): ')
        if not token or any(c.isspace() for c in token):
            raise SafeError('Invalid token format')
    else:
        token = credentials['token']
    workspace = identity(request(token, 'GET', '/member'), SLUG, credentials['workspace']['id'])
    if args.command == 'rotate-token':
        import tempfile
        fd, temporary = tempfile.mkstemp(dir=CREDENTIALS.parent)
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump({'token': token, 'workspace': workspace}, stream)
            os.replace(temporary, CREDENTIALS)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        result = {'status': 'token rotated'}
    else:
        result = request(token, *spec) if spec else {'status': 'authenticated'}
    print(json.dumps({'workspace': workspace, 'result': result}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, EOFError) as error:
        if isinstance(error, SafeError):
            print(str(error), file=sys.stderr)
        else:
            print('Local configuration or input error; check files and permissions.', file=sys.stderr)
        sys.exit(1)
