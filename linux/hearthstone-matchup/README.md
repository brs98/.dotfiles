# Hearthstone Battlegrounds matchup overlay

A native Linux service and click-through Omarchy overlay that reads Hearthstone's live
power stream, snapshots both boards when combat begins, and runs Firestone's maintained
Battlegrounds simulator locally. It automatically falls back from the per-session
`Power.log` to Unity's `Player.log` when Hearthstone stops growing the former. Only
anonymous derived odds are written to disk.

The overlay intentionally appears at the first attack rather than during the recruit phase:
that is the first point at which Hearthstone's log reveals the opponent's current board.
Solo Battlegrounds is supported; Duos is not.

## Commands

```bash
systemctl --user status hearthstone-matchup.service
journalctl --user -u hearthstone-matchup.service -f
systemctl --user restart hearthstone-matchup.service
```

The first combat after installation may take a few seconds while Firestone's public card
reference data is downloaded. Later combats reuse it in memory.

When attaching to a large `Player.log`, the service searches only the latest 128 MB for the
current game's `CREATE_GAME` marker instead of replaying the file's entire history. If that
marker is older, it waits for the next game. Normal boot-before-game startup is fully tracked.

Some hero counters, quest state, and enchantment-only mechanics are not completely exposed
by the basic board snapshot yet. The overlay labels those combats `PARTIAL STATE` when it can
detect missing core data, but current stats, keywords, minion effects, hero powers, secrets,
and trinkets are passed to the simulator when present.
