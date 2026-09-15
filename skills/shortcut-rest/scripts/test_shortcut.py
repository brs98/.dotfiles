import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from shortcut_core import SafeError, identity, mcp_operation, read_credentials, request, NoRedirect

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
                 patch.object(launcher, 'mcp_operation') as mcp, \
                 patch('sys.argv', ['shortcut', 'call-tool', 'stories-get-by-id']):
                with self.assertRaises(SafeError):
                    launcher.main()
                api.assert_called_once_with('synthetic', 'GET', '/member')
                mcp.assert_not_called()

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
             patch.object(launcher, 'request', return_value=member) as api, \
             patch.object(launcher, 'mcp_operation', return_value={'content': []}) as mcp, \
             patch('sys.argv', ['shortcut', 'call-tool', 'workflows-list']), patch('builtins.print') as output:
            launcher.main()
            api.assert_called_once()
            mcp.assert_called_once_with('synthetic', 'call-tool', 'workflows-list', {})
            self.assertEqual(json.loads(output.call_args.args[0])['workspace']['id'], 'expected')

    def test_mcp_uses_private_input_and_sanitized_environment(self):
        with patch('subprocess.Popen') as spawn:
            process = spawn.return_value
            process.returncode = 0
            process.communicate.return_value = ('{"result":"synthetic"}', '')
            self.assertEqual(mcp_operation('synthetic', 'list-tools'), {'result': '[REDACTED]'})
            self.assertNotIn('synthetic', str(spawn.call_args.args))
            self.assertNotIn('SHORTCUT_API_TOKEN', spawn.call_args.kwargs['env'])
            self.assertNotIn('NODE_OPTIONS', spawn.call_args.kwargs['env'])
            self.assertTrue(spawn.call_args.kwargs['start_new_session'])
            self.assertEqual(json.loads(process.communicate.call_args.args[0])['token'], 'synthetic')

    def test_mcp_failure_does_not_relay_process_output(self):
        with patch('subprocess.Popen') as spawn:
            spawn.return_value.returncode = 1
            spawn.return_value.communicate.return_value = ('synthetic', 'synthetic')
            with self.assertRaises(SafeError) as raised:
                mcp_operation('synthetic', 'call-tool', 'unknown')
            self.assertNotIn('synthetic', str(raised.exception))

    def test_timeout_kills_server_process_group(self):
        import subprocess
        import signal
        with patch('subprocess.Popen') as spawn, patch('os.killpg') as kill:
            spawn.return_value.pid = 123
            spawn.return_value.communicate.side_effect = [subprocess.TimeoutExpired('node', 90), ('', '')]
            with self.assertRaises(SafeError):
                mcp_operation('synthetic', 'list-tools')
            kill.assert_called_once_with(123, signal.SIGKILL)


if __name__ == '__main__':
    unittest.main()
