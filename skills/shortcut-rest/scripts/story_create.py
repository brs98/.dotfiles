import shortcut_core

STORY_TYPES = ('feature', 'bug', 'chore')
MAX_CANDIDATES = 40


def _get(token, path):
    return shortcut_core.request(token, 'GET', path)


def _fold(text):
    return (text or '').strip().casefold()


def _pick(kind, wanted, items, keys, describe, where=''):
    wanted_key = _fold(wanted).lstrip('@')
    matches = [item for item in items
               if any(_fold(key(item)).lstrip('@') == wanted_key for key in keys if key(item))]
    if len(matches) == 1:
        return matches[0]
    pool = matches or items
    names = sorted(describe(item) for item in pool)
    candidates = ', '.join(names[:MAX_CANDIDATES]) or 'none'
    if len(names) > MAX_CANDIDATES:
        candidates += f' ... and {len(names) - MAX_CANDIDATES} more'
    problem = 'is ambiguous' if matches else 'does not match any'
    raise shortcut_core.SafeError(f'{kind} {wanted!r}{where} {problem}; candidates: {candidates}')


def _member_label(member):
    profile = member['profile']
    return f"@{profile['mention_name']} ({profile.get('name') or 'no name'})"


def _resolve_owners(token, me, owners):
    if not owners:
        return []
    members = None
    resolved = []
    for owner in owners:
        if _fold(owner) == 'me':
            resolved.append({'id': me['id'], 'mention_name': me['mention_name'], 'name': me.get('name')})
            continue
        if members is None:
            members = [m for m in _get(token, '/members') if not m.get('disabled')]
        member = _pick('Owner', owner, members,
                       (lambda m: m['profile']['mention_name'], lambda m: m['profile'].get('name')),
                       _member_label)
        resolved.append({'id': member['id'], 'mention_name': member['profile']['mention_name'],
                         'name': member['profile'].get('name')})
    if len({owner['id'] for owner in resolved}) != len(resolved):
        raise shortcut_core.SafeError('The same owner was given more than once')
    return resolved


def _resolve_custom_fields(token, pairs, story_type):
    if not pairs:
        return []
    fields = [f for f in _get(token, '/custom-fields') if f.get('enabled', True)]
    resolved = []
    for pair in pairs:
        if '=' not in pair:
            raise shortcut_core.SafeError(f"Custom field {pair!r} must look like 'Field Name=Value'")
        field_name, value_name = (part.strip() for part in pair.split('=', 1))
        field = _pick('Custom field', field_name, fields, (lambda f: f['name'],), lambda f: repr(f['name']))
        if field.get('story_types') and story_type not in field['story_types']:
            raise shortcut_core.SafeError(
                f"Custom field {field['name']!r} only applies to story types: {', '.join(field['story_types'])}")
        values = [v for v in field.get('values') or [] if v.get('enabled', True)]
        value = _pick('Value', value_name, values, (lambda v: v['value'],), lambda v: repr(v['value']),
                      f" for {field['name']!r}")
        resolved.append({'field_id': field['id'], 'field': field['name'],
                         'value_id': value['id'], 'value': value['value']})
    if len({item['field_id'] for item in resolved}) != len(resolved):
        raise shortcut_core.SafeError('Each custom field may be given only once')
    return resolved


def _resolve_by_id_or_name(token, kind, wanted, path, include):
    items = _get(token, path)
    keys = (lambda i: str(i['id']), lambda i: i['name'] if include(i) else None)
    item = _pick(kind, wanted, items, keys, lambda i: f"{i['name']!r} ({i['id']})")
    return {'id': item['id'], 'name': item['name']}


def _resolve_labels(token, labels):
    if not labels:
        return []
    existing = [label for label in _get(token, '/labels?slim=true') if not label.get('archived')]
    resolved = [_pick('Label', name, existing, (lambda l: l['name'],), lambda l: repr(l['name']))
                for name in labels]
    if len({label['id'] for label in resolved}) != len(resolved):
        raise shortcut_core.SafeError('The same label was given more than once')
    return [{'id': label['id'], 'name': label['name']} for label in resolved]


def resolve(token, me, spec):
    """Turn human names into IDs with read-only calls; raise SafeError on any missing/ambiguous name."""
    if spec['type'] not in STORY_TYPES:
        raise shortcut_core.SafeError(f"Story type must be one of: {', '.join(STORY_TYPES)}")
    if not spec['name'].strip():
        raise shortcut_core.SafeError('Story name must not be empty')
    teams = [team for team in _get(token, '/groups') if not team.get('archived')]
    team = _pick('Team', spec['team'], teams, (lambda t: t['name'], lambda t: t['mention_name']),
                 lambda t: f"{t['name']} (@{t['mention_name']})")
    workflow_id = team.get('default_workflow_id')
    if not workflow_id:
        raise shortcut_core.SafeError(f"Team {team['name']!r} has no default workflow; refusing to guess one")
    workflow = _get(token, f'/workflows/{int(workflow_id)}')
    state = _pick('Workflow state', spec['state'], workflow['states'], (lambda s: s['name'],),
                  lambda s: repr(s['name']), f" in {workflow['name']!r}")
    epic = spec.get('epic') and _resolve_by_id_or_name(
        token, 'Epic', spec['epic'], '/epics', lambda e: not e.get('archived'))
    iteration = spec.get('iteration') and _resolve_by_id_or_name(
        token, 'Iteration', spec['iteration'], '/iterations', lambda i: True)
    return {
        'name': spec['name'],
        'description': spec.get('description'),
        'type': spec['type'],
        'team': {'id': team['id'], 'name': team['name'], 'mention_name': team['mention_name']},
        'workflow': {'id': workflow['id'], 'name': workflow['name']},
        'state': {'id': state['id'], 'name': state['name']},
        'owners': _resolve_owners(token, me, spec.get('owners') or []),
        'custom_fields': _resolve_custom_fields(token, spec.get('custom_fields') or [], spec['type']),
        'epic': epic or None,
        'iteration': iteration or None,
        'labels': _resolve_labels(token, spec.get('labels') or []),
    }


