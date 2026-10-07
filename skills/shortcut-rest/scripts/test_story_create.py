import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import shortcut_core
from shortcut_core import SafeError, tool_payload
import story_create

LAUNCHER = Path(__file__).resolve().parents[2] / 'shortcut-sixfifty/scripts/shortcut-sixfifty.py'
spec = importlib.util.spec_from_file_location('launcher_for_story_tests', LAUNCHER)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

ENGINEERING = 'team-eng'
ME = {'id': 'user-me', 'mention_name': 'me-person', 'name': 'Me Person',
      'workspace2': {'id': 'expected', 'url_slug': 'sixfifty'}}
GROUPS = [
    {'id': 'team-design', 'name': 'Design', 'mention_name': 'design', 'default_workflow_id': 5,
     'workflow_ids': [5, 23]},
    {'id': ENGINEERING, 'name': 'Engineering', 'mention_name': 'engineering', 'default_workflow_id': 23,
     'workflow_ids': [5, 23]},
    {'id': 'team-old', 'name': 'Legacy', 'mention_name': 'legacy', 'archived': True, 'default_workflow_id': 23},
    {'id': 'team-none', 'name': 'Nowhere', 'mention_name': 'nowhere', 'default_workflow_id': None},
]
WORKFLOWS = {
    23: {'id': 23, 'name': 'Engineering Workflow', 'default_state_id': 33,
         'states': [{'id': 33, 'name': 'Backlog'}, {'id': 34, 'name': 'On Deck'}]},
}
MEMBERS = [
    {'id': 'user-ana', 'disabled': False, 'profile': {'mention_name': 'ana', 'name': 'Ana Smith'}},
    {'id': 'user-bo', 'disabled': False, 'profile': {'mention_name': 'bo', 'name': 'Same Name'}},
    {'id': 'user-cy', 'disabled': False, 'profile': {'mention_name': 'cy', 'name': 'Same Name'}},
    {'id': 'user-gone', 'disabled': True, 'profile': {'mention_name': 'gone', 'name': 'Gone'}},
]
CUSTOM_FIELDS = [
    {'id': 'field-cpt', 'name': 'Creative Period Team', 'enabled': True, 'values': [
        {'id': 'value-pizza', 'value': 'MCPizza', 'enabled': True},
        {'id': 'value-wagon', 'value': 'The Welcome Wagon', 'enabled': True},
        {'id': 'value-off', 'value': 'Retired', 'enabled': False},
    ]},
    {'id': 'field-sev', 'name': 'Severity', 'enabled': True, 'story_types': ['bug'],
     'values': [{'id': 'value-high', 'value': 'High', 'enabled': True}]},
]


class FakeShortcut:
    def __init__(self, story_overrides=None, post_error=None, readback_error=None):
        self.calls = []
        self.story_overrides = story_overrides or {}
        self.post_error = post_error
        self.readback_error = readback_error
        self.created = None

    def __call__(self, token, method, path, body=None):
        self.calls.append((method, path, copy.deepcopy(body)))
        if method == 'GET' and path == '/member':
            return ME
        if method == 'GET' and path == '/groups':
            return GROUPS
        if method == 'GET' and path.startswith('/workflows/'):
            return WORKFLOWS[int(path.rsplit('/', 1)[1])]
        if method == 'GET' and path == '/members':
            return MEMBERS
        if method == 'GET' and path == '/custom-fields':
            return CUSTOM_FIELDS
        if method == 'GET' and path == '/epics':
            return [{'id': 7, 'name': 'Agent Skills'}, {'id': 8, 'name': 'Old', 'archived': True}]
        if method == 'GET' and path == '/iterations':
            return [{'id': 2333, 'name': '2025'}, {'id': 2366, 'name': '2025'}, {'id': 6919, 'name': 'Week 10'}]
        if method == 'GET' and path == '/labels?slim=true':
            return [{'id': 41, 'name': 'QA'}]
        if method == 'POST' and path == '/stories':
            if self.post_error:
                raise self.post_error
            self.created = {
                'id': 101, 'app_url': 'https://app.shortcut.com/sixfifty/story/101',
                'name': body['name'], 'description': body.get('description', ''),
                'story_type': body['story_type'], 'group_id': body['group_id'], 'workflow_id': 23,
                'workflow_state_id': body['workflow_state_id'], 'owner_ids': body['owner_ids'],
                'custom_fields': [dict(item, value='x') for item in body['custom_fields']],
                'epic_id': body.get('epic_id'), 'iteration_id': body.get('iteration_id'),
                'label_ids': [41] if body.get('labels') else [],
            }
            return self.created
        if method == 'GET' and path == '/stories/101':
            if self.readback_error:
                raise self.readback_error
            return {**self.created, **self.story_overrides}
        raise AssertionError(f'Unexpected request {method} {path}')

    def writes(self):
        return [call for call in self.calls if call[0] != 'GET']


