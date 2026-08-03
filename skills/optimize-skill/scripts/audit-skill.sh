#!/usr/bin/env bash
# Deterministic audit of a skill directory. First pass of a hardening run:
# inventory, frontmatter/trigger checks, prose size, script-smell candidates
# (long fenced code blocks in markdown), script hygiene, template token stats.
#
# Usage: audit-skill.sh <skill-dir>
#   audit-skill.sh ~/.dotfiles/skills/codebase-storybook
#
# Output lines are grep-able: "WARN:" = a finding to classify (script it,
# template it, or justify keeping it as prose). Exit 1 if any WARN was printed,
# 0 if clean. Warnings are candidates, not verdicts.
set -euo pipefail

DIR="${1:?usage: audit-skill.sh <skill-dir>}"
cd "$DIR"
WARNED=0
warn() { echo "WARN: $*"; WARNED=1; }
section() { printf '\n== %s ==\n' "$1"; }

section "INVENTORY (lines  file)"
find . -type f -not -path "./.git/*" | sed 's|^\./||' | sort | while IFS= read -r f; do
  printf '%8s  %s\n' "$(wc -l < "$f" 2>/dev/null | tr -d ' ')" "$f"
done

section "FRONTMATTER"
if [ ! -f SKILL.md ]; then
  warn "no SKILL.md"
else
  fm=$(grep -E '^(name|description):' SKILL.md | head -2 || true)
  if [ -n "$fm" ]; then echo "$fm"; else warn "missing name/description frontmatter"; fi
  grep -qi 'use when' SKILL.md || warn "description has no 'Use when' trigger sentence"
fi

section "PROSE SIZE"
if [ -f SKILL.md ]; then
  lines=$(wc -l < SKILL.md | tr -d ' ')
  echo "SKILL.md: $lines lines"
  if [ "$lines" -gt 110 ]; then warn "SKILL.md over ~100-line guideline — move detail to REFERENCE.md"; fi
fi
for md in *.md; do
  [ -f "$md" ] || continue
  [ "$md" = "SKILL.md" ] && continue
  l=$(wc -l < "$md" | tr -d ' ')
  if [ "$l" -gt 500 ]; then warn "$md is $l lines — split by domain or trim"; fi
done

section "SCRIPT-SMELL: fenced code blocks in markdown (candidates to extract)"
# Blocks over 8 lines suggest the agent is expected to retype/adapt real code each
# run — classify: deterministic op (script it) vs illustrative snippet (fine).
found_blocks=$(awk '
  /^```/ {
    if (inb) { if (n > 8) printf "  %s:%d  %d-line %s block\n", FILENAME, start, n, (lang==""?"code":lang); inb=0 }
    else { inb=1; start=FNR; n=0; lang=substr($0,4) }
    next
  }
  inb { n++ }
' ./*.md 2>/dev/null || true)
if [ -n "$found_blocks" ]; then
  echo "$found_blocks"
  warn "long fenced blocks found — extract deterministic ones to scripts/"
else
  echo "none over 8 lines"
fi

section "SCRIPT HYGIENE (scripts/*)"
if [ -d scripts ]; then
  for s in scripts/*; do
    [ -f "$s" ] || continue
    probs=""
    head -1 "$s" | grep -q '^#!' || probs="$probs no-shebang"
    head -20 "$s" | grep -qi 'usage' || probs="$probs no-usage-header"
    [ -x "$s" ] || probs="$probs not-executable"
    if [ -n "$probs" ]; then warn "$s:$probs"; else echo "ok  $s"; fi
  done
else
  echo "(no scripts/ directory)"
  warn "skill has no scripts — verify nothing in the workflow is deterministic"
fi

section "TEMPLATES/ASSETS"
if [ -d assets ]; then
  for a in assets/*; do
    [ -f "$a" ] || continue
    t1=$(grep -o '{{[^}]*}}' "$a" 2>/dev/null | wc -l | tr -d ' ')
    t2=$(grep -o '%%[A-Z]*:[^%]*%%' "$a" 2>/dev/null | wc -l | tr -d ' ')
    echo "$a: $t1 text slot(s), $t2 resolvable token(s)"
  done
else
  echo "(no assets/ directory)"
fi

section "RESULT"
if [ "$WARNED" -eq 1 ]; then
  echo "findings above — classify each: script / template / check / judgment"
  exit 1
fi
echo "clean"
