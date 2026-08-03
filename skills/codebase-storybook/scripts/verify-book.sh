#!/usr/bin/env bash
# Browser verification for a storybook: numeric overflow detection plus a
# screenshot of every spread. Replaces eyeball-only checking.
#
# Usage: verify-book.sh <book.html> <output-dir>
#
# Requires the agent-browser CLI. Prints an OVERFLOW report (pages whose content
# exceeds the page box — the cause of clipped captions/folios) and writes
# cover.png, spread-1.png … spread-N.png, end.png into <output-dir>.
# The agent should still LOOK at the screenshots; this automates the walking
# and turns the #1 defect (overflow) into a number instead of a judgment call.
set -euo pipefail

BOOK="${1:?usage: verify-book.sh <book.html> <output-dir>}"
OUT="${2:?usage: verify-book.sh <book.html> <output-dir>}"
mkdir -p "$OUT"
BOOK_ABS="$(cd "$(dirname "$BOOK")" && pwd)/$(basename "$BOOK")"

agent-browser set viewport 1440 900 >/dev/null
agent-browser open "file://$BOOK_ABS" >/dev/null
agent-browser wait 1200 >/dev/null

echo "== OVERFLOW REPORT (empty array = no page overflows its box) =="
agent-browser eval "JSON.stringify([...document.querySelectorAll('.page-inner')].map(function(el){return {folio:(el.querySelector('.folio')||{}).textContent||'(none)', head:((el.querySelector('.runhead, h1, h2')||{}).textContent||'').trim().slice(0,40), over:el.scrollHeight-el.clientHeight};}).filter(function(x){return x.over>2;}))"

LEAVES=$(agent-browser eval "document.querySelectorAll('.leaf').length" | tr -dc '0-9')
echo "== WALKING $LEAVES leaves =="
agent-browser screenshot "$OUT/cover.png" >/dev/null
for i in $(seq 1 "$LEAVES"); do
  agent-browser press ArrowRight >/dev/null
  agent-browser wait 1150 >/dev/null
  if [ "$i" -eq "$LEAVES" ]; then
    agent-browser screenshot "$OUT/end.png" >/dev/null
  else
    agent-browser screenshot "$OUT/spread-$i.png" >/dev/null
  fi
done
agent-browser close >/dev/null

echo "screenshots: $OUT (cover.png, spread-1..$((LEAVES-1)).png, end.png)"
echo "next: fix any overflowing folios, then READ the screenshots (cover, cast, every plate page, end)."
