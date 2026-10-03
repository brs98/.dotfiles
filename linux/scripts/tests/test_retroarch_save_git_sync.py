#!/usr/bin/env python3
"""Integration tests use disposable repositories; never access installed saves."""
import fcntl
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'backup-retroarch-saves.sh'
CARD = Path('dolphin-emu/User/GC/USA/Card A')


class SaveGitSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null')
        self.remote = self.root / 'remote.git'
        self.a, self.b = self.root / 'a', self.root / 'b'
        self.git(self.root, 'init', '--bare', '--initial-branch=main', str(self.remote))
        self.git(self.root, 'clone', str(self.remote), str(self.a))
        self.configure(self.a)
        (self.a / CARD).mkdir(parents=True)
        self.save(self.a, 'one.gci', b'initial\x00one')
        self.save(self.a, 'two.gci', b'initial\x00two')
        self.commit(self.a, 'initial')
        self.git(self.a, 'push', 'origin', 'main')
        self.git(self.root, 'clone', str(self.remote), str(self.b))
        self.configure(self.b)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for name, body in [('pgrep', 'exit "${TEST_EMULATOR_STATUS:-1}"'), ('notify-send', 'exit 0')]:
            target = self.bin / name
            target.write_text('#!/bin/sh\n' + body + '\n')
            target.chmod(0o755)
        self.env['PATH'] = str(self.bin) + ':' + self.env['PATH']

    def git(self, repo, *args, check=True):
        return subprocess.run(['git', '-C', str(repo), *args], env=self.env,
                              capture_output=True, text=True, check=check)

    def configure(self, repo):
        self.git(repo, 'config', 'user.name', 'Sync Test')
        self.git(repo, 'config', 'user.email', 'sync-test@example.invalid')

    def save(self, repo, name, data):
        (repo / CARD / name).write_bytes(data)

    def commit(self, repo, message):
        self.git(repo, 'add', '.')
        self.git(repo, 'commit', '-m', message)

    def sync(self, repo=None, **overrides):
        env = dict(self.env, RETROARCH_SAVES_REPO=str(repo or self.a), **overrides)
        return subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True)

    def assert_sync(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def head(self, repo):
        return self.git(repo, 'rev-parse', 'HEAD').stdout.strip()

    def test_clean_pull_and_local_push(self):
        self.save(self.b, 'one.gci', b'remote\x00progress')
        self.commit(self.b, 'remote progress')
        self.git(self.b, 'push')
        self.assert_sync(self.sync())
        self.assertEqual((self.a / CARD / 'one.gci').read_bytes(), b'remote\x00progress')
        self.save(self.a, 'two.gci', b'local\x00progress')
        self.assert_sync(self.sync())
        self.assert_sync(self.sync(self.b))
        self.assertEqual(self.head(self.a), self.head(self.b))

    def test_distinct_saves_merge(self):
        self.save(self.b, 'one.gci', b'remote\x00progress')
        self.commit(self.b, 'remote progress')
        self.git(self.b, 'push')
        self.save(self.a, 'two.gci', b'local\x00progress')
        self.assert_sync(self.sync())
        self.assert_sync(self.sync(self.b))
        self.assertEqual((self.a / CARD / 'one.gci').read_bytes(), b'remote\x00progress')
        self.assertEqual((self.b / CARD / 'two.gci').read_bytes(), b'local\x00progress')
        self.assertEqual(self.head(self.a), self.head(self.b))

    def test_conflict_preserves_both_saves_and_clears_merge(self):
        self.save(self.b, 'one.gci', b'remote\x00chosen')
        self.commit(self.b, 'remote chosen')
        self.git(self.b, 'push')
        remote_head = self.head(self.b)
        self.save(self.a, 'one.gci', b'local\x00chosen')
        result = self.sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('same save', result.stderr)
        self.assertEqual((self.a / CARD / 'one.gci').read_bytes(), b'local\x00chosen')
        self.assertEqual((self.b / CARD / 'one.gci').read_bytes(), b'remote\x00chosen')
        self.assertEqual(self.git(self.a, 'status', '--porcelain').stdout, '')
        self.assertFalse((self.a / '.git/MERGE_HEAD').exists())
        self.assertEqual(self.git(self.a, 'rev-parse', 'origin/main').stdout.strip(), remote_head)
        local_head = self.head(self.a)
        self.assertNotEqual(self.sync().returncode, 0)
        self.assertEqual(self.head(self.a), local_head)

    def test_offline_save_commits_and_retries(self):
        original = self.head(self.a)
        offline = self.root / 'offline.git'
        self.remote.rename(offline)
        self.save(self.a, 'one.gci', b'offline\x00progress')
        self.assertNotEqual(self.sync().returncode, 0)
        committed = self.head(self.a)
        self.assertNotEqual(committed, original)
        self.assertEqual(self.git(self.a, 'status', '--porcelain').stdout, '')
        offline.rename(self.remote)
        self.assert_sync(self.sync())
        self.assert_sync(self.sync(self.b))
        self.assertEqual(self.head(self.b), committed)

    def test_detached_head_is_untouched(self):
        original = self.head(self.a)
        self.git(self.a, 'checkout', '--detach')
        self.save(self.a, 'one.gci', b'detached\x00save')
        result = self.sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('detached HEAD', result.stderr)
        self.assertEqual(self.head(self.a), original)
        self.assertEqual((self.a / CARD / 'one.gci').read_bytes(), b'detached\x00save')

    def test_running_emulator_defers_all_writes(self):
        original = self.head(self.a)
        self.save(self.a, 'one.gci', b'playing\x00save')
        self.save(self.b, 'two.gci', b'remote\x00save')
        self.commit(self.b, 'remote save')
        self.git(self.b, 'push')
        result = self.sync(TEST_EMULATOR_STATUS='0')
        self.assert_sync(result)
        self.assertIn('emulator running', result.stdout)
        self.assertEqual(self.head(self.a), original)
        self.assertEqual((self.a / CARD / 'one.gci').read_bytes(), b'playing\x00save')
        self.assertEqual((self.a / CARD / 'two.gci').read_bytes(), b'initial\x00two')
        self.assert_sync(self.sync())

    def test_unrelated_staged_changes_are_not_committed(self):
        original = self.head(self.a)
        (self.a / 'notes').write_text('private local notes')
        self.git(self.a, 'add', 'notes')
        self.save(self.a, 'one.gci', b'new\x00save')
        result = self.sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Unrelated staged', result.stderr)
        self.assertEqual(self.head(self.a), original)
        self.assertEqual(self.git(self.a, 'diff', '--cached', '--name-only').stdout, 'notes\n')

    def test_concurrent_run_defers(self):
        original = self.head(self.a)
        self.save(self.a, 'one.gci', b'new\x00save')
        with (self.a / '.git/retroarch-save-sync.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assert_sync(self.sync())
            self.assertEqual(self.head(self.a), original)
        self.assert_sync(self.sync())


if __name__ == '__main__':
    unittest.main()
