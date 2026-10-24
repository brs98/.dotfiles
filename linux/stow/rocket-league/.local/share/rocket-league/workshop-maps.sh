#!/usr/bin/env bash

set -Eeuo pipefail

prefix_dir="${ROCKET_LEAGUE_PREFIX:-$HOME/Games/Heroic/Prefixes/Rocket League}"
maps_dir="${ROCKET_LEAGUE_MAPS_DIR:-$prefix_dir/drive_c/RLMaps}"
game_dir="${ROCKET_LEAGUE_DIR:-$HOME/Games/Heroic/rocketleague}"
cooked_dir="$game_dir/TAGame/CookedPCConsole"
texture_install_stamp="$cooked_dir/.omarchy-workshop-textures-v1"
bakkes_dir="${BAKKESMOD_DIR:-$prefix_dir/drive_c/users/steamuser/AppData/Roaming/bakkesmod/bakkesmod}"
rcon_config="$bakkes_dir/cfg/config.cfg"
rcon_allowlist="$bakkes_dir/data/rcon_commands.cfg"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/rocket-league"
catalog="$data_dir/rings-maps.tsv"
rcon_client="$data_dir/bakkes-rcon.js"
game_launcher="${ROCKET_LEAGUE_BAKKES_LAUNCHER:-$HOME/.local/bin/rocket-league-bakkesmod}"
# The manager picks underpass when BakkesMod does not support the installed patch yet.
mode="${ROCKET_LEAGUE_WORKSHOP_MODE:-bakkesmod}"
underpass_launcher="${ROCKET_LEAGUE_UNDERPASS_LAUNCHER:-$HOME/.local/bin/rocket-league}"
loaded_marker="${ROCKET_LEAGUE_MAP_LOADED:-}"
texture_restart_marker="$maps_dir/.workshop-textures-restart-required"
download_tmp=""
install_tmp=""
textures_tmp=""
textures_changed=false
launcher_pid=""
rcon_pid=""

notify() {
  command -v notify-send >/dev/null 2>&1 &&
    notify-send --app-name="Rocket League Workshop Maps" "$1" "${2:-}"
}

fail() {
  notify "Workshop map failed" "$1"
  printf 'rocket-league-workshop-maps: %s\n' "$1" >&2
  exit 1
}

request_texture_restart() {
  notify "Workshop textures installed" "Close Rocket League, then choose the map again"
  printf '%s\n' 'rocket-league-workshop-maps: Restart Rocket League to activate the workshop textures.' >&2
  exit 0
}

