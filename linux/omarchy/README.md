# Omarchy state in dotfiles

`shell.json` is the reproducible shell seed and can be refreshed from the live layout. The shell rewrites its live copy atomically, so `linux/scripts/omarchy-shell-config-sync` copies rather than symlinks it.

`plugins.json` declares the desired plugin installations:

- `source-link` plugins are independently published repositories cloned below `~/src` and linked into `~/.config/omarchy/plugins` as whole directories.
- `omarchy` plugins are third-party repositories kept as normal Git checkouts in the live plugin directory.

Use this script—not unqualified `omarchy plugin update`—to update the owned, directory-linked plugins. It validates fetched content before advancing any checkout. Plugin enablement and bar placement remain in `shell.json`, so installation also works before the graphical shell starts.

Edits below `~/src` normally reload through the directory link. If a shell version misses an inotify event across that link, run `omarchy shell shell rescanPlugins`.

Reconcile or audit them with:

```bash
linux/scripts/omarchy-plugins-sync sync
linux/scripts/omarchy-plugins-sync check
linux/scripts/omarchy-plugins-sync update
```

The public catalog for the owned plugins is [`brs98/omarchy-plugins`](https://github.com/brs98/omarchy-plugins). It is intentionally a catalog rather than a submodule aggregator.
