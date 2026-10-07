#!/usr/bin/env python3
"""Validate a code-move-map data file and render it into the HTML template.

Usage:
  render.py DATA.json [-o OUT.html] [--repo DIR] [--strict] [--open]

--repo DIR  also checks every file and block against git: each file must exist at its
            side's ref, block ends must fit the real line count, `lines` must match it,
            and a block's `anchor` text must appear on its `start` line.
--strict    treat warnings as errors.
--open      open the rendered page (macOS `open`, else `xdg-open`).

Exit status: 0 rendered, 1 validation failed, 2 usage/IO error.
"""
import argparse
import json
import re
import subprocess
import sys
from html import escape
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL_DIR / "templates" / "code-move-map.html"
KINDS = {"move", "stay", "new", "removed"}
KIND_COLORS = {"stay": "#9aa1b0", "new": "#b4560f", "removed": "#b42318"}
MOVE_PALETTE = ["#0f8a7a", "#6f39ad", "#1f6fd1", "#c0306b", "#3d7d1f", "#8a6a00", "#00838f"]
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def normalize_and_validate(data, rep):
    if not isinstance(data, dict):
        rep.error("top level must be a JSON object")
        return
    if not isinstance(data.get("title"), str) or not data["title"].strip():
        rep.error("`title` is required (string)")

    cats = data.get("categories")
    if not isinstance(cats, list) or not cats:
        rep.error("`categories` must be a non-empty list")
        cats = []
    cat_by_id, palette_i = {}, 0
    for i, c in enumerate(cats):
        where = f"categories[{i}]"
        if not isinstance(c, dict):
            rep.error(f"{where} must be an object")
            continue
        cid = c.get("id")
        if not isinstance(cid, str) or not ID_RE.match(cid):
            rep.error(f"{where}.id must match {ID_RE.pattern}")
            continue
        if cid in cat_by_id:
            rep.error(f"duplicate category id {cid!r}")
        if c.get("kind") not in KINDS:
            rep.error(f"category {cid!r}: kind must be one of {sorted(KINDS)}")
        if not isinstance(c.get("label"), str):
            rep.error(f"category {cid!r}: `label` is required")
        color = c.get("color")
        if color is None:
            if c.get("kind") == "move":
                c["color"] = MOVE_PALETTE[palette_i % len(MOVE_PALETTE)]
                palette_i += 1
            else:
                c["color"] = KIND_COLORS.get(c.get("kind"), "#646b7a")
        elif not isinstance(color, str) or not HEX_RE.match(color):
            rep.error(f"category {cid!r}: color must be #rrggbb")
        cat_by_id[cid] = c

    files = data.get("files")
    if not isinstance(files, list) or not files:
        rep.error("`files` must be a non-empty list")
        files = []
    blocks = {}
    for i, f in enumerate(files):
        if not isinstance(f, dict):
            rep.error(f"files[{i}] must be an object")
            continue
        path = f.get("path")
        where = f"file {path!r}" if isinstance(path, str) else f"files[{i}]"
        if not isinstance(path, str) or not path:
            rep.error(f"{where}: `path` is required")
        if f.get("side") not in ("before", "after"):
            rep.error(f"{where}: side must be 'before' or 'after'")
        lines = f.get("lines")
        if lines is not None and (not is_int(lines) or lines < 1):
            rep.error(f"{where}: `lines` must be a positive integer")
            lines = None
        fblocks = f.get("blocks")
        if not isinstance(fblocks, list) or not fblocks:
            rep.error(f"{where}: `blocks` must be a non-empty list")
            continue
        prev = None
        for j, b in enumerate(fblocks):
            if not isinstance(b, dict):
                rep.error(f"{where}: blocks[{j}] must be an object")
                continue
            bid = b.get("id")
            if not isinstance(bid, str) or not ID_RE.match(bid):
                rep.error(f"{where}: blocks[{j}].id must match {ID_RE.pattern}")
                continue
            if bid in blocks:
                rep.error(f"duplicate block id {bid!r} (ids are global across files)")
            blocks[bid] = (f, b)
            bw = f"block {bid!r} ({path})"
            if not isinstance(b.get("label"), str) or not b["label"].strip():
                rep.error(f"{bw}: `label` is required")
            if b.get("category") not in cat_by_id:
                rep.error(f"{bw}: unknown category {b.get('category')!r}")
            start, end = b.get("start"), b.get("end")
            if not (is_int(start) and is_int(end)):
                rep.error(f"{bw}: `start` and `end` must be integers")
                continue
            if start < 1 or end < start:
                rep.error(f"{bw}: invalid line range {start}-{end}")
                continue
            if lines is not None and end > lines:
                rep.error(f"{bw}: ends at line {end} but the file has {lines} lines")
            if prev is not None:
                pid, pend, pstart = prev
                if start <= pend:
                    rep.warn(f"{bw}: lines {start}-{end} overlap block {pid!r} (ends {pend})")
                elif start < pstart:
                    rep.warn(f"{bw}: listed after {pid!r} but starts earlier; keep blocks in file order")
            prev = (bid, end, start)

    raw_moves = data.get("moves")
    if not isinstance(raw_moves, list):
        rep.error("`moves` must be a list (may be empty)")
        raw_moves = []
    moves, seen = [], set()
    for i, m in enumerate(raw_moves):
        if not isinstance(m, dict):
            rep.error(f"moves[{i}] must be an object")
            continue
        src, dests, cat = m.get("from"), m.get("to"), m.get("category")
        dests = dests if isinstance(dests, list) else [dests]
        mw = f"moves[{i}] ({src} -> {m.get('to')})"
        if src not in blocks:
            rep.error(f"{mw}: `from` is not a block id")
        elif blocks[src][0].get("side") != "before":
            rep.error(f"{mw}: `from` must be a before-side block")
        if cat not in cat_by_id:
            rep.error(f"{mw}: unknown category {cat!r}")
        elif cat_by_id[cat].get("kind") not in ("move", "stay"):
            rep.error(f"{mw}: a move's category must be of kind 'move' or 'stay'")
        if "changed" in m and not isinstance(m["changed"], str):
            rep.error(f"{mw}: `changed` must be a string")
        if not dests or dests == [None]:
            rep.error(f"{mw}: `to` is required")
        for d in dests:
            if d not in blocks:
                rep.error(f"{mw}: `to` {d!r} is not a block id")
            elif blocks[d][0].get("side") != "after":
                rep.error(f"{mw}: `to` {d!r} must be an after-side block")
            if (src, d) in seen:
                rep.error(f"{mw}: duplicate move {src} -> {d}")
            seen.add((src, d))
            one = {k: v for k, v in m.items() if k != "to"}
            one["to"] = d
            moves.append(one)
    data["moves"] = moves

    outgoing = {m["from"] for m in moves}
    incoming = {m["to"] for m in moves}
    for bid, (f, b) in blocks.items():
        kind = cat_by_id.get(b.get("category"), {}).get("kind")
        if f.get("side") == "before" and bid not in outgoing and kind != "removed":
            rep.warn(f"block {bid!r}: before-side block has no move; add one or give it a 'removed' category")
        if f.get("side") == "after" and bid not in incoming and kind != "new":
            rep.warn(f"block {bid!r}: after-side block has no source; add a move or give it a 'new' category")
        if f.get("side") == "after" and kind == "removed":
            rep.error(f"block {bid!r}: 'removed' blocks belong on the before side")
    for side in ("before", "after"):
        if not any(f.get("side") == side for f in files if isinstance(f, dict)):
            rep.error(f"no files on the {side!r} side")

    table = data.get("table")
    if table is not None:
        if not isinstance(table, dict):
            rep.error("`table` must be an object")
        else:
            cols = table.get("columns")
            if cols is not None and (not isinstance(cols, list) or len(cols) != 5):
                rep.error("table.columns must be a list of 5 headings")
            rows = table.get("rows")
            if rows is not None:
                if not isinstance(rows, list):
                    rep.error("table.rows must be a list")
                    rows = []
                for i, r in enumerate(rows):
                    if not isinstance(r, dict) or not isinstance(r.get("code"), str):
                        rep.error(f"table.rows[{i}]: needs at least a `code` string")
                    elif r.get("category") not in cat_by_id:
                        rep.error(f"table.rows[{i}]: unknown category {r.get('category')!r}")

    diagram = data.get("diagram")
    if diagram is not None and (not isinstance(diagram, dict) or not isinstance(diagram.get("source"), str)):
        rep.error("`diagram` must be an object with a `source` string (Mermaid)")

    for key in ("scale", "minHeight"):
        if key in data and not isinstance(data[key], (int, float)):
            rep.error(f"`{key}` must be a number")

    if "footnote" not in data:
        refs = []
        for side in ("before", "after"):
            s = data.get(side) or {}
            ref, sha = s.get("ref"), s.get("sha")
            if ref and sha:
                refs.append(f"`{ref}` at `{sha}` ({side})")
            elif ref or sha:
                refs.append(f"`{ref or sha}` ({side})")
        if refs:
            data["footnote"] = "Line numbers are from " + " and ".join(refs) + "."
    return blocks