def make_spec(**overrides):
    base = {'name': 'Test', 'description': None, 'type': 'chore', 'owners': ['me'], 'team': 'Engineering',
            'state': 'On Deck', 'custom_fields': ['Creative Period Team=MCPizza'],
            'epic': None, 'iteration': None, 'labels': []}
    base.update(overrides)
    return base


class StoryCreateTests(unittest.TestCase):
    def run_create(self, fake, dry_run=False, **overrides):
        with patch.object(shortcut_core, 'request', side_effect=fake):
            return story_create.create_story('synthetic', ME, make_spec(**overrides), dry_run=dry_run)

    def test_dry_run_resolves_names_and_never_writes(self):
        fake = FakeShortcut()
        result = self.run_create(fake, dry_run=True, team='@ENGINEERING', state='on deck',
                                 custom_fields=['creative period team = mcpizza'])
        self.assertEqual(result['status'], 'dry-run')
        self.assertEqual(fake.writes(), [])
        self.assertEqual(result['payload'], {
            'name': 'Test', 'story_type': 'chore', 'group_id': ENGINEERING, 'workflow_state_id': 34,
            'owner_ids': ['user-me'], 'custom_fields': [{'field_id': 'field-cpt', 'value_id': 'value-pizza'}],
        })
        self.assertEqual(result['resolved']['workflow'], 'Engineering Workflow')
        self.assertEqual(result['resolved']['custom_fields'], {'Creative Period Team': 'MCPizza'})
        self.assertNotIn(('GET', '/members', None), fake.calls)

    def test_create_sends_one_post_with_team_state_and_fields_then_verifies(self):
        fake = FakeShortcut()
        result = self.run_create(fake, owners=['me', '@ana'], description='Body\n',
                                 epic='agent skills', iteration='6919', labels=['qa'])
        self.assertEqual(result['status'], 'created')
        self.assertTrue(result['verified'])
        self.assertEqual((result['id'], result['url']), (101, 'https://app.shortcut.com/sixfifty/story/101'))
        writes = fake.writes()
        self.assertEqual(len(writes), 1)
        method, path, body = writes[0]
        self.assertEqual((method, path), ('POST', '/stories'))
        self.assertEqual(body['group_id'], ENGINEERING)
        self.assertEqual(body['workflow_state_id'], 34)
        self.assertEqual(body['owner_ids'], ['user-me', 'user-ana'])
        self.assertEqual(body['custom_fields'], [{'field_id': 'field-cpt', 'value_id': 'value-pizza'}])
        self.assertEqual((body['epic_id'], body['iteration_id'], body['labels']), (7, 6919, [{'name': 'QA'}]))
        self.assertEqual(fake.calls[-1][:2], ('GET', '/stories/101'))

    def test_mismatch_reports_every_difference_and_does_not_retry(self):
        fake = FakeShortcut(story_overrides={
            'group_id': None, 'workflow_id': 5, 'workflow_state_id': 500, 'custom_fields': [],
            'owner_ids': [], 'story_type': 'feature',
        })
        result = self.run_create(fake)
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual(result['id'], 101)
        joined = '\n'.join(result['mismatches'])
        for expected in ('team (group_id)', 'workflow_id', 'workflow_state_id', 'owner_ids', 'type',
                         "custom field 'Creative Period Team'"):
            self.assertIn(expected, joined)
        self.assertEqual(len(fake.writes()), 1)

    def test_unknown_or_ambiguous_names_fail_before_any_write(self):
        cases = [
            ({'team': 'Engg'}, "Team 'Engg' does not match any; candidates: Design (@design), Engineering"),
            ({'team': 'Legacy'}, 'does not match any'),
            ({'team': 'Nowhere'}, 'has no default workflow'),
            ({'state': 'Ondeck'}, "candidates: 'Backlog', 'On Deck'"),
            ({'custom_fields': ['Creative Period=MCPizza']}, "Custom field 'Creative Period' does not match"),
            ({'custom_fields': ['Creative Period Team=Pizza']}, "Value 'Pizza' for 'Creative Period Team'"),
            ({'custom_fields': ['Creative Period Team=Retired']}, 'does not match any'),
            ({'custom_fields': ['Creative Period Team']}, "must look like 'Field Name=Value'"),
            ({'custom_fields': ['Severity=High']}, 'only applies to story types: bug'),
            ({'custom_fields': ['Creative Period Team=MCPizza', 'creative period team=The Welcome Wagon']},
             'only once'),
            ({'owners': ['Same Name']}, "Owner 'Same Name' is ambiguous; candidates: @bo (Same Name), @cy"),
            ({'owners': ['gone']}, "Owner 'gone' does not match any"),
            ({'owners': ['me', 'me']}, 'more than once'),
            ({'iteration': '2025'}, "Iteration '2025' is ambiguous; candidates: '2025' (2333), '2025' (2366)"),
            ({'epic': 'Old'}, "Epic 'Old' does not match any"),
            ({'labels': ['Missing']}, "Label 'Missing' does not match any"),
            ({'type': 'epic'}, 'Story type must be one of'),
            ({'name': '  '}, 'must not be empty'),
        ]
        for overrides, message in cases:
            with self.subTest(overrides=overrides):
                fake = FakeShortcut()
                with self.assertRaises(SafeError) as raised:
                    self.run_create(fake, **overrides)
                self.assertIn(message, str(raised.exception))
                self.assertEqual(fake.writes(), [])

    def test_failed_post_is_not_retried_and_says_so(self):
        fake = FakeShortcut(post_error=SafeError('Shortcut network request failed'))
        with self.assertRaises(SafeError) as raised:
            self.run_create(fake)
        self.assertIn('Do not retry automatically', str(raised.exception))
        self.assertEqual(len(fake.writes()), 1)

    def test_failed_readback_is_reported_as_unverified(self):
        fake = FakeShortcut(readback_error=SafeError('Shortcut returned HTTP 500; response body suppressed'))
        result = self.run_create(fake)
        self.assertEqual((result['status'], result['id']), ('unverified', 101))
        self.assertEqual(len(fake.writes()), 1)