def payload(resolved):
    body = {
        'name': resolved['name'],
        'story_type': resolved['type'],
        'group_id': resolved['team']['id'],
        'workflow_state_id': resolved['state']['id'],
        'owner_ids': [owner['id'] for owner in resolved['owners']],
        'custom_fields': [{'field_id': f['field_id'], 'value_id': f['value_id']}
                          for f in resolved['custom_fields']],
    }
    if resolved['description'] is not None:
        body['description'] = resolved['description']
    if resolved['epic']:
        body['epic_id'] = resolved['epic']['id']
    if resolved['iteration']:
        body['iteration_id'] = resolved['iteration']['id']
    if resolved['labels']:
        body['labels'] = [{'name': label['name']} for label in resolved['labels']]
    return body


def _normalize_text(text):
    return (text or '').replace('\r\n', '\n').rstrip()


def verify(story, resolved):
    """Compare a fully read-back story with what was requested; return a list of mismatch strings."""
    mismatches = []

    def check(label, actual, expected):
        if actual != expected:
            mismatches.append(f'{label}: expected {expected!r}, got {actual!r}')

    check('name', story.get('name'), resolved['name'])
    if resolved['description'] is not None:
        check('description', _normalize_text(story.get('description')), _normalize_text(resolved['description']))
    check('type', story.get('story_type'), resolved['type'])
    check('team (group_id)', story.get('group_id'), resolved['team']['id'])
    check('workflow_id', story.get('workflow_id'), resolved['workflow']['id'])
    check('workflow_state_id', story.get('workflow_state_id'), resolved['state']['id'])
    check('owner_ids', sorted(story.get('owner_ids') or []), sorted(o['id'] for o in resolved['owners']))
    actual_fields = {item.get('field_id'): item.get('value_id') for item in story.get('custom_fields') or []}
    for field in resolved['custom_fields']:
        check(f"custom field {field['field']!r}", actual_fields.get(field['field_id']), field['value_id'])
    if resolved['epic']:
        check('epic_id', story.get('epic_id'), resolved['epic']['id'])
    if resolved['iteration']:
        check('iteration_id', story.get('iteration_id'), resolved['iteration']['id'])
    if resolved['labels']:
        missing = {l['id'] for l in resolved['labels']} - set(story.get('label_ids') or [])
        if missing:
            mismatches.append(f'labels: missing label ids {sorted(missing)!r}')
    return mismatches


def summary(resolved):
    return {
        'name': resolved['name'],
        'type': resolved['type'],
        'team': resolved['team']['name'],
        'workflow': resolved['workflow']['name'],
        'state': resolved['state']['name'],
        'owners': [f"@{owner['mention_name']}" for owner in resolved['owners']],
        'custom_fields': {field['field']: field['value'] for field in resolved['custom_fields']},
        'epic': resolved['epic'] and resolved['epic']['name'],
        'iteration': resolved['iteration'] and resolved['iteration']['name'],
        'labels': [label['name'] for label in resolved['labels']],
    }


def create_story(token, me, spec, dry_run=False):
    """Resolve, create with one POST /stories, then read back and verify. Never retries the write."""
    resolved = resolve(token, me, spec)
    body = payload(resolved)
    if dry_run:
        return {'status': 'dry-run', 'resolved': summary(resolved), 'payload': body}
    try:
        created = shortcut_core.request(token, 'POST', '/stories', body)
    except shortcut_core.SafeError as error:
        raise shortcut_core.SafeError(
            f'{error}. Story create failed or its outcome is unknown. Do not retry automatically; '
            f'search Shortcut for a story named {resolved["name"]!r} first.') from None
    story_id, url = created.get('id'), created.get('app_url')
    result = {'id': story_id, 'url': url, 'resolved': summary(resolved)}
    try:
        story = _get(token, f'/stories/{int(story_id)}')
    except (shortcut_core.SafeError, TypeError, ValueError):
        return {**result, 'status': 'unverified',
                'mismatches': ['Story was created but could not be read back; verify it manually.']}
    mismatches = verify(story, resolved)
    if mismatches:
        return {**result, 'status': 'mismatch', 'mismatches': mismatches}
    return {**result, 'status': 'created', 'verified': True}