def check_against_repo(data, repo, rep):
    for f in data.get("files", []):
        if not isinstance(f, dict) or not isinstance(f.get("path"), str):
            continue
        side = data.get(f.get("side")) or {}
        rev = f.get("rev") or side.get("sha") or side.get("ref")
        if not rev:
            rep.error(f"file {f['path']!r}: --repo needs `{f.get('side')}.ref` or `.sha` (or a per-file `rev`)")
            continue
        res = subprocess.run(["git", "-C", repo, "show", f"{rev}:{f['path']}"], capture_output=True)
        if res.returncode != 0:
            rep.error(f"file {f['path']!r}: not found at {rev}: {res.stderr.decode(errors='replace').strip()}")
            continue
        text = res.stdout.decode(errors="replace").splitlines()
        if f.get("lines") is not None and f["lines"] != len(text):
            rep.error(f"file {f['path']!r} at {rev}: `lines` is {f['lines']} but git has {len(text)}")
        for b in f.get("blocks", []):
            if not isinstance(b, dict) or not is_int(b.get("end")) or not is_int(b.get("start")):
                continue
            if b["end"] > len(text):
                rep.error(f"block {b.get('id')!r}: ends at {b['end']} but {f['path']} has {len(text)} lines at {rev}")
                continue
            anchor = b.get("anchor")
            if anchor and anchor not in text[b["start"] - 1]:
                rep.error(
                    f"block {b.get('id')!r}: anchor {anchor!r} not on line {b['start']} of {f['path']}@{rev} "
                    f"(line is {text[b['start'] - 1].strip()[:80]!r})"
                )


