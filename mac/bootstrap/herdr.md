# Herdr fork build

Run `bash mac/bootstrap/herdr.sh` to preview, then add `--apply` to install.
This currently supports native Apple Silicon macOS. Building requires Homebrew
`rustup` and `just`, and Apple's command-line tools. A checksum-verified cached
binary skips build-tool and SDK checks.

The installer fetches brs98/herdr commit
`72daa8e0c08315657d5d585645c3fa624f6801a3`, applies the tracked
`patches/herdr-hide-tabs.patch`, and uses that repository's Rust toolchain and
locked Cargo dependencies. Zig 0.15.2 is downloaded from ziglang.org with a
pinned SHA-256. The patch implements `ui.hide_tab_bar = true`, including tests
and configuration documentation; the existing shared Herdr config enables it.

Zig 0.15.2 failed against macOS 26.5's SDK during the original setup. On SDK 26
or newer, this installer uses the installed `macosx15.4` SDK through a temporary
`xcrun` wrapper. If a build is needed and that SDK is absent, it stops with instructions. Obtaining
compatible Apple developer tools remains a manual prerequisite on such Macs.
The installer does not change `xcode-select` or modify an Apple SDK. Older SDKs
use the default selection; only 15.4 was verified during this setup.

Source and verified cached binaries live in
`~/Library/Caches/brs98-mac-setup/herdr/<commit>-<patch SHA256>/`. A failed build
does not replace the installed binary. Successful installs atomically replace
`~/.local/lib/herdr-fork/herdr` and its `~/.local/bin/herdr` launcher, saving
conflicting files or symlinks under `~/.local/state/brs98-mac-setup/backups/`.
Repeated runs reuse a checksum-verified binary and leave equal installed files
alone. The existing `~/src/herdr` checkout is never modified.

The launcher rejects `herdr update` to avoid downloading an upstream binary
that lacks the fork modifications. Existing servers are never stopped or handed
off: finish your sessions and restart Herdr when ready. A new launcher does not
upgrade an already running server.

To update, review and change the pinned source and patch together. Remove the
patch only once the selected fork revision contains the same feature. The cache
key changes with either input. The saved patch preserves the local work without
requiring it to have been pushed to GitHub.

Validation: `bash -n mac/bootstrap/herdr.sh` and
`python3 mac/bootstrap/herdr-test.py`. Tests use a temporary home and fake cached
binary to check dry-run safety, replacement backups, rerun behavior, and the
upstream-update guard. Command fixtures verify cache reuse without build tools
or a compatible SDK, and that corrupt caches still require both. The tests
do not download, build, query real SDKs, or interact with real Herdr sessions. The original
patched native build and its source tests passed during initial installation;
the complete fresh-download path has not been rerun by these bootstrap tests.
