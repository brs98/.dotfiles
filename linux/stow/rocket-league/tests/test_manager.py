import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.parse

SOURCE = Path(__file__).resolve().parents[1] / '.local/share/rocket-league/manager.py'
spec = importlib.util.spec_from_file_location('manager', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.game = root / 'Game with spaces & symbols'
        self.prefix = root / 'Prefix'
        self.data = root / 'data'
        self.state = root / 'state'
        self.config = root / 'config'
        self.runner = root / 'proton/latest/proton'
        self.heroic = root / 'heroic'
        self.user = self.prefix / 'drive_c/users/test-user'
        self.mod = self.user / 'AppData/Roaming/bakkesmod/bakkesmod'
        self.write(self.heroic, '#!/bin/sh\nexit 0\n')
        self.heroic.chmod(0o755)
        self.write(self.runner, '#!/bin/sh\n')
        self.runner.chmod(0o755)
        self.write(self.runner.parent / 'version', 'runner-v1')
        for relative in ('Binaries/Win64/RocketLeague.exe', 'Binaries/Win64/Launcher.exe'):
            self.write(self.game / relative, 'game-binary')
        self.write(self.prefix / 'drive_c/Program Files/BakkesMod/BakkesMod.exe', 'injector')
        self.write(self.mod / 'version.txt', '228')
        self.write(self.mod / 'injectorversion.txt', '32')
        self.write(self.mod / 'dll/bakkesmod.dll', 'mod-dll')
        self.write(self.data / 'rocket-league/run_with_bakkesmod.bat', '@echo off\nLauncher.exe -noeac\n')
        self.manifest = self.config / 'heroic/legendaryConfig/legendary/installed.json'
        self.write(self.manifest, json.dumps({'Sugar': {'version': 'game-v1', 'install_path': str(self.game), 'unrelated': 'DO_NOT_COPY'}}))
        self.write(self.config / 'heroic/GamesConfig/Sugar.json', json.dumps({'Sugar': {'winePrefix': str(self.prefix), 'wineVersion': {'bin': str(self.runner), 'name': 'latest'}, 'enviromentOptions': [{'value': 'DO_NOT_COPY'}]}}))
        env = {'XDG_CONFIG_HOME': str(self.config), 'XDG_DATA_HOME': str(self.data), 'XDG_STATE_HOME': str(self.state), 'HEROIC_BIN': str(self.heroic)}
        self.env = patch.dict(os.environ, env)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.running = patch.object(m, 'running', return_value=[])
        self.running.start()
        self.addCleanup(self.running.stop)
        self.release = patch.object(m.Manager, 'release', return_value=({'builds': ['game-v1'], 'trainer': '228', 'injector': '32'}, 'live'))
        self.release.start()
        self.addCleanup(self.release.stop)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)
        self.manager = m.Manager()

    @staticmethod
    def write(path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_repair_is_idempotent_and_copies_only_version(self):
        self.manager.repair()
        self.assertEqual(json.loads(self.manager.mirror.read_text()), {'Sugar': {'version': 'game-v1'}})
        pointer = (self.manager.state / 'last-repair.json').read_bytes()
        self.manager.repair()
        self.assertEqual(pointer, (self.manager.state / 'last-repair.json').read_bytes())
        for path in self.manager.state.rglob('*'):
            if path.is_file():
                self.assertNotIn(b'DO_NOT_COPY', path.read_bytes())

    def test_undo_restores_old_files_and_deletes_new_files(self):
        self.write(self.manager.batch, 'old helper')
        self.manager.batch.chmod(0o640)
        self.manager.repair()
        self.manager.undo()
        self.assertEqual(self.manager.batch.read_text(), 'old helper')
        self.assertEqual(self.manager.batch.stat().st_mode & 0o777, 0o640)
        self.assertFalse(self.manager.mirror.exists())

    def test_undo_refuses_later_edits(self):
        self.manager.repair()
        self.manager.batch.write_text('user edited')
        with self.assertRaises(m.Problem):
            self.manager.undo()
        self.assertEqual(self.manager.batch.read_text(), 'user edited')

    def test_failure_during_repair_rolls_back(self):
        self.write(self.manager.batch, 'old helper')
        real_atomic = m.atomic
        def fail_mirror(path, content):
            if path == self.manager.mirror:
                raise OSError('simulated write failure')
            real_atomic(path, content)
        with patch.object(m, 'atomic', side_effect=fail_mirror):
            with self.assertRaises(OSError):
                self.manager.repair()
        self.assertEqual(self.manager.batch.read_text(), 'old helper')
        self.assertFalse(self.manager.mirror.exists())

    def test_invalid_version_does_not_modify_helper(self):
        self.write(self.manager.batch, 'old helper')
        value = json.loads(self.manifest.read_text())
        value['Sugar']['version'] = None
        self.manifest.write_text(json.dumps(value))
        with self.assertRaises(m.Problem):
            m.Manager().repair()
        self.assertEqual(self.manager.batch.read_text(), 'old helper')

    def test_running_game_blocks_repair(self):
        with patch.object(m, 'running', return_value=['rocketleague.ex']):
            with self.assertRaises(m.Problem):
                self.manager.repair()
        self.assertFalse(self.manager.batch.exists())

    def test_lock_rejects_concurrent_operations(self):
        with self.manager.lock():
            with self.assertRaises(m.Problem):
                with m.Manager().lock():
                    self.fail('second lock acquired')

    def test_workshop_passes_discovered_paths(self):
        with patch.object(m.subprocess, 'call', return_value=0) as call:
            self.manager.workshop()
        env = call.call_args.kwargs['env']
        self.assertEqual(env['ROCKET_LEAGUE_DIR'], str(self.game))
        self.assertEqual(env['ROCKET_LEAGUE_PREFIX'], str(self.prefix))
        self.assertEqual(env['BAKKESMOD_DIR'], str(self.mod))

    def test_workshop_refuses_online_game_before_starting_script(self):
        with patch.object(m, 'running', return_value=['rocketleague_ea']):
            with patch.object(m.subprocess, 'call') as call:
                with self.assertRaises(m.Problem):
                    self.manager.workshop()
        call.assert_not_called()

    def test_wine_user_alias_is_not_a_duplicate_install(self):
        (self.user.parent / 'other-user').symlink_to(self.user, target_is_directory=True)
        manager = m.Manager()
        self.assertEqual(manager.mod, self.mod)

    def test_path_override_mismatch_is_rejected(self):
        with patch.dict(os.environ, {'ROCKET_LEAGUE_DIR': '/another/game'}):
            with self.assertRaises(m.Problem):
                m.Manager()

    def test_symlink_target_is_not_overwritten(self):
        target = self.game / 'user-file'
        self.write(target, 'preserve me')
        self.manager.batch.symlink_to(target)
        with self.assertRaises(m.Problem):
            self.manager.repair()
        self.assertEqual(target.read_text(), 'preserve me')

    def test_updater_compatibility_and_changed_mod(self):
        report = self.manager.inspect()
        self.assertEqual(report['compatibility'], 'supported by official updater')
        self.write(self.mod / 'version.txt', '227')
        self.assertEqual(self.manager.inspect()['compatibility'], 'BakkesMod update needed')
        self.manager.version = 'game-v2'
        self.assertEqual(self.manager.inspect()['compatibility'], 'not listed by current BakkesMod release')

    def test_unverified_launch_requires_explicit_override(self):
        with patch.object(m.Manager, 'release', return_value=(None, 'unavailable')):
            with self.assertRaises(m.Problem):
                self.manager.play()
        self.assertFalse((self.manager.state / 'last-launch.json').exists())

    def test_launch_uses_heroic_raw_path_and_confirmation_detects_changes(self):
        real_run = m.subprocess.run
        captured = []
        def run(args, **kwargs):
            if args[0] == str(self.heroic):
                captured.append(args)
            return real_run(args, **kwargs)
        with patch.object(m.subprocess, 'run', side_effect=run):
            self.manager.play()
        self.assertEqual(captured[0][2].split('&altExe=', 1)[1], str(self.manager.batch))
        with self.assertRaises(m.Problem):
            self.manager.mark(False)
        self.manager.mark(True)
        self.assertTrue(self.manager.inspect()['known_working'])
        self.write(self.mod / 'dll/bakkesmod.dll', 'updated mod')
        report = self.manager.inspect()
        self.assertFalse(report['known_working'])
        self.assertIn('BakkesMod DLL', report['changes'])
        with self.assertRaises(m.Problem):
            self.manager.mark(True)

    def test_online_launch_does_not_repair_or_inject(self):
        with patch.object(m.subprocess, 'run', return_value=m.subprocess.CompletedProcess([], 0)) as run:
            self.manager.play(online=True)
        args = run.call_args.args[0]
        self.assertEqual(args[2].split('&altExe=', 1)[1], str(self.game / 'Binaries/Win64/Launcher.exe'))
        self.assertFalse(self.manager.batch.exists())

    def test_relaunch_closes_leftover_injector_before_online_or_offline_launch(self):
        for online in (True, False):
            with self.subTest(online=online):
                manager = m.Manager(online=online)
                with patch.object(m, 'running', return_value=['bakkesmod.exe']) as running:
                    with patch.object(m, 'stop_idle_injectors', side_effect=lambda _: setattr(running, 'return_value', [])) as stop:
                        with patch.object(m.subprocess, 'run', return_value=m.subprocess.CompletedProcess([], 0, stdout='')) as launch:
                            manager.play(online=online)
                stop.assert_called_once_with(self.prefix)
                self.assertTrue(launch.called)

    def test_active_game_or_launcher_never_triggers_cleanup(self):
        for name in ('rocketleague.ex', 'rocketleague_ea', 'launcher.exe'):
            with patch.object(m, 'running', return_value=[name, 'bakkesmod.exe']):
                with patch.object(m, 'stop_idle_injectors') as stop:
                    with self.assertRaises(m.Problem):
                        self.manager.play(online=True)
                stop.assert_not_called()

    def test_leftover_injector_still_blocks_explicit_repair(self):
        with patch.object(m, 'running', return_value=['bakkesmod.exe']):
            with self.assertRaises(m.Problem):
                self.manager.repair()
        self.assertFalse(self.manager.batch.exists())

    def injector_process(self, mapped_path=None):
        proc = Path(self.temp.name) / 'proc/12345'
        self.write(proc / 'comm', 'BakkesMod.exe\n')
        self.write(proc / 'maps', '1000-2000 r-xp 00000000 00:00 1 ' + str(mapped_path or self.manager.injector) + '\n')
        return proc

    def test_cleanup_targets_only_verified_injector_and_waits(self):
        proc = self.injector_process()
        with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
            with patch.object(m.os, 'pidfd_open', return_value=99), patch.object(m.os, 'close') as close:
                with patch.object(m.signal, 'pidfd_send_signal') as stop, patch.object(m.select, 'select', return_value=([99], [], [])) as wait:
                    m.stop_idle_injectors(self.prefix)
        stop.assert_called_once_with(99, m.signal.SIGTERM)
        wait.assert_called_once_with([99], [], [], 5)
        close.assert_called_once_with(99)

    def test_cleanup_leaves_other_prefix_untouched(self):
        proc = self.injector_process(Path('/other-prefix/BakkesMod.exe'))
        with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
            with patch.object(m.os, 'pidfd_open', return_value=99), patch.object(m.os, 'close'):
                with patch.object(m.signal, 'pidfd_send_signal') as stop:
                    m.stop_idle_injectors(self.prefix)
        stop.assert_not_called()

    def test_unverified_injector_blocks_launch_without_being_stopped(self):
        proc = self.injector_process(Path('/other-prefix/BakkesMod.exe'))
        with patch.object(m, 'running', return_value=['bakkesmod.exe']):
            with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
                with patch.object(m.os, 'pidfd_open', return_value=99), patch.object(m.os, 'close'):
                    with patch.object(m.signal, 'pidfd_send_signal') as stop, patch.object(m.subprocess, 'run') as launch:
                        with self.assertRaises(m.Problem):
                            self.manager.play(online=True)
        stop.assert_not_called()
        launch.assert_not_called()

    def test_cleanup_leaves_other_users_injector_untouched(self):
        proc = self.injector_process()
        with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
            with patch.object(m.os, 'pidfd_open', return_value=99), patch.object(m.os, 'close'):
                with patch.object(m.os, 'getuid', return_value=-1), patch.object(m.signal, 'pidfd_send_signal') as stop:
                    m.stop_idle_injectors(self.prefix)
        stop.assert_not_called()

    def test_cleanup_rechecks_game_before_signaling(self):
        proc = self.injector_process()
        with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
            with patch.object(m.os, 'pidfd_open', return_value=99), patch.object(m.os, 'close'):
                with patch.object(m, 'running', return_value=['rocketleague.ex']):
                    with patch.object(m.signal, 'pidfd_send_signal') as stop:
                        with self.assertRaises(m.Problem):
                            m.stop_idle_injectors(self.prefix)
        stop.assert_not_called()

    def test_cleanup_timeout_does_not_force_kill(self):
        proc = self.injector_process()
        with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
            with patch.object(m.os, 'pidfd_open', return_value=99), patch.object(m.os, 'close'):
                with patch.object(m.signal, 'pidfd_send_signal') as stop, patch.object(m.select, 'select', return_value=([], [], [])):
                    with self.assertRaisesRegex(m.Problem, 'tray'):
                        m.stop_idle_injectors(self.prefix)
        stop.assert_called_once_with(99, m.signal.SIGTERM)

    def test_online_works_with_no_bakkesmod_install(self):
        import shutil
        shutil.rmtree(self.mod)
        manager = m.Manager(online=True)
        with patch.object(m.subprocess, 'run', return_value=m.subprocess.CompletedProcess([], 0)):
            manager.play(online=True)

    def test_malformed_cache_is_not_used_offline(self):
        self.release.stop()
        self.write(self.manager.state / 'release.json', json.dumps({'checked': m.now(), 'builds': None}))
        with patch.object(m.urllib.request, 'urlopen') as fetch:
            release, source = self.manager.release(offline=True)
        fetch.assert_not_called()
        self.assertIsNone(release)

    def test_undo_failure_restores_repaired_state_for_retry(self):
        self.write(self.manager.batch, 'old helper')
        self.write(self.manager.mirror, '{}')
        self.manager.repair()
        repaired = self.manager.batch.read_bytes()
        real_restore = self.manager.restore_entry
        def fail_second(backup, index, entry):
            if index == 1:
                raise OSError('simulated restore failure')
            real_restore(backup, index, entry)
        with patch.object(self.manager, 'restore_entry', side_effect=fail_second):
            with self.assertRaises(OSError):
                self.manager.undo()
        self.assertEqual(self.manager.batch.read_bytes(), repaired)
        self.manager.undo()
        self.assertEqual(self.manager.batch.read_text(), 'old helper')

    def test_live_metadata_only_caches_allowlisted_fields(self):
        self.release.stop()
        raw = {'gameinfo': {'egsbuildids': 'game-v1,game-v2'}, 'update_info': {'trainer_version': 228, 'download_url': 'untrusted'}, 'injector': {'newinjectorversion': '32'}}
        response = contextlib.nullcontext(io.BytesIO(json.dumps(raw).encode()))
        with patch.object(m.urllib.request, 'urlopen', return_value=response):
            release, source = self.manager.release(refresh=True)
        self.assertEqual(source, 'live')
        self.assertEqual(release['builds'], ['game-v1', 'game-v2'])
        self.assertNotIn('untrusted', (self.manager.state / 'release.json').read_text())

    def test_offline_never_fetches_and_expired_cache_is_not_trusted(self):
        self.release.stop()
        self.write(self.manager.state / 'release.json', json.dumps({'checked': '2000-01-01T00:00:00+00:00', 'builds': ['game-v1'], 'trainer': '228', 'injector': '32'}))
        with patch.object(m.urllib.request, 'urlopen') as fetch:
            release, source = self.manager.release(offline=True)
        fetch.assert_not_called()
        self.assertIsNone(release)


class ProcessTests(unittest.TestCase):
    def test_exited_unreaped_injector_does_not_block_launch(self):
        # Keep a real child unreaped so its /proc/comm still exists after exit.
        child = m.subprocess.Popen([m.sys.executable, '-c',
            'import ctypes; ctypes.CDLL(None).prctl(15, b"BakkesMod.exe", 0, 0, 0)'])
        try:
            os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOWAIT)
            comm = Path('/proc') / str(child.pid) / 'comm'
            self.assertEqual(comm.read_text().strip(), 'BakkesMod.exe')
            with patch.object(m.Path, 'glob', return_value=[comm]):
                self.assertEqual(m.running(), [])
        finally:
            child.wait()

    def test_live_game_and_injector_still_block(self):
        with tempfile.TemporaryDirectory() as temp:
            proc = Path(temp)
            for name in ('RocketLeague.exe', 'RocketLeague_EA', 'Launcher.exe', 'BakkesMod.exe'):
                (proc / 'comm').write_text(name + '\n')
                (proc / 'stat').write_text('123 (' + name + ') S 1 2 3\n')
                with patch.object(m.Path, 'glob', return_value=[proc / 'comm']):
                    self.assertEqual(m.running(), [name.lower()])


if __name__ == '__main__':
    unittest.main()
