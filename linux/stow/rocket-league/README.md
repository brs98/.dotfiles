# Rocket League on Omarchy

Use your existing **Rocket League** launcher for normal online play and your existing `rocket-league-bakkesmod` launcher for offline BakkesMod play. There is no manager menu.

Both launch paths go through the manager's quiet preflight. The normal launcher opens Heroic, which checks the game before launch. **RL - Workshop Maps** keeps itself launchable on its own; see *Workshop Maps updates itself* below. The BakkesMod path refreshes the version metadata and checks official compatibility before starting the existing offline launcher. The offline helper sets a 15-second injection delay so Rocket League can initialize under Proton before BakkesMod attaches. The BakkesMod injector may show its own confirmation dialog when it has an update.

## Commands

| Command | Behavior |
| --- | --- |
| `rocket-league doctor` | Refresh official compatibility metadata; report versions, changes, missing files and repairs. |
| `rocket-league doctor --offline` | Inspect using a compatibility cache no older than six hours; never access the network. |
| `rocket-league doctor --json` | Machine-readable report. Exit 0 means files ready and upstream-supported or user-confirmed; 1 means local repair/error; 2 means compatibility unverified. |
| `rocket-league repair` | Back up and atomically repair the launch helper and minimal Legendary version metadata. Close Rocket League and BakkesMod first. |
| `rocket-league` | Launch normally online through Heroic. |
| `rocket-league play` | Repair, check compatibility and request offline BakkesMod launch through Heroic. |
| `rocket-league play --online` | Request launch through the official game launcher, without the BakkesMod helper. Installs Epic's latest build first, with progress in the Omarchy OSD; a failed update blocks the launch, an unreachable check does not. |
| `rocket-league play --online --no-update` | Online launch without the update check (used by RL - Alt after updating through Main). |
| `rocket-league update` | Install Epic's latest build now, without launching. |
| `rocket-league play --try-unverified` | Explicitly test offline when the pairing cannot be verified. Leaves injector safe mode unchanged. |
| `rocket-league workshop` | Update the game and BakkesMod when needed, then open workshop maps (falls back to Underpass when BakkesMod lags a patch). |
| `rocket-league underpass <map>` | Launch offline without BakkesMod with `<map>` copied over Underpass; restored automatically after the session. |
| `rocket-league restore-underpass` | Put the original Underpass back now (`--after-game` waits for the running session to end). |
| `rocket-league mark-working --confirmed` | After personally testing BakkesMod, record the versions/hashes from that launch. |
| `rocket-league undo-repair` | Restore only the last integration repair, refusing to overwrite subsequent edits. |

The existing Rocket League desktop entry launches through `rocket-league play --online`. The existing `rocket-league-bakkesmod` and `rocket-league-workshop-maps` commands route through the preflight and repair logic. The separate manager desktop entry is hidden.

## Online launches update themselves

**RL - Main** and **RL - Alt** install Epic's latest build before launching, regardless of BakkesMod support. Progress appears in Omarchy's on-screen progress bar (`omarchy-shell osd`), falling back to updating notifications where the OSD is unavailable. Alt updates through Main's Heroic profile, which owns the shared install. If BakkesMod lags the new patch, Workshop Maps falls back to Underpass until it catches up.

## Workshop Maps updates itself

Opening **RL - Workshop Maps** with Rocket League closed runs these steps before the map menu:

1. Fetch the BakkesMod updater feed.
2. If BakkesMod supports a newer Epic build than the installed one, update the game with Heroic's bundled `legendary` (against Heroic's own config, so Heroic sees the new version). A notification shows progress. It never updates the game past the build BakkesMod supports, so an installed build BakkesMod still supports remains playable while BakkesMod catches up.
3. If BakkesMod itself is behind the feed, install the official `bakkesmod.zip` from BakkesMod's GitHub release (HTTPS; the feed's own link is plain HTTP). It refuses the archive if its `version.txt` does not match the feed or it contains unsafe paths. Existing `cfg/` files, `data/*.cfg` (RCON allowlist, cameras), `bakkesmod.log` and the injector's `injectorversion.txt` are kept; replaced files are backed up under `bakkesmod-backups/` (last two kept).
4. Launch with BakkesMod and load the map over RCON. A successful map load records the exact pairing as working, as `mark-working --confirmed` would.

If the game is already on a patch BakkesMod does not support yet (for example, an online launch installed it), or an update fails, the launcher falls back to **Underpass**: it copies the chosen map over `Labs_Underpass_P.upk`, launches offline with `-noeac` and without the injector, and tells you to choose **Free Play → Underpass**. The original file is kept in the state directory and restored when the session ends. Every online and offline launch through this manager also restores it first, and a game update or verify that already replaced the file is left alone. RL - Main/Alt (`rocket-league-account`) does not go through this manager; after an interrupted Underpass session (e.g. a reboot mid-game), run `rocket-league restore-underpass` before playing online.

The injector's own update prompt still appears when only the injector is out of date; that alone never blocks a launch.

Official support means the updater lists this game build and installed mod/injector versions. It does not prove Wine injection succeeds. A confirmed record includes the game and mod hashes and selected runner identity; changing any tracked component invalidates that record. An older confirmed pairing can remain usable even after the current upstream support list moves on.

Compatibility source: https://updater.bakkesmod.com/updater/0 . Read `gameinfo.egsbuildids`, `update_info.trainer_version`, and **`injector.newinjectorversion`** (not the legacy injectorversion field). Network failures produce an unknown result, never an invented compatible result; Workshop Maps then uses a confirmed working pairing if one matches, otherwise Underpass. No downloads occur during `doctor` other than this public metadata request; game and BakkesMod downloads happen only from Workshop Maps.

## State and limits

State lives in `$XDG_STATE_HOME/rocket-league` (default `~/.local/state/rocket-league`):

- `release.json`: selected public compatibility fields and check time.
- `working.json`, `last-launch.json`: local version/hash records, no Epic credentials.
- `repairs/`: copies of the managed integration files (two launch helpers, version metadata) before repair.
- `bakkesmod-backups/`: mod files replaced by the last two automatic BakkesMod updates.
- `underpass.json`, `underpass/`: the original Underpass map while a workshop map occupies it.
- `history.jsonl`: actions, timestamps and backup paths; no Heroic launch output.

**Working records and repair backups do not preserve or roll back game builds, Proton or the Wine prefix.** Game updates go through Heroic's legendary and Heroic's install record; BakkesMod updates use the official release archive. Updating Heroic itself remains part of the normal Omarchy/system package update. Preserve a complete known-working offline installation separately before replacing its binaries. This package neither creates nor restores full installation snapshots.

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
