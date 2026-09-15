import json
import os
import stat
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = 'https://api.app.shortcut.com/api/v3'


class SafeError(ValueError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(token, method, path, body=None):
    if not isinstance(token, str) or not token or not token.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in token):
        raise SafeError('Invalid token format')
    if not path.startswith('/') or any(c in path for c in ('#', '\\', '\r', '\n')):
        raise SafeError('Invalid API path')
    req = urllib.request.Request(
        BASE + path, method=method,
        headers={'Shortcut-Token': token, 'Content-Type': 'application/json'},
        data=None if body is None else json.dumps(body).encode(),
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        raise SafeError(f'Shortcut returned HTTP {error.code}; response body suppressed') from None
    except (urllib.error.URLError, TimeoutError):
        raise SafeError('Shortcut network request failed') from None


def private_directory(directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise SafeError('Credential directory must be owned by you with mode 700')


def read_credentials(path):
    private_directory(path.parent)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise SafeError('Credential file must be owned by you with mode 600')
        return json.load(stream)


def identity(member, slug, workspace_id=None):
    workspace = member.get('workspace2', {})
    if workspace.get('url_slug') != slug or not workspace.get('id'):
        raise SafeError('Workspace verification failed')
    if workspace_id is not None and workspace['id'] != workspace_id:
        raise SafeError('Workspace UUID verification failed')
    return {'id': workspace['id'], 'url_slug': workspace['url_slug']}


def operation(args):
    command = args.command
    if command == 'whoami':
        return None
    if command in ('members', 'workflows', 'groups', 'labels', 'epics', 'iterations'):
        return 'GET', '/' + command, None
    if command == 'search':
        params = {'query': args.query, 'page_size': args.page_size}
        if args.next:
            parsed = urllib.parse.urlsplit(args.next)
            if parsed.scheme or parsed.netloc or parsed.path != '/api/v3/search/stories':
                raise SafeError('Unexpected pagination URL')
            return 'GET', '/search/stories?' + parsed.query, None
        return 'GET', '/search/stories?' + urllib.parse.urlencode(params), None
    if command in ('story', 'comments'):
        return 'GET', f'/stories/{args.id}' + ('/comments' if command == 'comments' else ''), None
    body = json.loads(Path(args.body_file).read_text())
    if not isinstance(body, dict):
        raise SafeError('Body must be a JSON object')
    if command == 'create-story':
        return 'POST', '/stories', body
    if command == 'update-story':
        return 'PUT', f'/stories/{args.id}', body
    if command == 'add-comment':
        return 'POST', f'/stories/{args.id}/comments', body
    raise SafeError('Unknown operation')
