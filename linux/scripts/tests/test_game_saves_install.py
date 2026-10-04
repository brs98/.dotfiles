import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

INSTALLER = Path(__file__).resolve().parents[1] / 'install-game-saves-widget'
CARD = 'dolphin-emu/User/GC/USA/Card A'


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.dotfiles = self.home / '.dotfiles'
        self.script = self.dotfiles / 'linux/scripts/install-game-saves-widget'
        self.script.parent.mkdir(parents=True)
        shutil.copy2(INSTALLER, self.script)
        self.repo = self.dotfiles / 'shared/symlink/retroarch/.config/retroarch/saves'
        self.repo.mkdir(parents=True)
        (self.repo / CARD).mkdir(parents=True)
        (self.repo / CARD / 'game.gci').write_bytes(b'remote save')
        plugin = self.dotfiles / 'linux/omarchy/plugins/brs98.game-saves'
        plugin.mkdir(parents=True)
        units = self.dotfiles / 'linux/stow/systemd/.config/systemd/user'
        units.mkdir(parents=True)
        for suffix in ('path', 'service', 'timer'):
            (units / ('retroarch-saves.' + suffix)).write_text('[Unit]\n')
        self.mockbin = self.home / 'bin'
        self.mockbin.mkdir()
        for command in ('omarchy', 'systemctl'):
            path = self.mockbin / command
            path.write_text('#!/bin/sh\nexit 0\n')
            path.chmod(0o755)
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(self.mockbin)+':'+os.environ['PATH'],
                        GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_SYSTEM='/dev/null',
                        GIT_AUTHOR_NAME='Test', GIT_AUTHOR_EMAIL='test@example.invalid',
                        GIT_COMMITTER_NAME='Test', GIT_COMMITTER_EMAIL='test@example.invalid')
        self.env.pop('DOTFILES', None)
        self.git('init', '--initial-branch=main')
        self.git('add', '.')
        self.git('commit', '-m', 'initial')
        self.card = self.home / '.config/retroarch/saves' / CARD
        self.card.mkdir(parents=True)

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], env=self.env,
                              capture_output=True, text=True, check=True).stdout.strip()

    def install(self):
        return subprocess.run([str(self.script)], env=self.env, capture_output=True, text=True)

    def test_fresh_install_clones_save_repository_on_main(self):
        remote = self.home / 'remote.git'
        subprocess.run(['git', 'clone', '--bare', str(self.repo), str(remote)],
                       env=self.env, capture_output=True, check=True)
        shutil.rmtree(self.repo)
        self.env.update(GIT_CONFIG_COUNT='1',
                        GIT_CONFIG_KEY_0='url.' + str(remote) + '.insteadOf',
                        GIT_CONFIG_VALUE_0='https://github.com/brs98/game-saves.git')
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git('branch', '--show-current'), 'main')
        self.assertEqual((self.repo / CARD / 'game.gci').read_bytes(), b'remote save')

    def test_repeat_install_preserves_existing_saves_and_links_units(self):
        save = self.card / 'new.gci'
        save.write_bytes(b'unique local save')
        for _ in range(2):
            result = self.install()
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(save.read_bytes(), b'unique local save')
            self.assertTrue((self.home / '.config/omarchy/plugins/brs98.game-saves').is_symlink())
            for suffix in ('path', 'service', 'timer'):
                self.assertTrue((self.home / '.config/systemd/user' / ('retroarch-saves.' + suffix)).is_symlink())

    def test_conflicting_local_save_is_not_chosen_or_overwritten(self):
        (self.card / 'game.gci').write_bytes(b'local save')
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Existing saves differ', result.stderr)
        self.assertEqual((self.card / 'game.gci').read_bytes(), b'local save')
        self.assertEqual((self.repo / CARD / 'game.gci').read_bytes(), b'remote save')
        self.assertFalse((self.home / '.config/omarchy/plugins/brs98.game-saves').exists())

    def test_independent_unit_is_not_replaced(self):
        unit = self.home / '.config/systemd/user/retroarch-saves.service'
        unit.parent.mkdir(parents=True)
        unit.write_text('personal service')
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(unit.read_text(), 'personal service')

    def test_missing_desktop_does_not_claim_widget_installed(self):
        (self.mockbin / 'omarchy').write_text('#!/bin/sh\nexit 1\n')
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Start the Omarchy desktop', result.stderr)
        self.assertFalse((self.home / '.config/omarchy/plugins/brs98.game-saves').exists())

    def test_detached_local_commits_are_not_discarded(self):
        self.git('checkout', '--detach')
        (self.repo / CARD / 'game.gci').write_bytes(b'detached progress')
        self.git('commit', '-am', 'detached progress')
        head = self.git('rev-parse', 'HEAD')
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git('rev-parse', 'HEAD'), head)
        self.assertEqual(self.git('branch', '--show-current'), '')


if __name__ == '__main__':
    unittest.main()
