#!/usr/bin/env python3
"""Manage the Heroic/BakkesMod integration and keep offline workshop play launchable."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

FEED = "https://updater.bakkesmod.com/updater/0"
# The updater feed's own download_url is plain HTTP; the same release is published on GitHub.
BAKKESMOD_ZIP = "https://github.com/bakkesmodorg/BakkesModInjectorCpp/releases/latest/download/bakkesmod.zip"
UNDERPASS = "Labs_Underpass_P.upk"
LEGENDARY_PROGRESS = re.compile(r"Progress: ([0-9.]+)%.*ETA: ([0-9:]+)")
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


def atomic_copy(source, path):
    # Maps can be hundreds of MB, so copy through a sibling file instead of memory.
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".rocket-league-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream, source.open("rb") as origin:
            shutil.copyfileobj(origin, stream, 1 << 20)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o644)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def notify(title, body="", replace=None):
    """Show a desktop notification; returns an id that later calls can replace."""
    if not shutil.which("notify-send"):
        return None
    args = ["notify-send", "--app-name=Rocket League", "--print-id"]
    if replace:
        args.append(f"--replace-id={replace}")
    result = subprocess.run(args + [title, body], capture_output=True, text=True)
    return result.stdout.strip() or replace


def preserved(name):
    # BakkesMod's zip ships default settings; never replace the user's, or the injector's own record.
    return name in ("bakkesmod.log", "injectorversion.txt") or name.startswith("cfg/") or (name.startswith("data/") and name.endswith(".cfg"))


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


def game_active():
    return any(name.startswith("rocketleague") or name == "launcher.exe" for name in running())


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
        installed = self.installed()
        settings = read_json(self.heroic_config / "GamesConfig/Sugar.json").get("Sugar", {})
        if not isinstance(settings, dict):
            raise Problem("Rocket League's Heroic settings are invalid.")
        self.game = self.path(installed.get("install_path"), "game install")
        self.underpass = self.game / "TAGame/CookedPCConsole" / UNDERPASS
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
        self.plain_batch = self.game / "run_without_bakkesmod.bat"
        self.plain_template = self.data / "run_without_bakkesmod.bat"
        self.mirror = self.windows_user / ".config/legendary/installed.json"

    def installed(self):
        """Read Heroic's install record; also refreshes self.version after a game update."""
        installed = read_json(self.manifest).get("Sugar", {})
        if not isinstance(installed, dict):
            raise Problem("Rocket League's Heroic settings are invalid.")
        self.version = installed.get("version")
        if not isinstance(self.version, str) or not self.version.strip():
            raise Problem("Heroic's Rocket League version is missing.")
        return installed

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
        return [(self.batch, self.template.read_bytes()), (self.plain_batch, self.plain_template.read_bytes()), (self.mirror, encoded({"Sugar": {"version": self.version}}))]

    def inspect(self, refresh=False, offline=False):
        versions = self.snapshot()
        known, changes = self.known(versions)
        errors = []
        for label, path in (("Heroic", self.heroic), ("Runner", self.runner), ("Game", self.game / "Binaries/Win64/RocketLeague.exe"), ("Game launcher", self.game / "Binaries/Win64/Launcher.exe"), ("BakkesMod injector", self.injector), ("BakkesMod DLL", self.mod / "dll/bakkesmod.dll"), ("Batch template", self.template), ("Plain batch template", self.plain_template)):
            if not path.is_file():
                errors.append(f"Missing {label}: {path}")
        for label, path in (("Heroic", self.heroic), ("Runner", self.runner)):
            if path.is_file() and not os.access(path, os.X_OK):
                errors.append(f"{label} is not executable: {path}")
        repairs = []
        if self.template.is_file() and self.plain_template.is_file():
            for path, content in self.desired():
                if not path.is_file() or path.read_bytes() != content:
                    repairs.append(str(path))
        release, source = self.release(refresh, offline)
        if release is None:
            compatibility = "unknown"
        elif self.version not in release["builds"]:
            compatibility = "not listed by current BakkesMod release"
        elif versions["BakkesMod"] != release["trainer"]:
            compatibility = "BakkesMod update needed"
        else:
            compatibility = "supported by official updater"
        # The injector offers its own update prompt when it starts, so it never blocks a launch.
        injector_update = release is not None and versions["Injector"] != release["injector"]
        missing_textures = [name + ".upk" for name in TEXTURES if not (self.game / "TAGame/CookedPCConsole" / (name + ".upk")).is_file()]
        return {"versions": versions, "known_working": known, "changes": changes, "compatibility": compatibility, "compatibility_source": source, "release": release, "errors": errors, "repairs": repairs, "injector_update": injector_update, "underpass_swapped": (self.state / "underpass.json").exists(), "missing_workshop_textures": missing_textures, "running": running()}

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
            print("The Workshop Maps launcher installs the BakkesMod update automatically.")
        if report["injector_update"]:
            print("The BakkesMod injector will offer its own update when it starts; accept it.")
        if report["underpass_swapped"]:
            print("Underpass currently holds a workshop map; it is restored when Rocket League closes.")
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
        allowed = {str(self.batch), str(self.plain_batch), str(self.mirror)}
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

    def ready_to_launch(self):
        processes = running()
        if any(not name.startswith("bakkesmod") for name in processes):
            raise Problem("Rocket League or its launcher is still running. Wait for it to close before relaunching.")
        if processes:
            stop_idle_injectors(self.prefix)
        self.stopped()
        if not self.heroic.is_file() or not os.access(self.heroic, os.X_OK):
            raise Problem("Heroic is missing or not executable.")

    def launch(self, alt_exe):
        # Heroic owns authentication. Never capture or persist its launch output.
        # Heroic's protocol handler expects altExe as a raw path in the query.
        # Its legacy handler does not reliably decode percent-encoded paths.
        query = urllib.parse.urlencode({"appName": "Sugar", "runner": "legendary", "gui": "false"}) + "&altExe=" + str(alt_exe)
        result = subprocess.run([str(self.heroic), "--no-gui", "heroic://launch?" + query], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode:
            raise Problem("Heroic rejected the launch request. Open Heroic to check sign-in and game updates.")

    def play(self, online=False, unverified=False):
        self.ready_to_launch()
        if online:
            self.restore_underpass()
            launcher = self.game / "Binaries/Win64/Launcher.exe"
            if not launcher.is_file():
                raise Problem("Rocket League's official launcher is missing. Repair game files in Heroic.")
            self.record("launch-request", mode="online")
            self.launch(launcher)
            print("Online launch requested through Heroic.")
            return
        self.restore_underpass()
        report = self.repair()
        if not report["known_working"] and report["compatibility"] != "supported by official updater" and not unverified:
            raise Problem(f"{report['compatibility']}. Run rocket-league doctor. To deliberately test offline: rocket-league play --try-unverified")
        atomic(self.state / "last-launch.json", encoded({"time": now(), "versions": report["versions"]}))
        self.record("launch-request", mode="offline")
        self.launch(self.batch)
        print("Launch requested. After verifying BakkesMod works in offline practice, use Mark Working.")

    def legendary(self):
        """Heroic's bundled legendary, run against Heroic's own config so both agree on the install."""
        configured = None
        with contextlib.suppress(Problem):
            configured = read_json(self.heroic_config / "config.json").get("defaultSettings", {}).get("altLegendaryBin")
        for candidate in (os.environ.get("LEGENDARY_BIN"), configured, self.heroic.resolve().parent / "resources/app.asar.unpacked/build/bin/x64/linux/legendary", shutil.which("legendary")):
            if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
                return [str(candidate)], dict(os.environ, LEGENDARY_CONFIG_PATH=str(self.manifest.parent))
        raise Problem("Heroic's legendary helper is missing. Update Rocket League from Heroic.")

    def latest_game_version(self):
        try:
            command, env = self.legendary()
            result = subprocess.run(command + ["info", "Sugar", "--json"], capture_output=True, text=True, env=env, timeout=120)
            version = json.loads(result.stdout)["game"]["version"] if result.returncode == 0 else None
        except (Problem, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
            return None
        return version if isinstance(version, str) and version.strip() else None

    def update_game(self, target):
        command, env = self.legendary()
        previous = self.version
        notice = notify("Updating Rocket League", "BakkesMod supports the new patch; installing it before launch")
        # Legendary's log carries only progress; read it live and never store it.
        process = subprocess.Popen(command + ["-y", "update", "Sugar"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=env)
        shown = 0.0
        for line in process.stderr:
            match = LEGENDARY_PROGRESS.search(line)
            if match and time.monotonic() - shown >= 3:
                shown = time.monotonic()
                notice = notify("Updating Rocket League", f"{float(match[1]):.0f}% · {match[2]} remaining", notice)
        if process.wait():
            raise Problem("The Rocket League update failed. Open Heroic to check sign-in and free disk space.")
        self.installed()
        if self.version != target:
            raise Problem(f"Rocket League updated to {self.version}, not the BakkesMod-supported {target}.")
        self.record("game-update", previous=previous, version=self.version)
        notify("Rocket League updated", self.version, notice)

    def update_bakkesmod(self, trainer):
        previous = small_text(self.mod / "version.txt")
        notice = notify("Updating BakkesMod", f"{previous} → {trainer}")
        request = urllib.request.Request(BAKKESMOD_ZIP, headers={"User-Agent": "RocketLeagueManager/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read(100_000_001)
        if len(payload) > 100_000_000:
            raise Problem("The BakkesMod download is unexpectedly large.")
        try:
            archive = zipfile.ZipFile(io.BytesIO(payload))
        except zipfile.BadZipFile:
            raise Problem("The BakkesMod download is not a valid archive.") from None
        members = [info for info in archive.infolist() if not info.is_dir()]
        for info in members:
            parts = Path(info.filename).parts
            if info.filename.startswith("/") or "\\" in info.filename or ".." in parts or not parts:
                raise Problem("The BakkesMod download contains an unsafe path.")
        if archive.read("version.txt").decode().strip() != trainer:
            raise Problem(f"BakkesMod's GitHub release is not {trainer} yet. Try again shortly.")
        backup = self.state / "bakkesmod-backups" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        replaced = 0
        for info in members:
            target = self.mod / info.filename
            if preserved(info.filename) and target.exists():
                continue
            if target.is_symlink():
                raise Problem(f"Refusing to replace a symlink: {target}")
            if target.is_file():
                atomic(backup / info.filename, target.read_bytes())
            atomic(target, archive.read(info))
            target.chmod(0o644)
            replaced += 1
        # Keep the two most recent backups; they are copies of mod files, not game builds.
        for old in sorted((self.state / "bakkesmod-backups").glob("*"))[:-2]:
            shutil.rmtree(old, ignore_errors=True)
        self.record("bakkesmod-update", previous=previous, version=trainer, files=replaced, backup=str(backup))
        notify("BakkesMod updated", trainer, notice)

    def prepare_offline(self):
        """Bring the game and BakkesMod to a supported pairing; return the workshop mode to use."""
        processes = running()
        if processes:
            stop_idle_injectors(self.prefix)
        self.stopped()
        release, _ = self.release(refresh=True)
        if release and self.version not in release["builds"]:
            latest = self.latest_game_version()
            if latest and latest != self.version and latest in release["builds"]:
                try:
                    self.update_game(latest)
                except (Problem, OSError) as error:
                    notify("Rocket League update failed", str(error))
        if release and self.version in release["builds"] and small_text(self.mod / "version.txt") != release["trainer"]:
            try:
                self.update_bakkesmod(release["trainer"])
            except (Problem, OSError, ValueError, KeyError, urllib.error.URLError) as error:
                notify("BakkesMod update failed", str(error))
        supported = release is not None and self.version in release["builds"] and small_text(self.mod / "version.txt") == release["trainer"]
        if supported or self.known(self.snapshot())[0]:
            return "bakkesmod"
        notify("BakkesMod isn't ready for this patch yet", "Loading the map through Underpass instead. In game choose Free Play → Underpass.")
        self.record("workshop-fallback", version=self.version)
        return "underpass"

    def restore_underpass(self):
        """Put the real Underpass back if a workshop map still occupies it."""
        pointer = self.state / "underpass.json"
        if not pointer.exists():
            return False
        if game_active():
            raise Problem("Rocket League is still using the Underpass workshop map. Close it first.")
        swap = read_json(pointer)
        original = self.state / "underpass" / UNDERPASS
        # A game update or file verification may have replaced the map already; keep that newer file.
        if digest(self.underpass) == swap.get("map") and digest(original) == swap.get("original"):
            atomic_copy(original, self.underpass)
        original.unlink(missing_ok=True)
        pointer.unlink()
        self.record("underpass-restore")
        return True

    def play_underpass(self, map_path):
        source = Path(map_path)
        if not source.is_file() or source.suffix.lower() not in (".udk", ".upk"):
            raise Problem("The selected workshop map file is missing.")
        self.ready_to_launch()
        self.restore_underpass()
        if not self.underpass.is_file():
            raise Problem("Rocket League's Underpass map is missing. Verify the game files in Heroic.")
        report = self.repair()
        if report["errors"]:
            raise Problem("\n".join(report["errors"]))
        original = self.state / "underpass" / UNDERPASS
        atomic_copy(self.underpass, original)
        atomic(self.state / "underpass.json", encoded({"time": now(), "original": digest(original), "map": digest(source)}))
        atomic_copy(source, self.underpass)
        self.record("underpass-swap", version=self.version)
        # Restore after the session even if Heroic keeps this process waiting or never returns.
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "restore-underpass", "--after-game"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            self.launch(self.plain_batch)
        except Problem:
            self.restore_underpass()
            raise
        print("Launch requested. Choose Free Play → Underpass to play the workshop map.")

    def restore_after_game(self, appear=600, poll=5, give_up=86400):
        deadline = time.monotonic() + appear
        while time.monotonic() < deadline and not game_active():
            time.sleep(poll)
        deadline = time.monotonic() + give_up
        while time.monotonic() < deadline:
            if not game_active():
                try:
                    with self.lock():
                        return self.restore_underpass()
                except Problem:
                    pass
            time.sleep(poll)
        return False

    def workshop(self):
        processes = running()
        if any(name.startswith("rocketleague_ea") for name in processes):
            raise Problem("Close online Rocket League before opening workshop maps.")
        if any(name.startswith("rocketleague") for name in processes):
            if (self.state / "underpass.json").exists():
                raise Problem("Rocket League is running with an Underpass workshop map. Close it, then choose the next map.")
            mode = "bakkesmod"
        else:
            with self.lock():
                self.restore_underpass()
                mode = self.prepare_offline()
        loaded = self.state / "map-loaded"
        loaded.unlink(missing_ok=True)
        env = dict(os.environ, ROCKET_LEAGUE_DIR=str(self.game), ROCKET_LEAGUE_PREFIX=str(self.prefix), BAKKESMOD_DIR=str(self.mod), ROCKET_LEAGUE_WORKSHOP_MODE=mode, ROCKET_LEAGUE_MAP_LOADED=str(loaded))
        status = subprocess.call(["bash", str(self.data / "workshop-maps.sh")], env=env)
        if status == 0 and loaded.exists():
            loaded.unlink()
            # A map loaded over RCON proves this exact pairing injects; remember it.
            with contextlib.suppress(Problem), self.lock():
                self.mark(True)
        return status

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
    sub.add_parser("workshop", help="Open workshop maps, updating the game and BakkesMod as needed")
    underpass = sub.add_parser("underpass", help="Launch offline without BakkesMod with a workshop map in place of Underpass")
    underpass.add_argument("map")
    restore = sub.add_parser("restore-underpass", help="Put the original Underpass map back")
    restore.add_argument("--after-game", action="store_true", help="Wait for the current Rocket League session to end first")
    args = parser.parse_args()
    manager = Manager(online=args.command == "play" and args.online)
    if args.command == "workshop":
        return manager.workshop()
    if args.command == "restore-underpass" and args.after_game:
        manager.restore_after_game()
        return 0
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
        elif args.command == "underpass":
            manager.play_underpass(args.map)
        elif args.command == "restore-underpass":
            print("Restored the original Underpass map." if manager.restore_underpass() else "Underpass is already original.")
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
