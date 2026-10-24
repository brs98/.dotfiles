"""Exercise workshop launch coordination without starting games or reading user data."""
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1] / '.local/share/rocket-league/workshop-maps.sh'
TEXTURES = (
    'EditorLandscapeResources EditorMaterials EditorMeshes EditorResources '
    'EngineDebugMaterials EngineMaterials EngineResources MapTemplateIndex '
    'MapTemplates NodeBuddies Engine_MI_Shaders EngineVolumetrics EngineBuildings mods'
).split()


class WorkshopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        data = self.root / 'data/rocket-league'
        maps = self.root / 'maps'
        game = self.root / 'game'
        mod = self.root / 'mod'
        for path in (self.bin, data, maps, game / 'TAGame/CookedPCConsole', mod / 'cfg', mod / 'data'):
            path.mkdir(parents=True)
        (data / 'rings-maps.tsv').touch()
        (data / 'bakkes-rcon.js').touch()
        (maps / 'TestMap.udk').touch()
        (mod / 'cfg/config.cfg').touch()
        (mod / 'data/rcon_commands.cfg').write_text('load_workshop\n')
        for name in TEXTURES:
            (game / f'TAGame/CookedPCConsole/{name}.upk').touch()
        (game / 'TAGame/CookedPCConsole/.omarchy-workshop-textures-v1').touch()
        self.command('pgrep', 'exit 1')
        self.command('notify-send', 'exit 0')
        self.command('omarchy-menu-select', "IFS= read -r selection; printf '%s\\n' \"${selection#*$'\\t'}\"")
        for name in ('curl', 'bsdtar', 'jq'):
            self.command(name, 'exit 99')
        self.env = dict(os.environ, PATH=f'{self.bin}:/usr/bin:/bin',
                        HOME=str(self.root), XDG_DATA_HOME=str(data.parent),
                        ROCKET_LEAGUE_MAPS_DIR=str(maps), ROCKET_LEAGUE_DIR=str(game),
                        BAKKESMOD_DIR=str(mod), ROCKET_LEAGUE_BAKKES_LAUNCHER=str(self.bin / 'launcher'))

    def command(self, name, script):
        path = self.bin / name
        path.write_text('#!/usr/bin/env bash\n' + script + '\n')
        path.chmod(0o755)

    def run_workshop(self):
        process = subprocess.Popen(['bash', str(SOURCE)], env=self.env,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, start_new_session=True)
        try:
            stdout, stderr = process.communicate(timeout=3)
            return process.returncode, stdout, stderr
        except subprocess.TimeoutExpired:
            self.fail('Workshop script waited for RCON despite launcher completion/rejection')
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate()

    def test_rejected_launch_cancels_rcon_promptly(self):
        self.command('launcher', 'echo "Close BakkesMod before retrying" >&2; exit 7')
        self.command('deno', 'exec sleep 180')
        status, _, error = self.run_workshop()
        self.assertNotEqual(status, 0)
        self.assertIn('Close BakkesMod before retrying', error)
        self.assertIn('Rocket League launch failed', error)

    def test_launch_rejection_after_rcon_started_also_cancels_promptly(self):
        self.command('launcher', 'sleep 0.3; exit 7')
        self.command('deno', 'exec sleep 180')
        status, _, error = self.run_workshop()
        self.assertNotEqual(status, 0)
        self.assertIn('Rocket League launch failed', error)

    def test_accepted_launch_still_waits_for_rcon(self):
        self.command('launcher', 'exit 0')
        self.command('deno', 'sleep 0.3; echo map-loaded')
        status, output, _ = self.run_workshop()
        self.assertEqual(status, 0)
        self.assertIn('map-loaded', output)

    def test_rcon_success_does_not_wait_for_heroic_to_exit(self):
        self.command('launcher', 'exec sleep 180 >/dev/null 2>&1')
        self.command('deno', 'sleep 0.3; echo map-loaded')
        status, output, _ = self.run_workshop()
        self.assertEqual(status, 0)
        self.assertIn('map-loaded', output)

    def test_rcon_failure_is_reported(self):
        self.command('launcher', 'exit 0')
        self.command('deno', 'sleep 0.3; exit 2')
        status, _, error = self.run_workshop()
        self.assertNotEqual(status, 0)
        self.assertIn('Could not send the map to BakkesMod', error)

    def test_rcon_success_signals_map_loaded(self):
        marker = self.root / 'loaded'
        self.env['ROCKET_LEAGUE_MAP_LOADED'] = str(marker)
        self.command('launcher', 'exit 0')
        self.command('deno', 'exit 0')
        status, _, _ = self.run_workshop()
        self.assertEqual(status, 0)
        self.assertTrue(marker.exists())

    def test_underpass_mode_hands_map_to_manager_without_bakkesmod(self):
        record = self.root / 'underpass-args'
        self.env.update(ROCKET_LEAGUE_WORKSHOP_MODE='underpass', ROCKET_LEAGUE_UNDERPASS_LAUNCHER=str(self.bin / 'rl'),
                        ROCKET_LEAGUE_MAP_LOADED=str(self.root / 'loaded'), BAKKESMOD_DIR=str(self.root / 'missing'))
        self.command('rl', f'printf "%s\\n" "$@" > {record}')
        self.command('launcher', 'exit 99')
        self.command('deno', 'exit 99')
        status, _, error = self.run_workshop()
        self.assertEqual(status, 0, error)
        self.assertEqual(record.read_text().split('\n')[:2], ['underpass', str(self.root / 'maps/TestMap.udk')])
        self.assertFalse((self.root / 'loaded').exists())

    def test_underpass_mode_refuses_while_game_runs(self):
        self.env.update(ROCKET_LEAGUE_WORKSHOP_MODE='underpass', ROCKET_LEAGUE_UNDERPASS_LAUNCHER=str(self.bin / 'rl'))
        self.command('rl', 'exit 0')
        self.command('pgrep', "[[ $2 == 'RocketLeague\\.exe' ]]")
        status, _, error = self.run_workshop()
        self.assertNotEqual(status, 0)
        self.assertIn('Close Rocket League', error)


if __name__ == '__main__':
    unittest.main()