cleanup() {
  if [[ -n $rcon_pid ]]; then
    kill "$rcon_pid" 2>/dev/null || true
    wait "$rcon_pid" 2>/dev/null || true
  fi
  if [[ -n $download_tmp && $download_tmp == /tmp/* && -d $download_tmp ]]; then
    rm -r -- "$download_tmp"
  fi
  if [[ -n $install_tmp && $install_tmp == "$maps_dir"/.install-* && -d $install_tmp ]]; then
    rm -r -- "$install_tmp"
  fi
  if [[ -n $textures_tmp && $textures_tmp == /tmp/* && -d $textures_tmp ]]; then
    rm -r -- "$textures_tmp"
  fi
}
trap cleanup EXIT

if pgrep -f 'RocketLeague_EAC\.exe' >/dev/null 2>&1; then
  fail "Close the normal anti-cheat session before loading a workshop map."
fi

for command in omarchy-menu-select curl bsdtar deno find sort jq; do
  command -v "$command" >/dev/null 2>&1 || fail "Missing required command: $command"
done

[[ -r $catalog ]] || fail "Missing rings-map catalog: $catalog"
case "$mode" in
  bakkesmod)
    [[ -r $rcon_client ]] || fail "Missing BakkesMod control client: $rcon_client"
    [[ -r $rcon_config ]] || fail "BakkesMod's configuration is missing."
    [[ -r $rcon_allowlist && -w $rcon_allowlist ]] || fail "BakkesMod's RCON allowlist is unavailable."
    [[ -x $game_launcher ]] || fail "The Rocket League BakkesMod launcher is missing."
    ;;
  underpass)
    [[ -x $underpass_launcher ]] || fail "The Rocket League launcher is missing."
    ;;
  *)
    fail "Unsupported workshop mode: $mode"
    ;;
esac
[[ -d $cooked_dir && -w $cooked_dir ]] || fail "Rocket League's map-data folder is unavailable."
mkdir -p "$maps_dir" || fail "Could not create the workshop-map folder."

declare -a options=()
declare -A actions=()
declare -A catalog_titles=()
declare -A catalog_sizes=()
declare -A catalog_urls=()

pretty_map_name() {
  local map="$1" metadata title=""
  local directory stem
  directory=$(dirname "$map")
  stem=$(basename "$map")
  stem="${stem%.*}"

  for metadata in "$directory/$(basename "$directory").json" "$directory/$stem.json"; do
    if [[ -r $metadata ]]; then
      title=$(jq -r '(.Title // .title // empty) | strings' "$metadata" 2>/dev/null || true)
      [[ -n $title ]] && break
    fi
  done

  if [[ -z $title ]]; then
    title=$(sed -E 's/([[:lower:][:digit:]])([[:upper:]])/\1 \2/g; s/[_-]+/ /g' <<<"$stem")
  fi
  tr '\t\r\n' '   ' <<<"$title"
}

while IFS= read -r -d '' map; do
  relative="${map#"$maps_dir"/}"
  if [[ $relative == "$map" || $relative == *$'\t'* || $relative == *$'\n'* || $relative == *'"'* || $relative == *';'* ]]; then
    continue
  fi
  title=$(pretty_map_name "$map")
  selection="Play $title"$'\t'"$relative"
  options+=("󰆧"$'\t'"$selection")
  actions["$selection"]="play:$map"
done < <(find "$maps_dir" -type f \( -iname '*.udk' -o -iname '*.upk' \) -print0 | sort -z)

while IFS=$'\t' read -r id title size url _source; do
  [[ -n $id && -n $title && -n $url ]] || continue
  catalog_titles["$id"]="$title"
  catalog_sizes["$id"]="$size"
  catalog_urls["$id"]="$url"
  [[ -f $maps_dir/$id/.rocket-league-map-id ]] && continue
  selection="Install $title"$'\t'"$size · BakkesPlugins"
  options+=("󰇚"$'\t'"$selection")
  actions["$selection"]="install:$id"
done < "$catalog"

(( ${#options[@]} > 0 )) || fail "No workshop maps or catalog entries were found."

selection=$(printf '%s\n' "${options[@]}" |
  omarchy-menu-select "Workshop maps" -- --width 720 --maxheight 560) || exit 0
action="${actions[$selection]:-}"
[[ -n $action ]] || fail "The selected map is no longer available."

find_main_map() {
  local root="$1" candidate size largest_size=-1
  selected_map=""
  while IFS= read -r -d '' candidate; do
    relative="${candidate#"$root"/}"
    if [[ $relative == *$'\t'* || $relative == *$'\n'* || $relative == *'"'* || $relative == *';'* ]]; then
      continue
    fi
    size=$(stat -c '%s' "$candidate")
    if (( size > largest_size )); then
      largest_size=$size
      selected_map="$candidate"
    fi
  done < <(find "$root" -type f \( -iname '*.udk' -o -iname '*.upk' \) -print0)
  [[ -n $selected_map ]]
}

install_catalog_map() {
  local id="$1" archive entry normalized target
  local url="${catalog_urls[$id]:-}"
  [[ -n $url ]] || fail "Unknown catalog map: $id"
  target="$maps_dir/$id"
  [[ ! -e $target ]] || fail "The map folder already exists: $target"

  notify "Downloading ${catalog_titles[$id]}" "${catalog_sizes[$id]} from BakkesPlugins"
  download_tmp=$(mktemp -d) || fail "Could not prepare the map download."
  archive="$download_tmp/map.zip"
  curl --fail --location --silent --show-error --output "$archive" "$url" ||
    fail "The map download failed."

  while IFS= read -r entry; do
    normalized="${entry//\\//}"
    if [[ $normalized == /* || $normalized == ../* || $normalized == */../* ]]; then
      fail "The downloaded archive contains an unsafe path."
    fi
  done < <(bsdtar -tf "$archive")

  install_tmp=$(mktemp -d "$maps_dir/.install-$id.XXXXXX") ||
    fail "Could not prepare the map installation."
  bsdtar -xf "$archive" -C "$install_tmp" || fail "The downloaded map could not be extracted."
  find_main_map "$install_tmp" || fail "The downloaded archive contains no .udk or .upk map."

  relative="${selected_map#"$install_tmp"/}"
  printf '%s\n' "$id" > "$install_tmp/.rocket-league-map-id"
  mv "$install_tmp" "$target" || fail "Could not finish installing the map."
  install_tmp=""
  selected_map="$target/$relative"
}

ensure_workshop_textures() {
  local texture_url archive file entry normalized missing=false
  local -a texture_files=(
    EditorLandscapeResources.upk
    EditorMaterials.upk
    EditorMeshes.upk
    EditorResources.upk
    EngineDebugMaterials.upk
    EngineMaterials.upk
    EngineResources.upk
    MapTemplateIndex.upk
    MapTemplates.upk
    NodeBuddies.upk
    Engine_MI_Shaders.upk
    EngineVolumetrics.upk
    EngineBuildings.upk
    mods.upk
  )

  for file in "${texture_files[@]}"; do
    if [[ ! -f $cooked_dir/$file ]]; then
      missing=true
      break
    fi
  done
  if [[ $missing == false ]]; then
    if [[ ! -f $texture_install_stamp ]]; then
      : > "$texture_install_stamp"
      textures_changed=true
    fi
    return 0
  fi

  texture_url='https://drive.usercontent.google.com/download?id=18iAaBRPS1WDMuwTQ1gqWxmPUCsd2cvJ_&export=download&confirm=t'
  notify "Installing workshop textures" "One-time 44.5 MB download"
  textures_tmp=$(mktemp -d) || fail "Could not prepare the workshop textures."
  archive="$textures_tmp/workshop-textures.zip"
  curl --fail --location --silent --show-error --output "$archive" "$texture_url" ||
    fail "The workshop-texture download failed."

  while IFS= read -r entry; do
    normalized="${entry//\\//}"
    if [[ $normalized == /* || $normalized == ../* || $normalized == */../* ]]; then
      fail "The workshop-texture archive contains an unsafe path."
    fi
  done < <(bsdtar -tf "$archive")

  bsdtar -xf "$archive" -C "$textures_tmp" || fail "The workshop textures could not be extracted."

  for file in "${texture_files[@]}"; do
    [[ -f $textures_tmp/$file ]] || fail "The workshop-texture archive is incomplete."
    [[ -f $cooked_dir/$file ]] ||
      install -m 0644 "$textures_tmp/$file" "$cooked_dir/$file" ||
      fail "Could not install workshop texture: $file"
  done
  : > "$texture_install_stamp"
  textures_changed=true
}

case "$action" in
  play:*)
    selected_map="${action#play:}"
    ;;
  install:*)
    install_catalog_map "${action#install:}"
    ;;
  *)
    fail "Unsupported workshop-map action."
    ;;
esac

[[ -f $selected_map ]] || fail "The selected map file is missing."
game_running=false
pgrep -f 'RocketLeague\.exe' >/dev/null 2>&1 && game_running=true
ensure_workshop_textures

if [[ $textures_changed == true && $game_running == true ]]; then
  : > "$texture_restart_marker"
fi
if [[ -f $texture_restart_marker ]]; then
  if [[ $game_running == true ]]; then
    request_texture_restart
  fi
  rm -f -- "$texture_restart_marker"
fi

title=$(pretty_map_name "$selected_map")
if [[ $mode == underpass ]]; then
  [[ $game_running == false ]] || fail "Close Rocket League, then choose the map again."
  notify "Starting Rocket League" "$title is in Underpass: choose Free Play → Underpass"
  exec "$underpass_launcher" underpass "$selected_map"
fi

if ! grep -qxF 'load_workshop' "$rcon_allowlist"; then
  printf '\nload_workshop\n' >> "$rcon_allowlist" ||
    fail "Could not allow the BakkesMod workshop command."
fi
if ! pgrep -f 'RocketLeague\.exe' >/dev/null 2>&1; then
  notify "Starting Rocket League" "Loading $title when BakkesMod is ready"
  "$game_launcher" &
  launcher_pid=$!
fi

check_launch() {
  if [[ -n $launcher_pid ]] && ! kill -0 "$launcher_pid" 2>/dev/null; then
    if ! wait "$launcher_pid"; then
      fail "Rocket League launch failed. Resolve the launcher error before trying the map again."
    fi
    launcher_pid=""
  fi
}

deno run --quiet \
  "--allow-read=$rcon_config,$maps_dir" \
  --allow-net=127.0.0.1:9002 \
  "$rcon_client" "$selected_map" "$maps_dir" "$rcon_config" &
rcon_pid=$!
# Heroic may keep the launcher alive for the whole session. Wait for RCON
# readiness, but stop promptly if the launcher rejects the request.
while kill -0 "$rcon_pid" 2>/dev/null; do
  check_launch
  sleep 0.2
done
check_launch
if ! wait "$rcon_pid"; then
  rcon_pid=""
  fail "Could not send the map to BakkesMod."
fi
rcon_pid=""
[[ -z $loaded_marker ]] || : > "$loaded_marker"

notify "Loading workshop map" "$title"