def render(data):
    template = TEMPLATE.read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False, indent=1)
    payload = payload.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    title = re.sub(r"[`*]", "", data["title"])
    out = template.replace("__CMM_TITLE__", escape(title), 1)
    marker = "/*__CMM_DATA__*/"
    if marker not in out:
        raise SystemExit("template is missing the data marker")
    return out.replace(marker, payload, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data")
    ap.add_argument("-o", "--out")
    ap.add_argument("--repo")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--open", action="store_true")
    args = ap.parse_args()

    try:
        data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"error: cannot read {args.data}: {e}", file=sys.stderr)
        return 2

    rep = Report()
    normalize_and_validate(data, rep)
    if args.repo and not rep.errors:
        check_against_repo(data, args.repo, rep)
    for w in rep.warnings:
        print(f"warning: {w}", file=sys.stderr)
    for e in rep.errors:
        print(f"error: {e}", file=sys.stderr)
    if rep.errors or (args.strict and rep.warnings):
        print(f"not rendered: {len(rep.errors)} error(s), {len(rep.warnings)} warning(s)", file=sys.stderr)
        return 1

    out = Path(args.out) if args.out else Path(args.data).with_suffix(".html")
    out.write_text(render(data), encoding="utf-8")
    n_blocks = sum(len(f["blocks"]) for f in data["files"])
    print(f"wrote {out.resolve()} ({len(data['files'])} files, {n_blocks} blocks, {len(data['moves'])} arrows, "
          f"{len(rep.warnings)} warning(s))")
    if args.open:
        opener = "open" if sys.platform == "darwin" else "xdg-open"
        subprocess.run([opener, str(out)], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