class LauncherCreateStoryTests(unittest.TestCase):
    credentials = {'token': 'synthetic', 'workspace': {'id': 'expected'}}

    def run_launcher(self, fake, argv):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(launcher, 'read_credentials', return_value=self.credentials), \
             patch.object(launcher, 'request', side_effect=fake), \
             patch.object(shortcut_core, 'request', side_effect=fake), \
             patch('sys.argv', ['shortcut', *argv]), patch('sys.stdout', stdout), patch('sys.stderr', stderr):
            code = launcher.main()
        return code, stdout.getvalue(), stderr.getvalue()

    def test_mismatch_exits_nonzero_with_id_url_and_each_mismatch(self):
        fake = FakeShortcut(story_overrides={'group_id': None, 'workflow_id': 5})
        code, out, err = self.run_launcher(fake, [
            'create-story', '--name', 'Test', '--type', 'chore', '--owner', 'me', '--team', 'Engineering',
            '--state', 'On Deck', '--custom-field', 'Creative Period Team=MCPizza'])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out)['result']['status'], 'mismatch')
        self.assertIn('Story 101 (https://app.shortcut.com/sixfifty/story/101)', err)
        self.assertIn('team (group_id)', err)
        self.assertIn('workflow_id', err)

    def test_success_and_description_file(self):
        fake = FakeShortcut()
        with tempfile.NamedTemporaryFile('w', suffix='.md') as handle:
            handle.write('From file')
            handle.flush()
            code, out, _ = self.run_launcher(fake, [
                'create-story', '--name', 'Test', '--type', 'chore', '--team', 'engineering',
                '--state', 'On Deck', '--description-file', handle.name])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)['result']['status'], 'created')
        self.assertEqual(fake.writes()[0][2]['description'], 'From file')

    def test_workspace_preflight_runs_before_resolution(self):
        def wrong_workspace(token, method, path, body=None):
            if path == '/member':
                return {'workspace2': {'id': 'other', 'url_slug': 'sixfifty'}}
            raise AssertionError('No resolution may happen before the workspace check')
        with self.assertRaises(SafeError):
            self.run_launcher(wrong_workspace, [
                'create-story', '--name', 'T', '--type', 'chore', '--team', 'Engineering', '--state', 'On Deck'])

    def test_state_is_required(self):
        with self.assertRaises(SystemExit), patch('sys.stderr', io.StringIO()):
            self.run_launcher(FakeShortcut(), ['create-story', '--name', 'T', '--type', 'chore', '--team', 'Eng'])


