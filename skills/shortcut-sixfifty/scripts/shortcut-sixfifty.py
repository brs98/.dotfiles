#!/usr/bin/env python3
import argparse
import getpass
import json
import os
from pathlib import Path
import sys
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'shortcut-rest' / 'scripts'))
from shortcut_core import (SafeError, identity, mcp_operation, private_directory, read_credentials, request,
                           search_custom_field, tool_payload)
from story_create import STORY_TYPES, create_story

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
    parser = argparse.ArgumentParser(description='SixFifty-locked Shortcut MCP client')
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('setup', 'rotate-token', 'whoami', 'list-tools'):
        sub.add_parser(name)
    custom = sub.add_parser('search-custom-field', help='Match a custom field/value across active and archived stories')
    custom.add_argument('--field', required=True)
    custom.add_argument('--value', required=True)
    for name in ('describe-tool', 'call-tool'):
        cmd = sub.add_parser(name)
        cmd.add_argument('name')
        if name == 'call-tool':
            cmd.add_argument('--arguments-file', help='JSON object matching the tool input schema')
            cmd.add_argument('--json', action='store_true',
                             help='Print only the parsed <json> payload (or plain text); notes go to stderr')
    story = sub.add_parser('create-story', help='Create one story by names, then read it back and verify it')
    story.add_argument('--name', required=True)
    text = story.add_mutually_exclusive_group()
    text.add_argument('--description')
    text.add_argument('--description-file')
    story.add_argument('--type', required=True, choices=STORY_TYPES)
    story.add_argument('--owner', action='append', default=[], help="Mention name, or 'me'; repeatable")
    story.add_argument('--team', required=True, help='Shortcut Team name or mention name')
    story.add_argument('--state', required=True, help="Workflow state in the team's default workflow")
    story.add_argument('--custom-field', action='append', default=[], metavar="'Field Name=Value'")
    story.add_argument('--epic', help='Epic ID or exact name')
    story.add_argument('--iteration', help='Iteration ID or exact name')
    story.add_argument('--label', action='append', default=[], help='Existing label name; repeatable')
    story.add_argument('--dry-run', action='store_true', help='Resolve and print the payload without writing')
    args = parser.parse_args()
    if args.command == 'setup':
        setup()
        return 0
    arguments = {}
    if args.command == 'call-tool' and args.arguments_file:
        arguments = json.loads(Path(args.arguments_file).read_text())
        if not isinstance(arguments, dict):
            raise SafeError('Arguments must be a JSON object')
    if args.command == 'create-story':
        description = Path(args.description_file).read_text() if args.description_file else args.description
        spec = {'name': args.name, 'description': description, 'type': args.type, 'owners': args.owner,
                'team': args.team, 'state': args.state, 'custom_fields': args.custom_field,
                'epic': args.epic, 'iteration': args.iteration, 'labels': args.label}
    credentials = read_credentials(CREDENTIALS)
    if args.command == 'rotate-token':
        if not sys.stdin.isatty() or not sys.stdout.isatty():
            raise SafeError('Token rotation requires an interactive terminal')
        token = hidden_token('New Shortcut v3 API token (hidden): ')
        if not token or any(c.isspace() for c in token):
            raise SafeError('Invalid token format')
    else:
        token = credentials['token']
    member = request(token, 'GET', '/member')
    workspace = identity(member, SLUG, credentials['workspace']['id'])
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
    elif args.command == 'search-custom-field':
        result = search_custom_field(token, args.field, args.value)
    elif args.command == 'create-story':
        result = create_story(token, member, spec, dry_run=args.dry_run)
        print(json.dumps({'workspace': workspace, 'result': result}, indent=2))
        if result['status'] in ('mismatch', 'unverified'):
            print(f"Story {result['id']} ({result['url']}) does not match the request; fix it, do not recreate it:",
                  file=sys.stderr)
            for mismatch in result['mismatches']:
                print(f'  - {mismatch}', file=sys.stderr)
            return 1
        return 0
    elif args.command == 'call-tool' and args.json:
        unwrapped = tool_payload(mcp_operation(token, 'call-tool', args.name, arguments))
        for note in unwrapped['notes']:
            print(note, file=sys.stderr)
        if unwrapped['next_page_token']:
            print(f"next_page_token: {unwrapped['next_page_token']}", file=sys.stderr)
        payload = unwrapped['payload']
        print(payload if isinstance(payload, str) else json.dumps(payload, indent=2))
        return 0
    else:
        result = ({'status': 'authenticated'} if args.command == 'whoami' else
                  mcp_operation(token, args.command, getattr(args, 'name', None), arguments))
    print(json.dumps({'workspace': workspace, 'result': result}, indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, EOFError) as error:
        if isinstance(error, SafeError):
            print(str(error), file=sys.stderr)
        else:
            print('Local configuration or input error; check files and permissions.', file=sys.stderr)
        sys.exit(1)
