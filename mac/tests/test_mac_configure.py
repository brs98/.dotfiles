import importlib.util
from pathlib import Path
import tempfile
import unittest
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'mac/bootstrap' / (name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

configure = load('configure')
user_config = load('user-config')

class ConfigurationTests(unittest.TestCase):
    def test_conflicts_fail_before_any_mutation_and_backup_is_recoverable(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); home = base / 'home'; home.mkdir()
            src = base / 'source'; src.write_text('new')
            conflict = home / '.existing'; conflict.write_text('original')
            fresh = home / '.config/app/config'
            links = {fresh: src, conflict: src}
            with self.assertRaises(RuntimeError): configure.apply(links, home, dry_run=False)
            self.assertFalse(fresh.exists())
            configure.apply(links, home, backup_conflicts=True, dry_run=False)
            saved = list((home / '.dotfiles-backups').glob('*/.existing'))
            self.assertEqual(saved[0].read_text(), 'original')
            self.assertTrue(conflict.is_symlink())
            self.assertEqual(configure.inspect(links, home), ([], []))
            configure.apply(links, home, backup_conflicts=True, dry_run=False)
            self.assertEqual(len(list((home / '.dotfiles-backups').iterdir())), 1)

    def test_mutable_parent_link_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); home = base / 'home'; home.mkdir()
            outside = base / 'outside'; outside.mkdir()
            (home / '.config').symlink_to(outside)
            with self.assertRaises(RuntimeError):
                configure.inspect({home / '.config/app': base / 'source'}, home)
            self.assertEqual(list(outside.iterdir()), [])

    def test_codex_merge_preserves_other_sections_and_is_idempotent(self):
        import tomllib
        original = '[tui.keymap.chat]\nskip_question = "ctrl-x"\n\n[unrelated]\nfoo = true\n'
        result = user_config.set_key(original, 'tui.keymap.chat', 'edit_queued_message', '"ctrl-g"')
        result = user_config.set_key(result, 'tui.keymap.global', 'open_external_editor', '[]')
        parsed = tomllib.loads(result)
        self.assertTrue(parsed['unrelated']['foo'])
        self.assertEqual(parsed['tui']['keymap']['chat']['skip_question'], 'ctrl-x')
        self.assertEqual(parsed['tui']['keymap']['chat']['edit_queued_message'], 'ctrl-g')
        self.assertEqual(result, user_config.set_key(result, 'tui.keymap.chat', 'edit_queued_message', '"ctrl-g"'))

    def test_commented_header_and_indented_key(self):
        import tomllib
        original = '[tui.keymap.chat] # shortcuts\n  edit_queued_message = "alt-up" # previous\n'
        result = user_config.set_key(original, 'tui.keymap.chat', 'edit_queued_message', '"ctrl-g"')
        self.assertEqual(tomllib.loads(result)['tui']['keymap']['chat']['edit_queued_message'], 'ctrl-g')
        self.assertEqual(result, user_config.set_key(result, 'tui.keymap.chat', 'edit_queued_message', '"ctrl-g"'))

    def test_apply_and_dry_run_rejected_before_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            for script in ['setup-mac.sh', 'mac/bootstrap.sh']:
                result = subprocess.run(['bash', str(ROOT / script), '--apply', '--dry-run'], env=dict(os.environ, HOME=tmp), capture_output=True)
                self.assertEqual(result.returncode, 2)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    @unittest.skipUnless(Path('/usr/bin/python3').exists(), 'requires Apple Python')
    def test_full_preview_with_apple_python_does_not_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            wrapper = home / '.local/bin/python3'
            wrapper.parent.mkdir(parents=True)
            wrapper.write_text('#!/bin/sh\nexec /usr/bin/python3 "$@"\n')
            wrapper.chmod(0o755)
            before = set(home.rglob('*'))
            result = subprocess.run(['bash', str(ROOT / 'setup-mac.sh')], env=dict(os.environ, HOME=tmp, PYTHONDONTWRITEBYTECODE='1'), text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('Merge Codex Ctrl+G', result.stdout)
            self.assertIn('Herdr: pinned', result.stdout)
            self.assertEqual(set(home.rglob('*')), before)

    @unittest.skipUnless(Path('/usr/bin/python3').exists(), 'requires Apple Python')
    def test_apply_without_tomllib_fails_before_writes(self):
        available = subprocess.run(['/usr/bin/python3', '-c', 'import tomllib'], capture_output=True)
        if available.returncode == 0:
            self.skipTest('Apple Python now includes tomllib')
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(['/usr/bin/python3', str(ROOT / 'mac/bootstrap/user-config.py'), '--apply'], env=dict(os.environ, HOME=tmp, PYTHONDONTWRITEBYTECODE='1'), text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Python 3.11', result.stderr)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_apply_rejects_invalid_toml_before_any_config_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = home / '.codex/config.toml'
            config.parent.mkdir()
            original = '[broken\n'
            config.write_text(original)
            result = subprocess.run([sys.executable, str(ROOT / 'mac/bootstrap/user-config.py'), '--apply'], env=dict(os.environ, HOME=tmp, PYTHONDONTWRITEBYTECODE='1'), capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(config.read_text(), original)
            self.assertEqual(set(home.iterdir()), {config.parent})

    def test_fresh_home_config_phase_twice(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            env = dict(os.environ, HOME=tmp)
            for _ in range(2):
                subprocess.run(['bash', str(ROOT / 'mac/bootstrap.sh'), '--phase', 'config', '--apply'], env=env, check=True, capture_output=True)
            self.assertTrue((home / '.config/herdr/config.toml').is_symlink())
            self.assertFalse((home / '.config').is_symlink())
            self.assertFalse((home / '.agents/skills').is_symlink())
            self.assertFalse((home / '.config/retroarch').exists())
            self.assertEqual((home / '.codex/config.toml').read_text().count('edit_queued_message'), 1)
            self.assertFalse((home / '.dotfiles-backups').exists())

    def test_manifest_excludes_linux_game_saves_and_runtime_theme_outputs(self):
        links = configure.manifest(ROOT, Path('/temporary-home'))
        self.assertFalse(any('retroarch' in str(p) for p in links))
        self.assertNotIn(Path('/temporary-home/.config/sketchybar/colors.sh'), links)
        self.assertIn(Path('/temporary-home/.config/herdr/config.toml'), links)

if __name__ == '__main__': unittest.main()
