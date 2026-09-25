# Herdr remote attach over Tailscale

The Linux installer pins `fork-v0.9.1-1` from `brs98/herdr`, built from
`f1cb7cba5d04c8951ed7692792ea09e1809753e4`. Its application version is
`0.9.1-custom.brs98-0.9.1-navigation` and private protocol is 22.
Work-mac, personal-mac, PC, and Framework use this version, with the custom sidebar.

Herdr uses ordinary OpenSSH over Tailscale and a local Unix socket on each
machine. Do not expose a separate Herdr TCP port. Saved profiles are available
through `herdr machine list`; for example:

```sh
herdr --machine pc pane list
herdr --machine framework workspace list
herdr --remote herdr-mac
```

All Linux wrapper routes use the same fork binary. The separate 0.8.2 Mac client
is no longer needed. The older `herdr-remote` helper and its SSH-hosted Mac
attachment remain separate from saved-machine CLI forwarding.

## Updating the pinned Linux fork

`herdr update` downloads the pinned release, verifies its SHA-256, preserves the
previous binary, and installs atomically. It leaves running sessions unchanged.
`herdr update --handoff` explicitly opts into live handoff only for the tested
0.9.0-to-0.9.1 server/client pair. A server already running the target version is
left alone; other server versions are not automatically stopped or migrated.
Reopen attached clients to load the updated UI. The macOS logout/DNS fix needs
a fresh server session; handoff does not repair inherited service context.

The release asset named `herdr` and this installer are Linux x86_64 only. macOS
uses the separately built native fork binary. This published pin replaces the
old per-machine local-build override; do not restore an old `local-build.pin`
when migrating an earlier installer.

## Legacy three-computer bootstrap

The following instructions describe the original three-computer setup. The
current four-machine mesh additionally authorizes work-mac on every destination.
Preserve those rules and the existing `00-herdr-mesh.conf` SSH aliases when
maintaining an already configured machine.

### Original one-time setup

1. Pull these dotfiles and run `./install.sh` on `omarchy`, `omarchy-pc`, and
   the Mac. This installs the shared SSH aliases without taking ownership of
   private SSH files.
2. Run `herdr-remote-key ensure` on each computer. Use a passphrase unless the
   computer's physical security and automation requirements justify an
   unencrypted private key. If a passphrase is used, load it with
   `ssh-add ~/.ssh/id_ed25519_herdr` before a remote attach.
3. Exchange only the three `.pub` files. On each destination, authorize the
   public keys from the other two computers:

   ```sh
   herdr-remote-key authorize /path/to/other-computer.pub
   ```

   `herdr-remote-key show` prints the local public key when copy/paste is more
   convenient. Never copy or sync the private `~/.ssh/id_ed25519_herdr` file;
   exchange only `~/.ssh/id_ed25519_herdr.pub`.
4. On both Omarchy computers, configure sshd's exact two-peer source allowlist:

   ```sh
   herdr-remote-server-setup --dry-run
   herdr-remote-server-setup
   ```

   The command discovers the peers' stable Tailscale IPv4 addresses at runtime,
   keeps password login and forwarding disabled, validates the sshd config, and
   reloads sshd. It creates a recoverable `.pre-herdr-remote` backup when it
   replaces an existing Herdr drop-in.
5. On the Mac, open **System Settings > General > Sharing**, enable **Remote
   Login**, and limit access to the `brandon` account. Do not enable Full Disk
   Access unless remote commands actually need it.
6. From every computer, run `herdr-remote doctor`. It skips itself and verifies
   non-interactive SSH plus the remote Herdr binary on both peers. The aliases
   use OpenSSH's `accept-new` policy: the first connection records a host key,
   while a later changed host key is rejected.

If a destination still allows password SSH, `herdr-remote-key copy <target>` is
a convenience alternative to manually transferring its public key. The two
Omarchy hosts are intentionally configured public-key-only, so local public-key
authorization is the reliable bootstrap path there.

## Tailnet policy

Native OpenSSH still needs a Tailscale network grant for TCP port 22. Merge an
equivalent rule into the tailnet policy, substituting the three stable Tailscale
IPv4 addresses shown by the admin console:

```json
{
  "hosts": {
    "herdr-omarchy": "100.x.x.x",
    "herdr-omarchy-pc": "100.y.y.y",
    "herdr-macbook": "100.z.z.z"
  },
  "ipsets": {
    "ipset:herdr-peers": [
      "host:herdr-omarchy",
      "host:herdr-omarchy-pc",
      "host:herdr-macbook"
    ]
  },
  "grants": [
    {
      "src": ["ipset:herdr-peers"],
      "dst": ["ipset:herdr-peers"],
      "ip": ["tcp:22"]
    }
  ]
}
```

Grants are additive. A default or existing `*` to `*` allow rule must be
removed or narrowed if port 22 should truly be limited to these devices. Keep
unrelated policy sections, preview the policy diff in the Tailscale admin
console, and add policy tests before saving.

Use native OpenSSH on all three rather than Tailscale SSH. The latter's server
is not available in the normal macOS GUI distribution, while native macOS
Remote Login gives all six connection directions the same authentication
model. Ensure **Allow incoming connections** is enabled in Tailscale and
Tailscale SSH interception is disabled (`tailscale set --ssh=false`) on the
Linux destinations.

Herdr documentation: <https://herdr.dev/docs/persistence-remote/>

Tailscale ordinary SSH: <https://tailscale.com/docs/reference/ssh-over-tailscale>

Tailscale grants: <https://tailscale.com/docs/reference/syntax/grants>

macOS Remote Login: <https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac>
