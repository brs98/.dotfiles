"""Run with python3 -m unittest discover -s mac/tests -p test_preferences.py."""

import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("preferences", Path(__file__).resolve().parents[1] / "bootstrap/preferences.py")
prefs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prefs)

POWER = """Battery Power:
 sleep 1
 displaysleep 10
 hibernatemode 3
AC Power:
 sleep 1
 displaysleep 10
 hibernatemode 3
"""


def matching_domains():
    domains = {domain: {} for domain, *_ in prefs.SCALARS}
    for domain, key, value, host in prefs.SCALARS:
        if not host:
            domains[domain][key] = value
    domains[prefs.HOTKEY_DOMAIN] = {"AppleSymbolicHotKeys": {
        key: prefs.disabled_hotkey(None, key) for key in prefs.HOTKEY_DEFAULTS
    }}
    return domains


class PreferencesTests(unittest.TestCase):
    def test_screenshot_destination_preserves_case_and_is_idempotent(self):
        domains = matching_domains()
        domains['com.apple.screencapture']['location'] = '/old/Desktop'
        changes = prefs.preference_plan(domains, 1)
        self.assertEqual(len(changes), 1)
        destination = str(Path.home() / 'Downloads')
        self.assertEqual(changes[0]['command'], ['defaults', 'write', 'com.apple.screencapture', 'location', '-string', destination])
        domains['com.apple.screencapture']['location'] = destination
        self.assertEqual(prefs.preference_plan(domains, 1), [])

    def test_matching_values_plan_is_empty(self):
        self.assertEqual(prefs.preference_plan(matching_domains(), 1), [])

    def test_only_target_hotkeys_change_and_custom_values_survive(self):
        domains = matching_domains()
        hotkeys = domains[prefs.HOTKEY_DOMAIN]["AppleSymbolicHotKeys"]
        hotkeys["29"] = {"enabled": True, "value": {"parameters": [1, 2, 3]}}
        hotkeys["64"] = {"enabled": True, "value": {"parameters": [7, 8, 9]}, "extra": "kept"}
        domains[prefs.HOTKEY_DOMAIN]["other"] = {"preserve": True}
        before = copy.deepcopy(domains)
        changes = prefs.preference_plan(domains, 1)
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["entry"], "64")
        self.assertEqual(changes[0]["after"], {"enabled": False, "value": {"parameters": [7, 8, 9]}, "extra": "kept"})
        self.assertIn("-dict-add", changes[0]["command"])
        self.assertEqual(domains, before)
        hotkeys["64"] = changes[0]["after"]
        self.assertEqual(prefs.preference_plan(domains, 1), [])

    def test_missing_keys_get_all_preferences_and_scoped_originals(self):
        domains = {domain: {} for domain in matching_domains()}
        changes = prefs.preference_plan(domains, None)
        self.assertEqual(len(changes), len(prefs.SCALARS) + len(prefs.HOTKEY_DEFAULTS))
        self.assertTrue(all(change["before"] is None for change in changes))
        host = next(item for item in changes if item.get("current_host"))
        self.assertEqual(host["command"][:2], ["defaults", "-currentHost"])
        for change in changes:
            if "entry" in change:
                domains[change["domain"]].setdefault("AppleSymbolicHotKeys", {})[change["entry"]] = change["after"]
            elif not change["current_host"]:
                domains[change["domain"]][change["key"]] = change["after"]
        self.assertEqual(prefs.preference_plan(domains, 1), [])

    def test_malformed_hotkey_refuses_replacement(self):
        domains = matching_domains()
        domains[prefs.HOTKEY_DOMAIN]["AppleSymbolicHotKeys"]["28"] = "unexpected"
        with self.assertRaises(ValueError):
            prefs.preference_plan(domains, 1)

    @unittest.skipUnless(sys.platform == "darwin", "validate native defaults parser on macOS")
    def test_typed_dictionary_write_preserves_unrelated_entries(self):
        value = {"enabled": False, "value": {"parameters": [51, 20, 1179648], "type": "standard"}, "extra": 'quotes " backslash \\'}
        with tempfile.TemporaryDirectory() as temporary:
            # An isolated fixture file; never a live preference domain.
            domain = str(Path(temporary) / "fixture")
            subprocess.run(["defaults", "write", domain, "hotkeys", prefs.plist_value({"29": {"enabled": True}})], check=True)
            subprocess.run(["defaults", "write", domain, "hotkeys", "-dict-add", "28", prefs.plist_value(value)], check=True)
            decoded = plistlib.loads(subprocess.check_output(["defaults", "export", domain, "-"]))
        self.assertEqual(decoded["hotkeys"]["28"], value)
        self.assertIs(decoded["hotkeys"]["28"]["enabled"], False)
        self.assertIsInstance(decoded["hotkeys"]["28"]["value"]["parameters"][0], int)
        self.assertEqual(decoded["hotkeys"]["29"], {"enabled": True})

    def test_power_changes_preserve_battery_sleep_and_ups(self):
        profiles = prefs.parse_power(POWER + "UPS Power:\n sleep 20\n displaysleep 30\n")
        self.assertEqual(prefs.power_plan(profiles), [
            ["sudo", "pmset", "-b", "displaysleep", "0"],
            ["sudo", "pmset", "-c", "displaysleep", "0"],
            ["sudo", "pmset", "-c", "sleep", "0"],
        ])
        profiles["Battery Power"]["displaysleep"] = 0
        profiles["AC Power"].update(displaysleep=0, sleep=0)
        self.assertEqual(prefs.power_plan(profiles), [])
        self.assertEqual(profiles["Battery Power"]["sleep"], 1)
        self.assertEqual(profiles["UPS Power"]["displaysleep"], 30)

    def test_desktop_without_battery_and_bad_power_output(self):
        self.assertEqual(prefs.power_plan({"AC Power": {"sleep": 0, "displaysleep": 0}}), [])
        with self.assertRaises(ValueError):
            prefs.parse_power("unexpected output")

    def test_default_preview_never_writes_or_creates_state(self):
        domains = matching_domains()
        domains["NSGlobalDomain"]["KeyRepeat"] = 6
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state"
            with patch.object(sys, "platform", "darwin"), patch.object(prefs.os, "geteuid", return_value=501), patch.object(prefs, "collect", return_value=(domains, 1)), patch.object(prefs, "checked", return_value=POWER) as checked, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(prefs.main(["--state-dir", str(state)]), 0)
            checked.assert_called_once_with(["pmset", "-g", "custom"])
            self.assertFalse(state.exists())

    def test_apply_saves_only_changed_keys_and_verifies(self):
        before = matching_domains()
        before["NSGlobalDomain"].update(KeyRepeat=6, unrelated="do not save")
        after = matching_domains()
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(sys, "platform", "darwin"), patch.object(prefs.os, "geteuid", return_value=501), patch.object(prefs, "collect", side_effect=[(before, 1), (after, 1)]), patch.object(prefs, "checked") as checked, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(prefs.main(["--apply", "--skip-power", "--state-dir", temporary]), 0)
            checked.assert_called_once_with(["defaults", "write", "NSGlobalDomain", "KeyRepeat", "-int", "2"])
            backup = next(Path(temporary).glob("*.json"))
            document = json.loads(backup.read_text())
            self.assertEqual(document["changes"][0]["before"], 6)
            self.assertNotIn("unrelated", backup.read_text())
            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
