#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import os
import hashlib
import fcntl

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).resolve().parents[1] / 'sync-retroarch-saves.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BridgeTest(unittest.TestCase):
    def test_import_preserves_both_versions_and_links_new_remote_saves(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            card, tracked, backup = (root / name for name in ('card', 'repo', 'backup'))
            card.mkdir(); tracked.mkdir()
            (card / 'game.gci').write_bytes(b'latest local')
            (tracked / 'game.gci').write_bytes(b'previous')
            module.bridge(card, tracked, backup)
            self.assertTrue((card / 'game.gci').is_symlink())
            self.assertEqual((tracked / 'game.gci').read_bytes(), b'latest local')
            self.assertEqual({p.read_bytes() for p in backup.iterdir()}, {b'latest local', b'previous'})
            (tracked / 'remote.gci').write_bytes(b'new remote')
            module.publish(card, tracked)
            self.assertEqual((card / 'remote.gci').read_bytes(), b'new remote')
            self.assertFalse(card.is_symlink())
            module.bridge(card, tracked, backup)

    def test_rejects_unexpected_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            card, tracked = root / 'card', root / 'repo'
            card.mkdir(); tracked.mkdir()
            (card / 'game.gci').symlink_to(root / 'elsewhere')
            with self.assertRaises(RuntimeError):
                module.bridge(card, tracked, root / 'backup')

    def test_managed_remote_deletion_removes_dangling_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            card, tracked = root / 'card', root / 'repo'
            card.mkdir(); tracked.mkdir()
            (card / 'game.gci').symlink_to(tracked / 'game.gci')
            module.bridge(card, tracked, root / 'backup')
            self.assertFalse(os.path.lexists(card / 'game.gci'))

    def test_rooms_lock_and_pending_recovery_prevent_import(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, card = root / 'repo', root / 'card'
            (repo / module.CARD).mkdir(parents=True); card.mkdir()
            (card / 'game.gci').write_bytes(b'personal save')
            key = hashlib.sha256(str(card).encode()).hexdigest()
            lockdir = card.parent / '.rooms-save-sync' / key
            lockdir.mkdir(parents=True)
            env = {'RETROARCH_SAVES_REPO': str(repo), 'RETROARCH_CARD_DIR': str(card),
                   'XDG_STATE_HOME': str(root / 'state')}
            with patch.dict(os.environ, env):
                with (lockdir / '.rooms-personal-saves.lock').open('a') as lock:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.assertEqual(module.main(), 0)
                    self.assertFalse((card / 'game.gci').is_symlink())
                recovery = lockdir / 'recovery' / 'transaction'
                recovery.mkdir(parents=True)
                (recovery / 'journal.json').write_text('{"state":"publishing"}')
                with self.assertRaisesRegex(RuntimeError, 'recovery required'):
                    module.main()
                self.assertFalse((card / 'game.gci').is_symlink())


if __name__ == '__main__':
    unittest.main()
