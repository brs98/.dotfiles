---
name: extract-rom
description: Extract ROM archives (.7z, .zip, .rar) to ~/Games, converting to playable formats if needed
disable-model-invocation: true
argument-hint: <path-to-archive>
allowed-tools: Bash(7z:*) Bash(dolphin-tool:*) Bash(ls:*) Bash(rm:*)
---

Extract a ROM archive to ~/Games, converting to a playable format if needed.

## Input

`$ARGUMENTS` — path to an archive file (if omitted, check ~/Downloads for .7z, .zip, and .rar files and prompt the user).

## Steps

1. **Extract** the archive into `~/Games`:
   ```
   7z x "<file>" -o"$HOME/Games"
   ```

2. **Identify extracted files** — list what was extracted in `~/Games`.

3. **Convert if needed** — depends on the extracted file type:
   - **Wii/GameCube formats** (`.rvz`, `.gcz`, `.wia`): convert to `.iso` using:
     ```
     dolphin-tool convert -i "<input>" -o "<output>.iso" -f iso
     ```
   - **N64 formats** (`.z64`, `.n64`, `.v64`): no conversion needed, these are playable as-is.
   - **Other formats** (`.iso`, `.bin/.cue`, `.gb`, `.gba`, `.nes`, `.sfc`, `.smc`): no conversion needed.

4. **Clean up** — after successful extraction/conversion, ask the user if they want to:
   - Delete any intermediate files (e.g. the .rvz)
   - Delete the original archive from Downloads

5. **Verify** — list the final ROM file(s) in `~/Games` with file sizes.
