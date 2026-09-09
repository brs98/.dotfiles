# Herdr remote attach over Tailscale

Herdr 0.8 already supports remote attachment through ordinary OpenSSH. Its
server continues to use a local Unix socket; do not expose a separate Herdr TCP
port. The reusable command after setup is:

```sh
herdr-remote omarchy
herdr-remote omarchy-pc
herdr-remote mac
```

The aliases resolve through Tailscale MagicDNS and call Herdr's native
`herdr --remote <ssh-target>` mode.

The two Linux computers run the same custom Herdr 0.8.0 protocol-20 fork, so
Linux-to-Linux connections use Herdr's thin-client `--remote` mode. The Mac runs
the native 0.8.2 build. The `herdr-remote` helper's Mac routes use Herdr's supported
SSH-hosted attach mode and runs the destination's own client. This prevents an
attach from replacing a managed binary or asking to restart an active server.

The default session and `--session <name>` work in both modes. SSH-hosted Mac
routes do not provide the thin client's local desktop image-clipboard bridge;
terminal text paste still works.

## Native Linux-to-Mac client

On Linux, `herdr --remote herdr-mac` uses a separate matching 0.8.2 client at
`~/.local/lib/herdr-remote-0.8.2/herdr`. This client must be installed separately;
the dotfiles installer does not provision it. The wrapper refuses this route if
the client is missing rather than falling back to the 0.8.0 fork and risking a
remote replacement prompt. `--remote=herdr-mac` and `--session <name>` also work.

Ordinary `herdr` commands, other remote targets, and `herdr update` continue to
use the pinned fork. `herdr-remote mac` retains its SSH-hosted behavior. If the
Mac's Herdr version changes, install a matching local client and update this
route; do not approve a remote replacement or restart just to connect.

## One-time setup on all three computers

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

## Version caveat

The Linux setup pins a custom Herdr 0.8 fork whose installer is Linux-only. Do
not install that wrapper on the Mac; use a native macOS Herdr build with a
compatible protocol. Remote attach can offer to install or replace a mismatched
remote helper and restart its server. Read that prompt before accepting it on a
machine with active panes; use `--handoff` only when intentionally opting into
Herdr's live handoff behavior.

Herdr documentation: <https://herdr.dev/docs/persistence-remote/>

Tailscale ordinary SSH: <https://tailscale.com/docs/reference/ssh-over-tailscale>

Tailscale grants: <https://tailscale.com/docs/reference/syntax/grants>

macOS Remote Login: <https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac>
