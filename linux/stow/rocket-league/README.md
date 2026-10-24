# Rocket League on Omarchy

Use your existing **Rocket League** launcher for normal online play and your existing `rocket-league-bakkesmod` launcher for offline BakkesMod play. There is no manager menu.

Both launch paths go through the manager's quiet preflight. Heroic owns Rocket League updates; the normal launcher opens Heroic, which checks the game before launch. The BakkesMod path refreshes the version metadata and checks official compatibility before starting the existing offline launcher. The offline helper sets a 15-second injection delay so Rocket League can initialize under Proton before BakkesMod attaches. The BakkesMod injector may show its own confirmation dialog when it has an update.

## Commands

| Command | Behavior |
| --- | --- |
| `rocket-league doctor` | Refresh official compatibility metadata; report versions, changes, missing files and repairs. |
| `rocket-league doctor --offline` | Inspect using a compatibility cache no older than six hours; never access the network. |
| `rocket-league doctor --json` | Machine-readable report. Exit 0 means files ready and upstream-supported or user-confirmed; 1 means local repair/error; 2 means compatibility unverified. |
| `rocket-league repair` | Back up and atomically repair the launch helper and minimal Legendary version metadata. Close Rocket League and BakkesMod first. |
| `rocket-league` | Launch normally online through Heroic. |
| `rocket-league play` | Repair, check compatibility and request offline BakkesMod launch through Heroic. |
| `rocket-league play --online` | Request launch through the official game launcher, without the BakkesMod helper. |
| `rocket-league play --try-unverified` | Explicitly test offline when the pairing cannot be verified. Leaves injector safe mode unchanged. |
| `rocket-league workshop` | Open existing workshop maps with paths discovered from Heroic. |
| `rocket-league mark-working --confirmed` | After personally testing BakkesMod, record the versions/hashes from that launch. |
| `rocket-league undo-repair` | Restore only the last integration repair, refusing to overwrite subsequent edits. |

The existing Rocket League desktop entry launches through `rocket-league play --online`. The existing `rocket-league-bakkesmod` and `rocket-league-workshop-maps` commands route through the preflight and repair logic. The separate manager desktop entry is hidden.

## After an update

1. Launch Rocket League normally online to let Heroic check and apply its game update.
2. Launch offline with BakkesMod. The wrapper repairs the game-version metadata and checks the current supported build list before launch.
3. If the injector reports an update, accept its official update prompt and launch offline again if the game started before the update completed.
4. Run `rocket-league mark-working --confirmed` after verifying BakkesMod in offline practice.

Official support means the updater lists this game build and installed mod/injector versions. It does not prove Wine injection succeeds. A confirmed record includes the game and mod hashes and selected runner identity; changing any tracked component invalidates that record. An older confirmed pairing can remain usable even after the current upstream support list moves on.

Compatibility source: https://updater.bakkesmod.com/updater/0 . Read `gameinfo.egsbuildids`, `update_info.trainer_version`, and **`injector.newinjectorversion`** (not the legacy injectorversion field). Network failures produce an unknown result, never an invented compatible result. No downloads occur during `doctor` other than this public metadata request.

## State and limits

State lives in `$XDG_STATE_HOME/rocket-league` (default `~/.local/state/rocket-league`):

- `release.json`: selected public compatibility fields and check time.
- `working.json`, `last-launch.json`: local version/hash records, no Epic credentials.
- `repairs/`: copies of the two managed integration files before repair.
- `history.jsonl`: actions, timestamps and backup paths; no Heroic launch output.

**Working records and repair backups do not preserve or roll back game builds, Proton, the Wine prefix, plugins or mod binaries.** Heroic owns game downloads, and the BakkesMod injector owns its update prompts; this wrapper does not replace their update mechanisms. Updating Heroic itself remains part of the normal Omarchy/system package update. Preserve a complete known-working offline installation separately before replacing its binaries. This package neither creates nor restores full installation snapshots.

Heroic paths come from its Sugar game settings and installed manifest under `$XDG_CONFIG_HOME/heroic`. BakkesMod's Windows user directory is discovered; Wine user symlink aliases are deduplicated. Explicit `ROCKET_LEAGUE_DIR` or `ROCKET_LEAGUE_PREFIX` overrides must match Heroic. The workshop implementation receives those discovered paths. If the game launcher rejects a request, it cancels the map-control wait and reports failure immediately. When launching a stopped game, the wrapper automatically terminates a leftover BakkesMod tray process from this Wine prefix and waits up to five seconds for it to exit. It verifies the process owner and mapped injector executable, leaves other or unverifiable processes untouched, and refuses cleanup while a game or launcher is running. If the injector does not exit, quit its tray app manually and retry. Let any BakkesMod update finish before relaunching. `HEROIC_BIN` overrides executable discovery when needed.

Repairs and launches use a shared nonblocking lock. Repairs refuse while Rocket League, its launcher, or BakkesMod runs. Doctor only reads process names and lifecycle state (exited processes do not block launches). Launch cleanup additionally checks ownership and executable mappings; neither reads process command lines or environments. The normal launcher and online mode still rely on your Heroic settings; do not add `-noeac` to Heroic's global/game launch arguments when you want online play.

## Installation and checks

The package is managed alongside the other `linux/stow` packages. Its Rocket League desktop entry runs the normal launcher through the preflight wrapper.

```sh
stow --no-folding -d linux/stow -t "$HOME" rocket-league
omarchy menu refresh
python3 -m unittest discover -s linux/stow/rocket-league/tests -v
```

Dependencies: Python 3.11+, Heroic, gum and the existing Omarchy installation. Workshop maps retain their existing jq, curl, bsdtar and Deno dependencies. Tests use isolated temporary fixtures and fake launches, never the real game.
