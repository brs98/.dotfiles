# Set up Brandon's Mac

This bootstrap currently supports native Apple Silicon Macs. Run it as your normal login user. It installs the selected apps and
CLI tools, links dotfiles, configures the desktop and preferences, and builds the
Herdr fork with the hidden-tab option. Do not run the whole script with `sudo`.

From a checkout:

```sh
bash setup-mac.sh                         # preview, no changes
bash setup-mac.sh --apply                 # install; preserve config conflicts
```

If the preview lists existing config conflicts, review those paths. To replace
them while keeping recoverable backups:

```sh
bash setup-mac.sh --apply --backup-conflicts
```

The script preflights **all** config targets before linking any. It refuses to
write through symlinked parent directories. Existing conflicting files/links move
to `~/.dotfiles-backups/mac-<timestamp>/`, with a manifest; reruns leave matching
links alone. Stop apps before restoring a backup, remove only the corresponding
new link, then move the saved item back to the manifest's home-relative path.
Codex/shell/SSH merges retain unrelated settings and keep private backups under
`~/.dotfiles-backups/user-config/`.

On a fresh Mac, install Apple's Command Line Tools (`xcode-select --install`),
then clone without submodules and run the same command:

```sh
git clone https://github.com/brs98/.dotfiles.git ~/.dotfiles
bash ~/.dotfiles/setup-mac.sh --apply
```

Once this change is published, the outer entry point can also bootstrap the clone:

```sh
curl -fsSL https://raw.githubusercontent.com/brs98/.dotfiles/main/setup-mac.sh -o /tmp/setup-mac.sh
bash /tmp/setup-mac.sh --apply
```

It preserves an existing checkout without pulling or switching branches. Homebrew
and Codex are installed only if missing. `brew bundle --no-upgrade` installs missing
packages without updating installed versions. No cleanup/uninstall operation runs.
Game saves and RetroArch setup are excluded on macOS, even when the submodule exists.
The Linux installer retains its existing behavior.

## Resumable phases

```sh
bash setup-mac.sh --apply --phase packages
bash setup-mac.sh --apply --phase config --backup-conflicts
bash setup-mac.sh --apply --phase desktop --onboarding-complete
bash setup-mac.sh --apply --phase preferences
bash setup-mac.sh --apply --phase herdr
bash setup-mac.sh --phase verify
```

Omit `--apply` to preview any setup phase. Preview works with Apple's bundled
Python; user-config TOML validation/comparison is deferred until apply, after the
packages phase installs Python 3.11 or newer. `verify` is always read-only.
Exit code 3 means manual work is pending; other nonzero codes indicate failure.
An interrupted run can resume with the failed phase. Apply logs live in
`~/.local/state/mac-bootstrap/logs/`; secrets and app credentials are not copied
into this repository. The bootstrap never stops a Herdr server or Codex session.

The Mac path of `install.sh` now runs the safe config phase and also defaults to
preview. Existing automation calling `install.sh` on macOS must add `--apply`.
It links bundled skills directly rather than adopting unrelated runtime skills
or downloading a second copy. RiceKit owns its generated theme outputs; the
bootstrap does not Stow those output files or initialize game-save submodules.

## Manual steps

- Finish Apple Command Line Tools and any Homebrew administrator prompt.
- Sign in with `gh auth login` and `codex login`; sign in to Claude Code and apps.
- Complete RiceKit onboarding/trial or license and AeroSpace Accessibility access.
  The desktop phase exits pending before invoking RiceKit's CLI, since its first
  call can activate a trial. Then rerun desktop with `--onboarding-complete`.
- In Raycast, set Command-Space and Open at Login. The preferences phase disables
  Spotlight's conflicting Command-Space shortcut. Accept Raycast's terms yourself.
- Keyboard → Keyboard Shortcuts → Modifier Keys: select each internal/external
  keyboard and map Caps Lock to Control. This is intentionally per device; no
  hardware identifier from the first Mac is embedded in the script.
- Log out/in after preference changes. Verify tap-to-click, three-finger drag,
  fast repeat/short delay, reversed scrolling, screenshots saved to Downloads,
  auto-hidden Dock/menu bar, and
  AeroSpace Command-Shift-number bindings with physical keys.
- Verify external display operation with power and external keyboard/mouse before
  closing the lid; approve new accessories with the lid open. Display sleep is
  disabled on AC/battery and system sleep on AC; battery system sleep is retained.
- Open Neovim for initial plugin/parser downloads. This can update its lockfile;
  review that diff before committing. Test the terminal colors and desktop bars.
- Restart/resume Codex to load Ctrl+G for follow-up questions. External-editor
  Ctrl+G is unbound. Finish active Herdr sessions before restarting on a new binary.

## Herdr prerequisite and update policy

See [Herdr installer](bootstrap/herdr.md). The fork has no Mac release asset, so
we pin its source and carry the tested hidden-tab patch in this repository.
Zig 0.15.2 cannot link the macOS 26 SDK; on that SDK version the build needs Apple's
macOS 15.4 SDK installed alongside it. The script stops with instructions when
it is missing. It does not download a third-party SDK or change `xcode-select`.
This is the main remaining obstacle to completely unattended setup on a new Mac.
A checksum-valid cached binary installs without build tools or that older SDK.

`herdr update` is guarded against replacing the fork with upstream. Update the
pinned commit and patch deliberately, then rerun the Herdr phase. Cached binaries
are checksum-checked and previous binaries/launchers are backed up. Running
servers continue using their original binary until you finish and restart them.

## Validation

```sh
/opt/homebrew/bin/python3 -m unittest discover -s mac/tests
/opt/homebrew/bin/python3 mac/bootstrap/herdr-test.py
bash -n setup-mac.sh mac/bootstrap.sh mac/bootstrap/desktop.sh mac/bootstrap/herdr.sh mac/bootstrap/verify.sh
bash setup-mac.sh --phase preferences
bash setup-mac.sh --phase verify
```

Tests use temporary homes and fake services to exercise conflicts, repeat runs,
preference preservation, desktop gates, and cached Herdr installation without
changing the host. A clean-machine end-to-end installation has not yet been run.

Historical setup notes remain in `~/mac-setup/README.md`; this document and the
tracked bootstrap are the reusable source of truth for subsequent Macs.

Installation sources: [Homebrew](https://brew.sh/) and [official Codex CLI documentation](https://learn.chatgpt.com/docs/cli).
