"""Exercise shortcut state transitions without changing the live desktop."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'stow/aerospace/.config/aerospace'


class OpacityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('fullscreen-toggle.sh', 'opacity-toggle.sh'):
            shutil.copy2(SCRIPTS / name, self.root / name)
        mock = self.root / 'aerospace'
        mock.write_text('#!/bin/sh\nprintf "%s\\n" "$MOCK_WINDOW"\nexit "${MOCK_STATUS:-0}"\n')
        mock.chmod(0o755)
        self.env = dict(os.environ, PATH=f'{self.root}:{os.environ["PATH"]}')
        self.state = self.root / 'wezterm-fullscreen-state.lua'

    def run_script(self, name, window='com.github.wez.wezterm false', status='0'):
        return subprocess.run([str(self.root / name)], env=dict(
            self.env, MOCK_WINDOW=window, MOCK_STATUS=status), capture_output=True)

    def assert_opaque(self, value):
        self.assertEqual(self.state.read_text(), f'return {{ opaque = {str(value).lower()} }}\n')

    def test_fullscreen_enter_exit_and_repeated_sync(self):
        for value in (True, True, False, False):
            result = self.run_script('fullscreen-toggle.sh', f'com.github.wez.wezterm {str(value).lower()}')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assert_opaque(value)

    def test_other_apps_and_empty_focus_preserve_opacity(self):
        self.run_script('opacity-toggle.sh')
        for window in ('com.apple.Terminal true', ''):
            self.assertEqual(self.run_script('fullscreen-toggle.sh', window).returncode, 0)
            self.assert_opaque(True)

    def test_failed_query_preserves_state(self):
        self.run_script('opacity-toggle.sh')
        self.assertNotEqual(self.run_script('fullscreen-toggle.sh', status='1').returncode, 0)
        self.assert_opaque(True)

    def test_manual_toggle_and_fullscreen_override(self):
        for value in (True, False, True):
            self.assertEqual(self.run_script('opacity-toggle.sh').returncode, 0)
            self.assert_opaque(value)
        self.run_script('fullscreen-toggle.sh', 'com.github.wez.wezterm false')
        self.assert_opaque(False)


if __name__ == '__main__':
    unittest.main()
