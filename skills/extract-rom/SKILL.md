---
name: extract-rom
description: Extract ROM archives into ~/Games and convert Wii or GameCube images to playable ISO files when needed. Use when asked to unpack .7z, .zip, or .rar ROM archives, prepare ROMs for an emulator, or convert .rvz, .gcz, or .wia images.
---

# Extract ROM

1. Resolve the requested archive path. If none was supplied, inspect `~/Downloads` for `.7z`, `.zip`, and `.rar` files and ask the user to select one when multiple candidates exist.
2. Confirm that `7z` is installed, then extract the archive into `~/Games` with `7z x <archive> -o<destination>`.
3. List the extracted files and identify their formats.
4. Convert Wii or GameCube `.rvz`, `.gcz`, and `.wia` images to `.iso` with `dolphin-tool convert -i <input> -o <output.iso> -f iso`.
5. Leave `.z64`, `.n64`, `.v64`, `.iso`, `.bin`, `.cue`, `.gb`, `.gba`, `.nes`, `.sfc`, and `.smc` files unchanged.
6. Verify the final files and sizes.
7. Ask before deleting intermediate images or the original archive.

Treat archives and extracted ROMs as user data. Never overwrite or delete them without explicit confirmation.