DEPRECATION = {'type': 'text', 'text': '⚠️ DEPRECATED: This self-hosted Shortcut MCP server is deprecated.'}


class ToolPayloadTests(unittest.TestCase):
    def test_extracts_json_and_drops_deprecation_notice(self):
        result = {'content': [DEPRECATION, {'type': 'text', 'text': (
            'Result (25 shown of 80 total stories found):\n\n<json>\n{"stories": [{"id": 1}]}\n</json>'
            '\n\n<next-page-token>abc~24</next-page-token>')}]}
        self.assertEqual(tool_payload(result), {
            'payload': {'stories': [{'id': 1}]},
            'notes': ['Result (25 shown of 80 total stories found):'],
            'next_page_token': 'abc~24',
        })

    def test_plain_text_when_no_json(self):
        result = {'content': [DEPRECATION, {'type': 'text', 'text': 'Created story: sc-5'}]}
        self.assertEqual(tool_payload(result)['payload'], 'Created story: sc-5')

    def test_launcher_json_flag_prints_only_payload(self):
        member = {'workspace2': {'id': 'expected', 'url_slug': 'sixfifty'}}
        mcp_result = {'content': [DEPRECATION, {'type': 'text', 'text': 'Team:\n\n<json>\n{"id": "t"}\n</json>'}]}
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(launcher, 'read_credentials', return_value=LauncherCreateStoryTests.credentials), \
             patch.object(launcher, 'request', return_value=member), \
             patch.object(launcher, 'mcp_operation', return_value=mcp_result), \
             patch('sys.argv', ['shortcut', 'call-tool', 'teams-get-by-id', '--json']), \
             patch('sys.stdout', stdout), patch('sys.stderr', stderr):
            self.assertEqual(launcher.main(), 0)
        self.assertEqual(json.loads(stdout.getvalue()), {'id': 't'})
        self.assertNotIn('DEPRECATED', stdout.getvalue() + stderr.getvalue())
        self.assertEqual(stderr.getvalue().strip(), 'Team:')


if __name__ == '__main__':
    unittest.main()
