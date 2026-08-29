# Hearthstone Battlegrounds matchup overlay

A native Linux service and click-through Omarchy overlay that reads Hearthstone's
`Power.log`, snapshots both boards when combat begins, and runs Firestone's maintained
Battlegrounds simulator locally. Only anonymous derived odds are written to disk.

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

If the service is restarted after a `Power.log` grows beyond 128 MB, it waits for the next
game instead of replaying a potentially huge log. Normal boot-before-game startup is fully
tracked from the beginning.

Some hero counters, quest state, and enchantment-only mechanics are not completely exposed
by the basic board snapshot yet. The overlay labels those combats `PARTIAL STATE` when it can
detect missing core data, but current stats, keywords, minion effects, hero powers, secrets,
and trinkets are passed to the simulator when present.
