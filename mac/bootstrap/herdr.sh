#!/bin/bash
# Reproducible local build of brs98/herdr; default mode does not write anything.
set -euo pipefail

apply=false
case "${1:---dry-run}" in
  --apply) apply=true ;;
  --dry-run) ;;
  --help|-h) echo "Usage: $0 [--dry-run|--apply]"; exit 0 ;;
  *) echo "Unknown argument: $1" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo 'Expected at most one argument.' >&2; exit 2; }
fail() { echo "Herdr: $*" >&2; exit 1; }
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || fail 'This installer supports native Apple Silicon macOS only (no Rosetta).'

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
patch="$script_dir/patches/herdr-hide-tabs.patch"
commit=72daa8e0c08315657d5d585645c3fa624f6801a3
zig_version=0.15.2
zig_sha=3cc2bab367e185cdfb27501c4b30b1b0653c28d9f73df8dc91488e66ece5fa6b
[[ -f "$patch" ]] || fail "Missing tracked patch: $patch"
command -v shasum >/dev/null || fail 'Missing shasum; install Apple command-line tools.'
patch_sha=$(shasum -a 256 "$patch" | awk '{print $1}')
build_id="brs98-${commit:0:7}-hide-tabs-${patch_sha:0:12}"
cache="$HOME/Library/Caches/brs98-mac-setup/herdr"
build_dir="$cache/$commit-$patch_sha"
destination="$HOME/.local/lib/herdr-fork/herdr"
launcher="$HOME/.local/bin/herdr"

echo "Herdr: pinned brs98/herdr $commit + hide-tab-bar patch $patch_sha"
echo "Build cache: $build_dir"
echo "Install: $destination (launcher: $launcher)"
echo 'Build requirements on cache miss: Apple command-line tools, Homebrew rustup and just; pinned Zig is downloaded and verified.'
echo 'Running sessions are never stopped, detached, or handed off by this installer.'
if ! $apply; then
  echo 'Dry run: no downloads, builds, or changes. Pass --apply to install.'
  exit 0
fi

