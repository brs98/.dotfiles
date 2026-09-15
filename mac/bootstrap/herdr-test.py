#!/usr/bin/env python3
"""Exercise cached installs in a temporary home: no downloads or real sessions."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
COMMIT = "72daa8e0c08315657d5d585645c3fa624f6801a3"


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name) / "home"
        self.home.mkdir()
        fixtures = Path(self.tmp.name) / "fixtures"
        fixtures.mkdir()
        rustup = fixtures / "bin/rustup"
        rustup.parent.mkdir()
        rustup.write_text("#!/bin/bash\nexit 97\n")
        rustup.chmod(0o755)
        self.calls = fixtures / "calls"
        shell_env = fixtures / "bash-env"
        shell_env.write_text(r'''# Command fixtures prevent any real build/download or SDK access.
function command() {
  if [[ "${1:-}" == -v ]]; then
    case "${2:-}" in
      git|curl|tar|just|brew)
        [[ "$HERDR_TEST_BUILD_TOOLS" == present ]] && return 0
        return 1 ;;
    esac
  fi
  builtin command "$@"
}
function unexpected_build() { echo "unexpected build: $*" >> "$HERDR_TEST_CALLS"; return 97; }
function git() { unexpected_build git "$@"; }
function curl() { unexpected_build curl "$@"; }
function tar() { unexpected_build tar "$@"; }
function just() { unexpected_build just "$@"; }
function brew() {
  echo brew >> "$HERDR_TEST_CALLS"
  [[ "$*" == '--prefix rustup' ]] || return 97
  echo "$HERDR_TEST_FIXTURES"
}
function /usr/bin/xcrun() {
  echo "xcrun $*" >> "$HERDR_TEST_CALLS"
  [[ "$*" != '--sdk macosx --show-sdk-version' ]] || { echo 26.5; return 0; }
  [[ "$*" != '--sdk macosx15.4 --show-sdk-path' ]] || return 1
  return 97
}
''')
        self.env = dict(
            os.environ, HOME=str(self.home), BASH_ENV=str(shell_env),
            HERDR_TEST_BUILD_TOOLS="missing", HERDR_TEST_FIXTURES=str(fixtures),
            HERDR_TEST_CALLS=str(self.calls),
        )

    def run_installer(self, *args, check=True):
        return subprocess.run(
            ["bash", str(ROOT / "herdr.sh"), *args],
            env=self.env, text=True, capture_output=True, check=check,
        )

    def seed_cache(self):
        digest = hashlib.sha256((ROOT / "patches/herdr-hide-tabs.patch").read_bytes()).hexdigest()
        cache = self.home / "Library/Caches/brs98-mac-setup/herdr" / f"{COMMIT}-{digest}"
        cache.mkdir(parents=True)
        binary = cache / "herdr"
        binary.write_text('#!/bin/bash\nprintf "cached test binary\\n"\n')
        binary.chmod(0o755)
        (cache / "binary.sha256").write_text(hashlib.sha256(binary.read_bytes()).hexdigest() + "\n")
        return binary

    def test_default_is_read_only(self):
        result = self.run_installer()
        self.assertIn("Dry run", result.stdout)
        self.assertEqual(list(self.home.iterdir()), [])

    def test_cached_install_needs_neither_build_tools_nor_sdk(self):
        cached = self.seed_cache()
        result = self.run_installer("--apply")
        self.assertIn("Verified cached binary", result.stdout)
        self.assertEqual((self.home / ".local/lib/herdr-fork/herdr").read_bytes(), cached.read_bytes())
        self.assertFalse(self.calls.exists(), "Cached installation must not query build tools or SDKs")

    def test_cached_install_skips_sdk_even_when_build_tools_are_present(self):
        self.seed_cache()
        self.env["HERDR_TEST_BUILD_TOOLS"] = "present"
        self.assertIn("Verified cached binary", self.run_installer("--apply").stdout)
        self.assertFalse(self.calls.exists())

    def test_invalid_cache_still_requires_build_tools(self):
        cached = self.seed_cache()
        cached.write_text("corrupted cache\n")
        result = self.run_installer("--apply", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Missing git", result.stderr)
        self.assertFalse((self.home / ".local/lib/herdr-fork/herdr").exists())
        self.assertFalse(self.calls.exists())
        self.assertFalse((cached.parent.parent / "install.lock").exists())

    def test_invalid_cache_still_requires_compatible_sdk(self):
        cached = self.seed_cache()
        cached.write_text("corrupted cache\n")
        self.env["HERDR_TEST_BUILD_TOOLS"] = "present"
        result = self.run_installer("--apply", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("needs the macOS 15.4 SDK", result.stderr)
        self.assertIn("xcrun --sdk macosx15.4 --show-sdk-path", self.calls.read_text())
        self.assertNotIn("unexpected build", self.calls.read_text())
        self.assertFalse((self.home / ".local/lib/herdr-fork/herdr").exists())
        self.assertFalse((cached.parent.parent / "install.lock").exists())

    def test_cached_install_preserves_conflicts_and_is_idempotent(self):
        cached = self.seed_cache()
        launcher = self.home / ".local/bin/herdr"
        launcher.parent.mkdir(parents=True)
        original = self.home / "old-launcher"
        original.write_text("original launcher\n")
        launcher.symlink_to(original)
        binary = self.home / ".local/lib/herdr-fork/herdr"
        binary.parent.mkdir(parents=True)
        binary.write_text("old binary\n")
        self.run_installer("--apply")
        self.assertEqual(binary.read_bytes(), cached.read_bytes())
        self.assertFalse(launcher.is_symlink())
        self.assertEqual(original.read_text(), "original launcher\n")
        backups = self.home / ".local/state/brs98-mac-setup/backups"
        saved = list(backups.iterdir())
        self.assertEqual(len(saved), 1)
        self.assertTrue((saved[0] / "launcher").is_symlink())
        self.assertEqual((saved[0] / "binary").read_text(), "old binary\n")
        previous_mtime = binary.stat().st_mtime_ns
        self.run_installer("--apply")
        self.assertEqual(binary.stat().st_mtime_ns, previous_mtime)
        self.assertEqual(list(backups.iterdir()), saved)
        updater = subprocess.run([str(launcher), "update"], env=self.env, capture_output=True, text=True)
        self.assertEqual(updater.returncode, 1)
        self.assertIn("upstream updater is disabled", updater.stderr)


if __name__ == "__main__":
    unittest.main()
