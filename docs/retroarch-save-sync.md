# RetroArch GameCube save synchronization

## Install the widget and automatic sync

Requires a running Omarchy desktop, Git, Python 3, and GitHub access to `brs98/game-saves`.
From a checkout of this dotfiles repository at `~/.dotfiles`, run:

```sh
~/.dotfiles/linux/scripts/install-game-saves-widget
```

The installer creates the save checkout on `main` if missing, links the widget
and user systemd units, adds a gamepad to the right side of the bar, and enables
automatic syncing. Re-running it is safe. It refuses to replace independently
managed units/plugins or choose between differing pre-existing saves. It does
not require running the full dotfiles installer or replacing desktop settings.
The full `install.sh` also invokes this installer on Omarchy.

Click the gamepad to sync, and hover to see the latest result and success time.
Automatic sync and widget clicks share the same Rooms-aware backend and locks.
The widget status is the latest attempted sync, not a claim of continuous
connectivity. Offline failures retain local commits and retry automatically.

```sh
~/.dotfiles/linux/scripts/game-saves-sync sync
~/.dotfiles/linux/scripts/game-saves-sync status
```

Status is stored in `~/.local/state/game-saves-sync/status.json`.

## Behavior and recovery

The `brs98/game-saves` Git repository lives at
`~/.dotfiles/shared/symlink/retroarch/.config/retroarch/saves`.
Only `dolphin-emu/User/GC/USA/Card A` is synchronized. Wii NAND, other
RetroArch cores, and emulator save states are outside this setup.

`retroarch-saves.path` observes Card A changes. `retroarch-saves.timer`
retries every 30 seconds, including remote-only changes and network failures.
The service and widget run `linux/scripts/game-saves-sync`, which delegates to
`linux/scripts/sync-retroarch-saves.py`. The shared backend imports new
regular `.gci` files, keeps backup copies outside Git, and creates individual
save symlinks. The Card A directory itself stays real for Rooms compatibility.
Framework's existing directory symlink is also supported.

The wrapper holds Rooms' personal-save lock, and defers synchronization while
RetroArch or Dolphin runs. Saves synchronize after the emulator exits; quit on
one machine and let a sync finish before starting the same game on the other.
A timer is eventual synchronization, not a guarantee that a just-launched game
has already received remote changes. For an immediate sync before playing:

```sh
systemctl --user start retroarch-saves.service
systemctl --user status retroarch-saves.service --no-pager
```

The shell script commits local changes, fetches, merges, and pushes on `main`.
Offline commits are retained and retried. Detached HEADs are refused.
Conflicting histories stop without choosing a binary save or force-pushing.
Resolve conflicting versions manually before restarting the service.

```sh
journalctl --user -u retroarch-saves.service -n 40 --no-pager
systemctl --user list-timers retroarch-saves.timer
```

Import backups are content-addressed under
`~/.local/state/retroarch-save-sync/import-backups/`. Initial migration backups
are in `~/.local/state/retroarch-save-sync/backups/20261003-initial/` on the PC,
including a Git bundle of both histories and copies of both machines' cards.
Existing local-only save files are imported; missing local symlinks are restored
from Git rather than treated as requests to delete saves. To intentionally
remove a save, remove its repository file and its local link while the service
is stopped, then commit the deletion.

Use the installer above on each machine. Do not use `git submodule update`
to download the newest saves: it follows the parent repository’s pinned commit
and can detach the save checkout. The sync service follows the save repository’s
`main` branch instead.

Before initial activation, reconcile any existing divergent save histories and
attach the saves checkout to `main`. Do not run a destructive submodule reset.
