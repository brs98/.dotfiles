import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from shortcut_core import SafeError, identity, operation, read_credentials, request, NoRedirect

LAUNCHER = Path(__file__).resolve().parents[2] / 'shortcut-sixfifty/scripts/shortcut-sixfifty.py'
spec = importlib.util.spec_from_file_location('launcher', LAUNCHER)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class ShortcutTests(unittest.TestCase):
    def test_workspace_mismatch_rejects_before_operation(self):
        credentials = {'token': 'synthetic', 'workspace': {'id': 'expected'}}
        for member in ({'workspace2': {'id': 'expected', 'url_slug': 'other'}},
                       {'workspace2': {'id': 'different', 'url_slug': 'sixfifty'}}):
            with self.subTest(member=member), patch.object(launcher, 'read_credentials', return_value=credentials), \
                 patch.object(launcher, 'request', return_value=member) as api, \
                 patch('sys.argv', ['shortcut', 'story', '123']):
                with self.assertRaises(SafeError):
                    launcher.main()
                api.assert_called_once_with('synthetic', 'GET', '/member')

    def test_private_credentials_and_symlink_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'credentials.json'
            path.write_text(json.dumps({'token': 'synthetic'}))
            path.chmod(0o600)
            self.assertEqual(read_credentials(path)['token'], 'synthetic')
            path.chmod(0o644)
            with self.assertRaises(SafeError):
                read_credentials(path)
            path.chmod(0o600)
            link = Path(directory) / 'link'
            link.symlink_to(path)
            with self.assertRaises(OSError):
                read_credentials(link)

    def test_redirects_are_not_followed(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example'))

    def test_malformed_token_does_not_leak(self):
        for token in ('synthetic\nsecret', 'synthetic\x00secret', 'synthetic secret', '\u0100secret'):
            with self.subTest(token=token), self.assertRaises(SafeError) as raised:
                request(token, 'GET', '/member')
            self.assertEqual(str(raised.exception), 'Invalid token format')

    def test_pagination_cannot_change_origin(self):
        for url in ('https://other.example/api/v3/search/stories', '//other.example/api/v3/search/stories', '/api/v3/members'):
            with self.assertRaises(SafeError):
                operation(argparse.Namespace(command='search', query='x', page_size=25, next=url))
        result = operation(argparse.Namespace(command='search', query='x', page_size=25, next='/api/v3/search/stories?next=abc'))
        self.assertEqual(result, ('GET', '/search/stories?next=abc', None))

    def test_hidden_input_fails_closed(self):
        import getpass
        import warnings
        def fallback(prompt):
            warnings.warn('Cannot control echo', getpass.GetPassWarning)
            self.fail('Echo fallback must never execute')
        with patch.object(launcher.getpass, 'getpass', side_effect=fallback):
            with self.assertRaisesRegex(SafeError, 'Cannot disable terminal echo'):
                launcher.hidden_token('Token: ')

    def test_successful_preflight_wraps_result(self):
        credentials = {'token': 'synthetic', 'workspace': {'id': 'expected'}}
        member = {'workspace2': {'id': 'expected', 'url_slug': 'sixfifty'}}
        with patch.object(launcher, 'read_credentials', return_value=credentials), \
             patch.object(launcher, 'request', side_effect=[member, {'id': 123}]) as api, \
             patch('sys.argv', ['shortcut', 'story', '123']), patch('builtins.print') as output:
            launcher.main()
            self.assertEqual(api.call_count, 2)
            self.assertEqual(json.loads(output.call_args.args[0])['workspace']['id'], 'expected')


if __name__ == '__main__':
    unittest.main()