mkdir -p "$cache"
# A single writer prevents competing builds or partial binary replacements.
lock="$cache/install.lock"
mkdir "$lock" 2>/dev/null || fail "Another install is active (or a stale lock exists): $lock. After confirming no installer is running, remove the empty lock directory and retry."
stage=''
cleanup() {
  [[ -z "$stage" ]] || rm -rf -- "$stage"
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT
stage=$(mktemp -d "$cache/staging.XXXXXX")

if [[ ! -x "$build_dir/herdr" || ! -f "$build_dir/binary.sha256" ]] ||
   [[ $(shasum -a 256 "$build_dir/herdr" | awk '{print $1}') != "$(cat "$build_dir/binary.sha256")" ]]; then
  # Only a cache miss needs source-build tools or a compatible Apple SDK.
  for command in git curl tar just brew; do
    command -v "$command" >/dev/null || fail "Missing $command. Install command-line tools and run the Mac bootstrap dependencies step."
  done
  rustup_bin="$(brew --prefix rustup)/bin"
  [[ -x "$rustup_bin/rustup" ]] || fail 'Install Homebrew rustup first: brew install rustup'
  export PATH="$rustup_bin:$PATH"

  # Zig 0.15.2 cannot read the macOS 26.5 SDK libSystem stubs. Keep the
  # workaround local to this build; never alter xcode-select or Apple's SDKs.
  sdk_name=macosx
  sdk_version=$(/usr/bin/xcrun --sdk macosx --show-sdk-version) || fail 'Install Apple command-line tools with xcode-select --install.'
  if [[ ${sdk_version%%.*} -ge 26 ]]; then
    sdk_name=macosx15.4
    /usr/bin/xcrun --sdk "$sdk_name" --show-sdk-path >/dev/null 2>&1 || fail 'Zig 0.15.2 needs the macOS 15.4 SDK on this OS. Install Apple command-line tools/Xcode containing MacOSX15.4.sdk alongside your current SDK, then retry. No SDK or system developer selection has been changed.'
  fi

  # A fresh checkout means an interrupted or edited cache cannot taint a build.
  source_dir="$stage/source"
  git init -q "$source_dir"
  git -C "$source_dir" remote add origin https://github.com/brs98/herdr.git
  git -C "$source_dir" fetch --depth 1 origin "$commit"
  git -C "$source_dir" checkout --detach FETCH_HEAD
  [[ $(git -C "$source_dir" rev-parse HEAD) == "$commit" ]] || fail 'Fetched source does not match the pinned commit.'
  git -C "$source_dir" apply --check "$patch"
  git -C "$source_dir" apply "$patch"

  archive="$stage/zig.tar.xz"
  curl --fail --location --retry 3 "https://ziglang.org/download/$zig_version/zig-aarch64-macos-$zig_version.tar.xz" -o "$archive"
  [[ $(shasum -a 256 "$archive" | awk '{print $1}') == "$zig_sha" ]] || fail 'Zig checksum mismatch; download will not be extracted.'
  tar -xJf "$archive" -C "$stage"
  mkdir "$stage/sdk-bin"
  cat > "$stage/sdk-bin/xcrun" <<'WRAPPER'
#!/bin/bash
if [[ "${1:-}" == --sdk && "${2:-}" == macosx ]]; then
  shift 2
  exec /usr/bin/xcrun --sdk "$HERDR_BUILD_SDK" "$@"
fi
exec /usr/bin/xcrun "$@"
WRAPPER
  chmod +x "$stage/sdk-bin/xcrun"
  (
    cd "$source_dir"
    # Reads rust-toolchain.toml from the pinned repository (including components).
    rustup show active-toolchain
    export PATH="$stage/sdk-bin:$PATH"
    export HERDR_BUILD_SDK="$sdk_name"
    export ZIG="$stage/zig-aarch64-macos-$zig_version/zig"
    export HERDR_BUILD_CHANNEL=custom HERDR_BUILD_ID="$build_id" HERDR_BUILD_COMMIT="$commit"
    export CARGO_TARGET_DIR="$stage/target"
    just build
  )
  mkdir -p "$build_dir"
  install -m 755 "$stage/target/release/herdr" "$build_dir/herdr.new"
  mv -f "$build_dir/herdr.new" "$build_dir/herdr"
  shasum -a 256 "$build_dir/herdr" | awk '{print $1}' > "$build_dir/binary.sha256"
  # Retain inspectable patched source, without large temporary build products.
  if [[ ! -e "$build_dir/source" ]]; then mv "$source_dir" "$build_dir/source"; fi
else
  echo 'Verified cached binary; skipping build.'
fi
"$build_dir/herdr" --version

cat > "$stage/launcher" <<'LAUNCHER'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == update ]]; then
  echo 'This Herdr is built from brs98/herdr; the upstream updater is disabled.' >&2
  echo 'Update the pinned source/patch and rerun mac/bootstrap/herdr.sh --apply from your dotfiles.' >&2
  exit 1
fi
exec "$HOME/.local/lib/herdr-fork/herdr" "$@"
LAUNCHER

backup_dir=''
replace_file() {
  local incoming=$1 target=$2
  [[ ! -d "$target" ]] || fail "Refusing to replace directory: $target"
  if [[ -f "$target" && ! -L "$target" ]] && cmp -s "$incoming" "$target"; then return; fi
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -z "$backup_dir" ]]; then
      mkdir -p "$HOME/.local/state/brs98-mac-setup/backups"
      backup_dir=$(mktemp -d "$HOME/.local/state/brs98-mac-setup/backups/herdr.XXXXXX")
    fi
    # Preserve symlinks themselves, without following their external targets.
    local backup_name=binary
    [[ "$target" != "$launcher" ]] || backup_name=launcher
    cp -Pp "$target" "$backup_dir/$backup_name"
  fi
  mkdir -p "$(dirname "$target")"
  local pending
  pending=$(mktemp "$(dirname "$target")/.herdr-install.XXXXXX")
  install -m 755 "$incoming" "$pending"
  mv -f "$pending" "$target"
}
replace_file "$build_dir/herdr" "$destination"
replace_file "$stage/launcher" "$launcher"
[[ -z "$backup_dir" ]] || echo "Previous install backed up: $backup_dir"
echo 'Herdr installed. Existing servers keep their current binary. Restart Herdr after finishing your sessions to use this build; no live handoff was performed.'
