import json
import os
import stat
import urllib.error
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


def search_custom_field(token, field_name, value_name):
    fields = request(token, 'GET', '/custom-fields')
    matches = [field for field in fields if field['name'].casefold() == field_name.casefold()]
    if len(matches) != 1:
        raise SafeError('Custom field name must match exactly one field')
    field = matches[0]
    values = [value for value in field['values'] if value['value'].casefold() == value_name.casefold()]
    if len(values) != 1:
        raise SafeError('Custom field value must match exactly one value')
    value = values[0]
    stories = {}
    scanned = set()
    keys = ('id', 'name', 'description', 'app_url', 'archived', 'story_type',
            'completed', 'started', 'workflow_state_id', 'epic_id', 'iteration_id',
            'created_at', 'updated_at', 'custom_fields')
    for archived in (False, True):
        batch = request(token, 'POST', '/stories/search', {
            'archived': archived, 'includes_description': True,
        })
        if not isinstance(batch, list):
            raise SafeError('Unexpected story query response; completeness cannot be verified')
        for story in batch:
            scanned.add(story['id'])
            if any(item.get('field_id') == field['id'] and item.get('value_id') == value['id']
                   for item in story.get('custom_fields', [])):
                stories[story['id']] = {key: story.get(key) for key in keys}
    return {
        'field': {'id': field['id'], 'name': field['name']},
        'value': {'id': value['id'], 'name': value['value']},
        'includes_archived': True, 'scanned_count': len(scanned),
        'matched_count': len(stories),
        'stories': sorted(stories.values(), key=lambda story: story['id']),
    }


def mcp_operation(token, command, name=None, arguments=None):
    import subprocess
    bridge = Path(__file__).resolve().parents[1] / 'mcp/bridge.mjs'
    environment = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR') if key in os.environ}
    import signal
    process = subprocess.Popen(
        ['node', str(bridge)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, env=environment, start_new_session=True,
    )
    try:
        output, _ = process.communicate(
            json.dumps({'token': token, 'command': command, 'name': name, 'arguments': arguments or {}}),
            timeout=90,
        )
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise SafeError('Shortcut MCP interrupted or timed out; verify write outcome before retrying') from None
    if process.returncode:
        raise SafeError('Shortcut MCP failed; details suppressed. Check arguments, runtime installation, and access. Verify write outcome before retrying.')
    return json.loads(output.replace(token, '[REDACTED]'))
