#!/usr/bin/env python3
"""Manage the Heroic/BakkesMod integration without owning either updater."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

FEED = "https://updater.bakkesmod.com/updater/0"
TEXTURES = "EditorLandscapeResources EditorMaterials EditorMeshes EditorResources EngineDebugMaterials EngineMaterials EngineResources MapTemplateIndex MapTemplates NodeBuddies Engine_MI_Shaders EngineVolumetrics EngineBuildings mods".split()


class Problem(Exception):
    pass


def read_json(path):
    try:
        value = json.loads(path.read_text())
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (OSError, ValueError):
        raise Problem(f"Cannot read valid metadata: {path}") from None


def small_text(path):
    return path.read_text().strip() if path.is_file() else "missing"


def digest(path):
    if not path.is_file():
        return "missing"
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def atomic(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".rocket-league-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def encoded(value):
    return (json.dumps(value, indent=2) + "\n").encode()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def running():
    # Read names and lifecycle state only; command lines may contain Epic authentication.
    names = []
    for path in Path("/proc").glob("[0-9]*/comm"):
        try:
            name = path.read_text().strip().lower()
            # Exited processes can retain comm until their parent reaps them.
            state = (path.parent / "stat").read_text().rsplit(") ", 1)[1].split()[0]
            if state in ("Z", "X", "x"):
                continue
        except (OSError, IndexError):
            continue
        if name.startswith(("rocketleague", "bakkesmod")) or name == "launcher.exe":
            names.append(name)
    return sorted(set(names))


def stop_idle_injectors(prefix):
    # Never read command lines or environments: Heroic may put credentials there.
    injector = str((prefix / "drive_c/Program Files/BakkesMod/BakkesMod.exe").resolve())
    for path in Path("/proc").glob("[0-9]*/comm"):
        fd = None
        try:
            if path.read_text().strip().lower() != "bakkesmod.exe":
                continue
            # Pin the process before verifying its identity to avoid PID reuse.
            fd = os.pidfd_open(int(path.parent.name))
            if path.parent.stat().st_uid != os.getuid() or path.read_text().strip().lower() != "bakkesmod.exe":
                continue
            mappings = (path.parent / "maps").read_text().splitlines()
            if not any(len(fields := line.split(maxsplit=5)) == 6 and fields[5] == injector for line in mappings):
                continue
            if any(not name.startswith("bakkesmod") for name in running()):
                raise Problem("Rocket League or its launcher is still running. Wait for it to close before relaunching.")
            signal.pidfd_send_signal(fd, signal.SIGTERM)
            if not select.select([fd], [], [], 5)[0]:
                raise Problem("BakkesMod did not exit. Quit its tray app, then launch Rocket League again.")
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError:
            # An unverified process must remain untouched; stopped() explains it.
            continue
        finally:
            if fd is not None:
                os.close(fd)


class Manager:
    def __init__(self, online=False):
        home = Path.home()
        self.state = Path(os.environ.get("XDG_STATE_HOME", home / ".local/state")) / "rocket-league"
        self.data = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "rocket-league"
        self.heroic_config = Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / "heroic"
        self.heroic = Path(os.environ.get("HEROIC_BIN") or shutil.which("heroic") or "/opt/Heroic/heroic")
        self.manifest = self.heroic_config / "legendaryConfig/legendary/installed.json"
        installed = read_json(self.manifest).get("Sugar", {})
        settings = read_json(self.heroic_config / "GamesConfig/Sugar.json").get("Sugar", {})
        if not isinstance(installed, dict) or not isinstance(settings, dict):
            raise Problem("Rocket League's Heroic settings are invalid.")
        self.version = installed.get("version")
        if not isinstance(self.version, str) or not self.version.strip():
            raise Problem("Heroic's Rocket League version is missing.")
        self.game = self.path(installed.get("install_path"), "game install")
        self.prefix = self.path(settings.get("winePrefix"), "Wine prefix")
        for key, actual in (("ROCKET_LEAGUE_DIR", self.game), ("ROCKET_LEAGUE_PREFIX", self.prefix)):
            if os.environ.get(key) and Path(os.environ[key]).resolve() != actual.resolve():
                raise Problem(f"{key} disagrees with Heroic. Correct the override before repairing.")
        wine = settings.get("wineVersion") or {}
        self.runner = self.path(wine.get("bin") if isinstance(wine, dict) else None, "Proton/Wine runner")
        self.runner_name = wine.get("name", self.runner.name)
        if online:
            return
        users = self.prefix / "drive_c/users"
        candidates = sorted({path.resolve() for path in users.glob("*/AppData/Roaming/bakkesmod/bakkesmod")})
        if len(candidates) != 1:
            raise Problem("Expected one BakkesMod install in this prefix. Install it through Heroic's Run EXE on Prefix, or resolve duplicate installs.")
        self.mod = candidates[0]
        self.windows_user = self.mod.parents[3]
        self.injector = self.prefix / "drive_c/Program Files/BakkesMod/BakkesMod.exe"
        self.batch = self.game / "run_with_bakkesmod.bat"
        self.template = self.data / "run_with_bakkesmod.bat"
        self.mirror = self.windows_user / ".config/legendary/installed.json"

    @staticmethod
    def path(value, label):
        if not isinstance(value, str) or not value or not Path(value).is_absolute():
            raise Problem(f"Heroic has no absolute {label} path. Configure Rocket League in Heroic first.")
        return Path(value)

    @contextlib.contextmanager
    def lock(self):
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.state / "operation.lock").open("w") as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Problem("Another Rocket League manager operation is active.") from None
            yield

    def stopped(self):
        processes = running()
        if processes:
            raise Problem("Close Rocket League and the BakkesMod tray app first: " + ", ".join(processes))

    def record(self, action, **fields):
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.state / "history.jsonl").open("a") as stream:
            stream.write(json.dumps({"time": now(), "action": action, **fields}) + "\n")

    def snapshot(self):
        package = "unknown"
        if shutil.which("pacman"):
            result = subprocess.run(["pacman", "-Q", "heroic-games-launcher-bin"], capture_output=True, text=True)
            if result.returncode == 0:
                package = result.stdout.strip()
        return {
            "Heroic": package,
            "Heroic executable": str(self.heroic.resolve()),
            "Rocket League": self.version,
            "Game directory": str(self.game.resolve()),
            "Wine prefix": str(self.prefix.resolve()),
            "Game executable": digest(self.game / "Binaries/Win64/RocketLeague.exe"),
            "BakkesMod": small_text(self.mod / "version.txt"),
            "BakkesMod DLL": digest(self.mod / "dll/bakkesmod.dll"),
            "Injector": small_text(self.mod / "injectorversion.txt"),
            "Injector executable": digest(self.injector),
            "Runner": str(self.runner.resolve()),
            "Runner version": small_text(self.runner.parent / "version"),
            "Runner script": digest(self.runner),
            "Runner Wine binary": digest(self.runner.parent / "files/bin/wine64"),
        }

    def known(self, snapshot):
        path = self.state / "working.json"
        if not path.exists():
            return False, ["No successful session recorded yet"]
        previous = read_json(path).get("versions", {})
        if not isinstance(previous, dict):
            raise Problem("Working-session record is invalid. Move working.json aside and record a new tested session.")
        changes = [key for key, value in snapshot.items() if previous.get(key) != value]
        return not changes, changes

    def release(self, refresh=False, offline=False):
        cache = self.state / "release.json"
        value = None
        if cache.exists():
            try:
                value = read_json(cache)
                if not (isinstance(value.get("builds"), list) and value["builds"] and all(isinstance(v, str) and v for v in value["builds"]) and isinstance(value.get("trainer"), str) and value["trainer"].isdigit() and isinstance(value.get("injector"), str) and value["injector"].isdigit()):
                    raise ValueError()
                age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(value["checked"])).total_seconds()
                if not refresh and 0 <= age < 21600:
                    return value, "cached (under 6 hours old)"
            except (Problem, KeyError, ValueError, TypeError):
                value = None
        if offline:
            return None, "unavailable offline; no fresh cached compatibility result"
        try:
            request = urllib.request.Request(FEED, headers={"User-Agent": "RocketLeagueManager/1.0"})
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = json.loads(response.read(256_000))
            ids = raw["gameinfo"]["egsbuildids"]
            trainer = str(raw["update_info"]["trainer_version"])
            injector = str(raw["injector"]["newinjectorversion"])
            if not isinstance(ids, str) or not ids.strip() or not trainer.isdigit() or not injector.isdigit():
                raise ValueError()
            value = {"checked": now(), "builds": [v.strip() for v in ids.split(",") if v.strip()], "trainer": trainer, "injector": injector}
            atomic(cache, encoded(value))
            return value, "live"
        except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError):
            return None, "unavailable; compatibility could not be checked"

    def desired(self):
        return [(self.batch, self.template.read_bytes()), (self.mirror, encoded({"Sugar": {"version": self.version}}))]

    def inspect(self, refresh=False, offline=False):
        versions = self.snapshot()
        known, changes = self.known(versions)
        errors = []
        for label, path in (("Heroic", self.heroic), ("Runner", self.runner), ("Game", self.game / "Binaries/Win64/RocketLeague.exe"), ("Game launcher", self.game / "Binaries/Win64/Launcher.exe"), ("BakkesMod injector", self.injector), ("BakkesMod DLL", self.mod / "dll/bakkesmod.dll"), ("Batch template", self.template)):
            if not path.is_file():
                errors.append(f"Missing {label}: {path}")
        for label, path in (("Heroic", self.heroic), ("Runner", self.runner)):
            if path.is_file() and not os.access(path, os.X_OK):
                errors.append(f"{label} is not executable: {path}")
        repairs = []
        if self.template.is_file():
            for path, content in self.desired():
                if not path.is_file() or path.read_bytes() != content:
                    repairs.append(str(path))
        release, source = self.release(refresh, offline)
        if release is None:
            compatibility = "unknown"
        elif self.version not in release["builds"]:
            compatibility = "not listed by current BakkesMod release"
        elif versions["BakkesMod"] != release["trainer"] or versions["Injector"] != release["injector"]:
            compatibility = "BakkesMod update needed"
        else:
            compatibility = "supported by official updater"
        missing_textures = [name + ".upk" for name in TEXTURES if not (self.game / "TAGame/CookedPCConsole" / (name + ".upk")).is_file()]
        return {"versions": versions, "known_working": known, "changes": changes, "compatibility": compatibility, "compatibility_source": source, "release": release, "errors": errors, "repairs": repairs, "missing_workshop_textures": missing_textures, "running": running()}

    @staticmethod
    def show(report):
        for name in ("Heroic", "Rocket League", "BakkesMod", "Injector", "Runner version"):
            print(f"{name}: {report['versions'][name]}")
        print(f"Compatibility: {report['compatibility']} ({report['compatibility_source']})")
        if report["known_working"]:
            print("Matches your last confirmed working session.")
        else:
            print("Changes since your last working session: " + ", ".join(report["changes"]))
        for error in report["errors"]:
            print("ERROR: " + error)
        if report["repairs"]:
            print("Repair needed: launcher helper / game-version metadata. Run: rocket-league repair")
        else:
            print("Launcher helper and game-version metadata are in sync.")
        if report["missing_workshop_textures"]:
            print(f"Workshop: {len(report['missing_workshop_textures'])} texture files missing; the Workshop Maps launcher can install them.")
        if report["compatibility"] == "BakkesMod update needed":
            print("Open Heroic → Rocket League → Run EXE on Prefix → BakkesMod.exe, let it update, close its tray app, then run doctor again.")
        elif report["compatibility"] != "supported by official updater" and not report["known_working"]:
            print("Offline mod play is unverified. Online play remains separate; do not force injection or disable injector safe mode.")
        if report["running"]:
            print("Running: " + ", ".join(report["running"]))

    def repair(self):
        self.stopped()
        report = self.inspect()
        if report["errors"]:
            raise Problem("\n".join(report["errors"]))
        changes = [(path, content) for path, content in self.desired() if not path.is_file() or path.read_bytes() != content]
        if not changes:
            print("Integration is already repaired; no files changed.")
            return report
        for path, _ in changes:
            if path.is_symlink():
                raise Problem(f"Refusing to replace a symlink: {path}")
        backup = self.state / "repairs" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup.mkdir(parents=True, mode=0o700)
        entries = []
        for index, (path, content) in enumerate(changes):
            previous = path.read_bytes() if path.exists() else None
            if previous is not None:
                atomic(backup / str(index), previous)
            entries.append({"path": str(path), "existed": previous is not None, "mode": path.stat().st_mode & 0o777 if previous is not None else 0o644, "after": hashlib.sha256(content).hexdigest()})
        atomic(backup / "manifest.json", encoded({"entries": entries}))
        applied = []
        try:
            for index, (path, content) in enumerate(changes):
                atomic(path, content)
                applied.append(index)
                path.chmod(entries[index]["mode"])
        except OSError:
            for index in reversed(applied):
                self.restore_entry(backup, index, entries[index])
            raise
        atomic(self.state / "last-repair.json", encoded({"backup": str(backup)}))
        self.record("repair", backup=str(backup), files=len(changes))
        print(f"Repaired {len(changes)} integration files. Backup: {backup}")
        return self.inspect()

    @staticmethod
    def restore_entry(backup, index, entry):
        target = Path(entry["path"])
        if entry["existed"]:
            atomic(target, (backup / str(index)).read_bytes())
            target.chmod(entry["mode"])
        else:
            target.unlink(missing_ok=True)

    def undo(self):
        self.stopped()
        pointer = self.state / "last-repair.json"
        if not pointer.exists():
            raise Problem("No repair to undo.")
        backup = Path(read_json(pointer)["backup"])
        entries = read_json(backup / "manifest.json")["entries"]
        allowed = {str(self.batch), str(self.mirror)}
        for entry in entries:
            target = Path(entry["path"])
            if str(target) not in allowed or target.is_symlink() or digest(target) != entry["after"]:
                raise Problem("Files changed since repair, or Heroic paths changed. Refusing to overwrite them.")
        for index, entry in enumerate(entries):
            if entry["existed"] and not (backup / str(index)).is_file():
                raise Problem("Repair backup is incomplete.")
        current = [(Path(entry["path"]).read_bytes(), Path(entry["path"]).stat().st_mode & 0o777) for entry in entries]
        restored = []
        try:
            for index, entry in enumerate(entries):
                restored.append(index)
                self.restore_entry(backup, index, entry)
        except OSError:
            for index in reversed(restored):
                target = Path(entries[index]["path"])
                atomic(target, current[index][0])
                target.chmod(current[index][1])
            raise
        pointer.unlink()
        self.record("undo-repair", backup=str(backup))
        print("Restored the integration files from before the last repair. Game/mod binaries were not changed.")

    def play(self, online=False, unverified=False):
        processes = running()
        if any(not name.startswith("bakkesmod") for name in processes):
            raise Problem("Rocket League or its launcher is still running. Wait for it to close before relaunching.")
        if processes:
            stop_idle_injectors(self.prefix)
        self.stopped()
        if not self.heroic.is_file() or not os.access(self.heroic, os.X_OK):
            raise Problem("Heroic is missing or not executable.")
        args = {"appName": "Sugar", "runner": "legendary", "gui": "false"}
        if online:
            launcher = self.game / "Binaries/Win64/Launcher.exe"
            if not launcher.is_file():
                raise Problem("Rocket League's official launcher is missing. Repair game files in Heroic.")
            args["altExe"] = str(launcher)
        if not online:
            report = self.repair()
            if not report["known_working"] and report["compatibility"] != "supported by official updater" and not unverified:
                raise Problem(f"{report['compatibility']}. Run rocket-league doctor. To deliberately test offline: rocket-league play --try-unverified")
            args["altExe"] = str(self.batch)
            atomic(self.state / "last-launch.json", encoded({"time": now(), "versions": report["versions"]}))
        self.record("launch-request", mode="online" if online else "offline")
        # Heroic owns authentication. Never capture or persist its launch output.
        # Heroic's protocol handler expects altExe as a raw path in the query.
        # Its legacy handler does not reliably decode percent-encoded paths.
        query = urllib.parse.urlencode({key: value for key, value in args.items() if key != "altExe"})
        if "altExe" in args:
            query += "&altExe=" + args["altExe"]
        result = subprocess.run([str(self.heroic), "--no-gui", "heroic://launch?" + query], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode:
            raise Problem("Heroic rejected the launch request. Open Heroic to check sign-in and game updates.")
        print("Launch requested. After verifying BakkesMod works in offline practice, use Mark Working." if not online else "Online launch requested through Heroic.")

    def workshop(self):
        report = self.inspect()
        if not report["known_working"] and report["compatibility"] != "supported by official updater":
            raise Problem("Use Repair & Launch Offline to test this combination before opening workshop maps.")
        if any(name.startswith("rocketleague_ea") for name in running()):
            raise Problem("Close online Rocket League before opening workshop maps.")
        env = dict(os.environ, ROCKET_LEAGUE_DIR=str(self.game), ROCKET_LEAGUE_PREFIX=str(self.prefix), BAKKESMOD_DIR=str(self.mod))
        return subprocess.call(["bash", str(self.data / "workshop-maps.sh")], env=env)

    def mark(self, confirmed):
        if not confirmed:
            raise Problem("After testing BakkesMod in offline practice, run: rocket-league mark-working --confirmed")
        report = self.inspect()
        if report["errors"] or report["repairs"]:
            raise Problem("Repair the integration before marking it working.")
        last = self.state / "last-launch.json"
        if not last.exists() or read_json(last).get("versions") != report["versions"]:
            raise Problem("Launch this exact setup through the manager and test it first. Its files may have changed since the last launch.")
        atomic(self.state / "working.json", encoded({"confirmed": now(), "versions": report["versions"]}))
        self.record("mark-working")
        print("Recorded this tested combination. This is a version record, not a backup of your game or prefix.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    doctor = sub.add_parser("doctor", help="Check files, changed versions and official compatibility")
    doctor.add_argument("--json", action="store_true")
    doctor.add_argument("--offline", action="store_true", help="Use a fresh cached compatibility result if available")
    sub.add_parser("repair", help="Back up and repair launcher helper / version metadata")
    sub.add_parser("undo-repair", help="Undo only the last integration repair")
    play = sub.add_parser("play", help="Repair and launch offline with BakkesMod")
    play.add_argument("--online", action="store_true", help="Launch normal Rocket League without the mod helper")
    play.add_argument("--try-unverified", action="store_true", help="Explicitly try offline when compatibility is unknown")
    mark = sub.add_parser("mark-working", help="Record a successfully tested combination (not a game backup)")
    mark.add_argument("--confirmed", action="store_true")
    sub.add_parser("workshop", help="Open workshop maps using the discovered Heroic paths")
    args = parser.parse_args()
    manager = Manager(online=args.command == "play" and args.online)
    if args.command == "workshop":
        return manager.workshop()
    if args.command == "doctor":
        report = manager.inspect(refresh=not args.offline, offline=args.offline)
        print(json.dumps(report, indent=2)) if args.json else manager.show(report)
        return 1 if report["errors"] or report["repairs"] else 0 if report["known_working"] or report["compatibility"] == "supported by official updater" else 2
    with manager.lock():
        if args.command == "repair":
            manager.show(manager.repair())
        elif args.command == "undo-repair":
            manager.undo()
        elif args.command == "play":
            manager.play(args.online, args.try_unverified)
        elif args.command == "mark-working":
            manager.mark(args.confirmed)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (Problem, OSError, ValueError, KeyError, TypeError) as error:
        print(f"rocket-league: {error}", file=sys.stderr)
        if shutil.which("notify-send"):
            subprocess.run(["notify-send", "--app-name=Rocket League", "Rocket League needs attention", str(error)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        sys.exit(130)
