#!/usr/bin/env python3
"""Apply Brandon's macOS preferences; preview only unless --apply is supplied."""

import argparse
import copy
import datetime
import json
import os
from pathlib import Path
import plistlib
import shlex
import subprocess
import sys


TRACKPAD = "com.apple.AppleMultitouchTrackpad"
BLUETOOTH_TRACKPAD = "com.apple.driver.AppleBluetoothMultitouch.trackpad"
HOTKEY_DOMAIN = "com.apple.symbolichotkeys"
SCALARS = [
    ("com.apple.screencapture", "location", str(Path.home() / "Downloads"), False),
    ("NSGlobalDomain", "KeyRepeat", 2, False),
    ("NSGlobalDomain", "InitialKeyRepeat", 15, False),
    ("NSGlobalDomain", "com.apple.swipescrolldirection", False, False),
    ("NSGlobalDomain", "_HIHideMenuBar", True, False),
    ("com.apple.dock", "autohide", True, False),
    (TRACKPAD, "Clicking", True, False),
    (TRACKPAD, "TrackpadThreeFingerDrag", True, False),
    (TRACKPAD, "Dragging", False, False),
    (TRACKPAD, "DragLock", False, False),
    (BLUETOOTH_TRACKPAD, "Clicking", True, False),
    (BLUETOOTH_TRACKPAD, "TrackpadThreeFingerDrag", True, False),
    ("NSGlobalDomain", "com.apple.mouse.tapBehavior", 1, True),
]
# Baseline bindings observed on macOS 26.5.1. Existing custom values are preserved.
HOTKEY_DEFAULTS = {
    "28": [51, 20, 1179648],
    "30": [52, 21, 1179648],
    "184": [53, 23, 1179648],
    "64": [32, 49, 1048576],
}


def run(argv):
    return subprocess.run(argv, text=True, capture_output=True, check=False)


def checked(argv, runner=run):
    result = runner(argv)
    if result.returncode:
        raise RuntimeError(f"{shlex.join(argv[:3])} failed: {result.stderr.strip()}")
    return result.stdout


def read_domain(domain, runner=run):
    result = runner(["defaults", "export", domain, "-"])
    if result.returncode:
        if "does not exist" in result.stderr.lower() or "could not find domain" in result.stderr.lower():
            return {}
        raise RuntimeError(f"Cannot read defaults domain {domain}: {result.stderr.strip()}")
    return plistlib.loads(result.stdout.encode())


def read_host_tap(runner=run):
    result = runner(["defaults", "-currentHost", "read", "NSGlobalDomain", "com.apple.mouse.tapBehavior"])
    if result.returncode:
        if "does not exist" in result.stderr.lower():
            return None
        raise RuntimeError(f"Cannot read current-host tap behavior: {result.stderr.strip()}")
    return int(result.stdout.strip())


def plist_value(value):
    """Use XML so nested booleans/integers retain their types in defaults."""
    return plistlib.dumps(value, fmt=plistlib.FMT_XML).decode("utf-8")


def disabled_hotkey(existing, key):
    entry = copy.deepcopy(existing)
    if entry is None:
        entry = {"value": {"parameters": HOTKEY_DEFAULTS[key], "type": "standard"}}
    if not isinstance(entry, dict):
        raise ValueError(f"Hotkey {key} is not a dictionary; refusing to replace it")
    entry["enabled"] = False
    return entry


def preference_plan(domains, host_tap):
    """Return commands and scoped original values; never mutate input snapshots."""
    changes = []
    for domain, key, desired, host in SCALARS:
        old = host_tap if host else domains[domain].get(key)
        if old == desired:
            continue
        prefix = ["defaults"] + (["-currentHost"] if host else [])
        kind = "-bool" if isinstance(desired, bool) else "-int" if isinstance(desired, int) else "-string"
        value = str(desired).lower() if isinstance(desired, bool) else str(desired)
        changes.append({"domain": domain, "key": key, "current_host": host,
                        "before": old, "after": desired,
                        "command": prefix + ["write", domain, key, kind, value]})
    hotkeys = domains[HOTKEY_DOMAIN].get("AppleSymbolicHotKeys", {})
    if not isinstance(hotkeys, dict):
        raise ValueError("AppleSymbolicHotKeys is not a dictionary; refusing to replace it")
    for key in HOTKEY_DEFAULTS:
        old = hotkeys.get(key)
        desired = disabled_hotkey(old, key)
        if old == desired:
            continue
        changes.append({"domain": HOTKEY_DOMAIN, "key": "AppleSymbolicHotKeys",
                        "entry": key, "before": old, "after": desired,
                        "command": ["defaults", "write", HOTKEY_DOMAIN, "AppleSymbolicHotKeys",
                                    "-dict-add", key, plist_value(desired)]})
    return changes


