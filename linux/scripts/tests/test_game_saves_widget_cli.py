#!/usr/bin/env python3
"""Widget adapter tests, isolated from installed configuration and saves."""
import contextlib
import fcntl
from importlib.machinery import SourceFileLoader
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'game-saves-sync'
loader = SourceFileLoader('widget_cli', str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
cli = importlib.util.module_from_spec(spec)
loader.exec_module(cli)


class WidgetSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / 'state'
        self.status = self.state / 'game-saves-sync/status.json'
        self.status.parent.mkdir(parents=True)
        self.previous = {**cli.DEFAULT, 'state': 'success', 'lastSuccess': '2026-10-01T12:00:00+00:00'}
        cli.write_status(self.status, self.previous)
        self.env = patch.dict(os.environ, {'XDG_STATE_HOME': str(self.state)})
        self.env.start()
        self.addCleanup(self.env.stop)

    def invoke(self, *args):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = cli.main(list(args))
        return code, json.loads(output.getvalue())

    def backend(self, code):
        script = self.root / 'sync-retroarch-saves.py'
        script.write_text(code)
        # Deliberately not executable: adapter must use its Python interpreter.
        script.chmod(0o600)
        with patch.object(cli, '__file__', str(self.root / 'game-saves-sync')):
            return cli.run_backend()

    def test_success_updates_persisted_timestamp_and_status_is_read_only(self):
        with patch.object(cli, 'run_backend', return_value=('success', 'Synchronized.')) as run:
            code, value = self.invoke('sync', '--no-notify')
            self.assertEqual(code, 0)
            self.assertNotEqual(value['lastSuccess'], self.previous['lastSuccess'])
            self.assertEqual(self.invoke('status')[1], value)
            run.assert_called_once()

    def test_backup_reuses_backend_and_deferrals_preserve_success(self):
        for state in ('idle', 'error'):
            with self.subTest(state=state), patch.object(cli, 'run_backend', return_value=(state, 'Deferred.')) as run:
                code, value = self.invoke('backup', '--no-notify')
                self.assertEqual(code, int(state == 'error'))
                self.assertEqual(value['lastSuccess'], self.previous['lastSuccess'])
                self.assertEqual(self.invoke('status')[1]['state'], state)
                run.assert_called_once()

    def test_live_adapter_lock_is_busy_and_does_not_overwrite_result(self):
        with (self.status.parent / 'sync.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(cli, 'run_backend') as run:
                for command in ('status', 'sync'):
                    self.assertEqual(self.invoke(command, '--no-notify')[1]['state'], 'busy')
                run.assert_not_called()
            self.assertEqual(cli.read_status(self.status), self.previous)

    def test_stale_busy_recovers_but_live_bridge_lock_stays_busy(self):
        cli.write_status(self.status, {**self.previous, 'state': 'busy'})
        bridge_lock = self.state / 'retroarch-save-sync/bridge.lock'
        bridge_lock.parent.mkdir()
        with bridge_lock.open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.invoke('status')[1]['state'], 'busy')
        value = self.invoke('status')[1]
        self.assertEqual(value['state'], 'idle')
        self.assertEqual(value['lastSuccess'], self.previous['lastSuccess'])

    def test_corrupt_status_is_recoverable(self):
        self.status.write_text('not json')
        self.assertEqual(self.invoke('status')[1], cli.DEFAULT)

    def test_backend_classifies_only_confirmed_success(self):
        cases = [
            ('', 'busy'),
            ('Save sync deferred: emulator is running', 'idle'),
            ('Game save sync: emulator running; deferring until it exits.', 'idle'),
            ('Save sync deferred: Rooms session is active', 'idle'),
            ('Game save sync: main is synchronized.', 'success'),
            ('something unexpected', 'error'),
        ]
        for message, expected in cases:
            with self.subTest(message=message):
                state, _ = self.backend(f'print({message!r})\n')
                self.assertEqual(state, expected)

    def test_transport_output_is_never_exposed(self):
        secret = 'https://example-user:example-secret@example.invalid/private.git'
        for code in (0, 1):
            state, message = self.backend(f'import sys\nprint({secret!r})\nsys.exit({code})\n')
            self.assertEqual(state, 'error')
            self.assertNotIn(secret, message)
            self.assertNotIn('example-secret', message)

    def test_backend_notification_is_suppressed(self):
        state, _ = self.backend("import os\nassert os.environ['RETROARCH_SYNC_NO_NOTIFY'] == '1'\nprint('Game save sync: main is synchronized.')\n")
        self.assertEqual(state, 'success')
        with patch.object(cli, 'run_backend', return_value=('success', 'Done')), patch.object(cli, 'notify') as notify:
            self.invoke('sync', '--no-notify')
            notify.assert_not_called()
            self.invoke('sync')
            notify.assert_called_once()

    def test_timeout_kills_backend_and_grandchild(self):
        marker = self.root / 'orphan-write'
        child = f'import time; from pathlib import Path; time.sleep(0.6); Path({str(marker)!r}).touch()'
        code = f'import subprocess, sys, time\nsubprocess.Popen([sys.executable, "-c", {child!r}])\ntime.sleep(10)\n'
        with patch.object(cli, 'TIMEOUT', 0.2):
            state, message = self.backend(code)
        self.assertEqual(state, 'error')
        self.assertIn('timed out', message)
        time.sleep(0.6)
        self.assertFalse(marker.exists())


if __name__ == '__main__':
    unittest.main()
