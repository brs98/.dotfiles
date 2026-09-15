"""Desktop bootstrap safety fixtures: no live apps, downloads or service changes."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class DesktopBootstrapTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.calls = self.root / "calls"
        self.env = dict(os.environ, HOME=str(self.root), PATH=f"{self.bin}:{os.environ['PATH']}", CALLS=str(self.calls))
        self.command("uname", 'echo Darwin')
        for cmd in ["brew", "open", "launchctl", "curl"]:
            self.command(cmd, f'echo "{cmd} $*" >> "$CALLS"')
        app = self.root / "RiceKit.app"
        cli = app / "Contents/MacOS/ricekit"
        cli.parent.mkdir(parents=True)
        cli.write_text('''#!/bin/bash
echo "ricekit $*" >> "$CALLS"
case "$*" in
  "current --json") echo '{"theme":"my-existing-theme","active_configs":["sketchybar-colors","jankyborders-colors","wezterm-colors","wezterm-config","neovim-colors","starship-prompt"]}' ;;
  "config list --json") echo '[{"name":"sketchybar-colors"},{"name":"jankyborders-colors"},{"name":"wezterm-colors"},{"name":"wezterm-config"},{"name":"neovim-colors"},{"name":"starship-prompt"}]' ;;
esac
''')
        cli.chmod(0o755)
        source = (ROOT / "mac/bootstrap/desktop.sh").read_text()
        self.script = self.root / "desktop.sh"
        self.script.write_text(source.replace("app=/Applications/RiceKit.app", f"app='{app}'").replace("/Applications/AeroSpace.app", str(app)))

    def command(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/bash\n" + body + "\n")
        path.chmod(0o755)

    def run_script(self, *args):
        return subprocess.run(["/bin/bash", str(self.script), *args], env=self.env, capture_output=True, text=True)

    def call_text(self):
        return self.calls.read_text() if self.calls.exists() else ""

    def test_dry_run_has_no_app_or_service_calls(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.call_text(), "")

    def test_onboarding_gate_never_initializes_trial(self):
        result = self.run_script("--apply")
        self.assertEqual(result.returncode, 3, result.stderr)
        self.assertNotIn("ricekit ", self.call_text())
        self.assertNotIn("launchctl ", self.call_text())

    def test_existing_theme_preserved_and_missing_scripts_block_services(self):
        result = self.run_script("--apply", "--onboarding-complete")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("ricekit apply my-existing-theme", self.call_text())
        self.assertNotIn("brew services", self.call_text())
        self.assertNotIn("launchctl ", self.call_text())

    def test_invalid_generated_script_blocks_services(self):
        target = self.root / ".config/sketchybar/colors.sh"
        target.parent.mkdir(parents=True)
        target.write_text("if then\n")
        result = self.run_script("--apply", "--onboarding-complete")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("Invalid desktop script", result.stderr)
        self.assertNotIn("brew services", self.call_text())
        self.assertNotIn("launchctl ", self.call_text())


if __name__ == "__main__":
    unittest.main()