def parse_power(output):
    profiles = {}
    current = None
    for raw in output.splitlines():
        line = raw.strip()
        if line.endswith(":"):
            current = line[:-1]
            profiles[current] = {}
        elif current and line:
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                profiles[current][parts[0]] = int(parts[1])
    if "AC Power" not in profiles:
        raise ValueError("pmset output did not include AC Power; refusing to guess")
    return profiles


def power_plan(profiles, root=False):
    commands = []
    prefix = [] if root else ["sudo"]
    # Separate -b and -c avoids changing a UPS profile on a desktop Mac.
    for profile, flag in [("Battery Power", "-b"), ("AC Power", "-c")]:
        if profile in profiles and profiles[profile].get("displaysleep") != 0:
            commands.append(prefix + ["pmset", flag, "displaysleep", "0"])
    if profiles["AC Power"].get("sleep") != 0:
        commands.append(prefix + ["pmset", "-c", "sleep", "0"])
    return commands


def collect(runner=run):
    domains = {domain: read_domain(domain, runner)
               for domain in sorted({row[0] for row in SCALARS} | {HOTKEY_DOMAIN})}
    return domains, read_host_tap(runner)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write preferences and verify; otherwise preview")
    mode.add_argument("--dry-run", action="store_true", help="explicit preview (the default)")
    parser.add_argument("--skip-power", action="store_true", help="leave pmset settings for a later invocation")
    parser.add_argument("--state-dir", type=Path, default=Path.home() / ".local/state/mac-bootstrap/preferences")
    args = parser.parse_args(argv)
    if sys.platform != "darwin":
        parser.error("this script only supports macOS")
    if os.geteuid() == 0:
        parser.error("run as your login user, not sudo; only pmset commands request elevation")
    domains, host_tap = collect()
    changes = preference_plan(domains, host_tap)
    power = None if args.skip_power else parse_power(checked(["pmset", "-g", "custom"]))
    power_commands = [] if power is None else power_plan(power)
    commands = [item["command"] for item in changes] + power_commands
    print("Apply preferences:" if args.apply else "Preview only; use --apply to write preferences:")
    for command in commands:
        print("  " + shlex.join(command))
    if not commands:
        print("  All requested stored values already match.")
    if args.apply and commands:
        args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup = args.state_dir / (stamp + ".json")
        # Save only keys being changed, never the full global domain.
        with backup.open("x", encoding="utf-8") as stream:
            os.chmod(backup, 0o600)
            json.dump({"changes": changes, "power_before": power}, stream, indent=2)
        print(f"Saved original values to {backup}")
        for command in commands:
            checked(command)
        after_domains, after_host = collect()
        if preference_plan(after_domains, after_host):
            raise RuntimeError("Preference readback differs from requested values; see saved original values")
        if power is not None:
            after_power = parse_power(checked(["pmset", "-g", "custom"]))
            if power_plan(after_power):
                raise RuntimeError("Power readback differs from requested values")
            if "Battery Power" in power and after_power.get("Battery Power", {}).get("sleep") != power["Battery Power"].get("sleep"):
                raise RuntimeError("Battery system sleep changed unexpectedly; see saved power values")
        print("Stored preferences verified. Log out and back in for all input and shortcut changes to take effect.")
    print("Manual: Modifier Keys → select each keyboard → Caps Lock = Control (preserve all other mappings).")
    print("Manual: Raycast onboarding → Command-Space and Open at Login; approve new dock accessories with lid open.")
    print("Clamshell check: connect power, external display, and external input devices, then test closing the lid.")
    if args.skip_power:
        print("Pending: power preferences were skipped; rerun without --skip-power to include them.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, OSError, plistlib.InvalidFileException) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
