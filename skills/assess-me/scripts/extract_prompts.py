#!/usr/bin/env python3
"""Extract a user's recent prose prompts from a coding agent's local session
transcripts, for the assess-me skill.

Host-agnostic: supports Claude Code, Codex, cursor-agent, opencode, and pi.
Reads LOCAL FILES ONLY — no network. Python 3 standard library only.

Only the user's typed prose is kept; tool results, slash-command echoes,
continuation/compaction summaries, and interrupt markers are filtered out.

Usage:
  extract_prompts.py [--host auto|claude|codex|cursor|opencode|pi]
                     [--last N] [--since YYYY-MM-DD] [--path PATH] [--out FILE]

--host   which host's store to read; "auto" scans every known store present.
--last   most-recent N sessions (session-grouped stores); for flat prompt logs
         it caps to the most-recent N*20 prompts. Default 20.
--since  only sessions whose file mtime is on/after this ISO date (file stores).
--path   override the store location for the chosen host.
--out    write JSON here (default: stdout).

Emits JSON: {hosts:[...], n_prompts, prompts:[{host,session,ts,prompt,words}, ...]}
"""
import argparse, glob, json, os, re, sqlite3, sys, datetime as dt

MAXLEN = 1000  # truncate each stored prompt

def is_prose(s):
    s = (s or "").strip()
    if not s:
        return False
    if s.startswith("<"):                      # <command-name>/<system-reminder>/tool-result wrappers
        return False
    if s.startswith("[Request interrupted"):
        return False
    if s.startswith("This session is being continued"):
        return False
    if re.fullmatch(r"/[\w:.-]+", s):          # a bare slash command like /exit, /clear, /pr
        return False
    return True

def row(host, session, ts, text):
    text = text.strip()
    return {"host": host, "session": session, "ts": ts,
            "prompt": text[:MAXLEN], "words": len(text.split())}

def since_epoch(s):
    return dt.datetime.strptime(s, "%Y-%m-%d").timestamp() if s else None

# ---- per-host adapters: each returns a list of rows (newest last) ----

def from_claude(path, last, since):
    base = path or os.path.expanduser("~/.claude/projects/*/*.jsonl")
    files = glob.glob(base)
    lo = since_epoch(since)
    files = [f for f in files if lo is None or os.path.getmtime(f) >= lo]
    files.sort(key=os.path.getmtime)
    if last:
        files = files[-last:]
    out = []
    for fp in files:
        sess = os.path.basename(fp)[:8]
        for line in _lines(fp):
            o = _json(line)
            if not o or o.get("type") != "user":
                continue
            c = o.get("message", {}).get("content")
            if isinstance(c, str) and is_prose(c):
                out.append(row("claude", sess, o.get("timestamp"), c))
    return out

def from_codex(path, last, since):
    # Prefer the flat prompt log; fall back to session rollout files.
    hist = path or os.path.expanduser("~/.codex/history.jsonl")
    out = []
    if os.path.exists(hist):
        seen_sessions = []
        rows = []
        for line in _lines(hist):
            o = _json(line)
            if not o:
                continue
            text = o.get("text", "")
            if not is_prose(text):
                continue
            sess = str(o.get("session_id", ""))[:8]
            rows.append(row("codex", sess, o.get("ts"), text))
        if last:
            rows = rows[-(last * 20):]
        return rows
    # fallback: rollout session files
    files = glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/rollout-*.jsonl"))
    lo = since_epoch(since)
    files = [f for f in files if lo is None or os.path.getmtime(f) >= lo]
    files.sort(key=os.path.getmtime)
    if last:
        files = files[-last:]
    for fp in files:
        sess = os.path.basename(fp).split("-")[-1][:8]
        for line in _lines(fp):
            o = _json(line)
            pay = (o or {}).get("payload", {})
            if pay.get("type") == "message" and pay.get("role") == "user":
                for blk in pay.get("content", []):
                    if isinstance(blk, dict) and blk.get("type") == "input_text" and is_prose(blk.get("text", "")):
                        out.append(row("codex", sess, pay.get("timestamp"), blk["text"]))
    return out

def from_cursor(path, last, since):
    hist = path or os.path.expanduser("~/.cursor/prompt_history.json")
    if not os.path.exists(hist):
        return []
    try:
        arr = json.load(open(hist, encoding="utf-8"))
    except Exception:
        return []
    rows = [row("cursor", "prompt_history", None, s) for s in arr if isinstance(s, str) and is_prose(s)]
    if last:
        rows = rows[-(last * 20):]
    return rows

def from_opencode(path, last, since):
    db = path or os.path.expanduser("~/.local/share/opencode/opencode.db")
    if not os.path.exists(db):
        return []
    out = []
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        q = ("SELECT p.data, m.session_id FROM part p JOIN message m ON p.message_id = m.id "
             "WHERE json_extract(p.data,'$.type')='text' AND json_extract(m.data,'$.role')='user'")
        for data, sess in con.execute(q):
            try:
                text = json.loads(data).get("text", "")
            except Exception:
                continue
            if is_prose(text):
                out.append(row("opencode", str(sess)[:8], None, text))
        con.close()
    except Exception as e:
        sys.stderr.write(f"opencode: could not read {db}: {e}\n")
        return []
    if last:
        out = out[-(last * 20):]
    return out

def from_pi(path, last, since):
    base = path or os.path.expanduser("~/.pi/agent/sessions/*/*.jsonl")
    files = glob.glob(base)
    lo = since_epoch(since)
    files = [f for f in files if lo is None or os.path.getmtime(f) >= lo]
    files.sort(key=os.path.getmtime)
    if last:
        files = files[-last:]
    out = []
    for fp in files:
        sess = os.path.basename(fp)[:8]
        for line in _lines(fp):
            o = _json(line)
            if not o or o.get("type") != "user":
                continue
            text = o.get("text") or o.get("content") or (o.get("message", {}) if isinstance(o.get("message"), str) else "")
            if isinstance(text, dict):
                text = text.get("content", "")
            if isinstance(text, str) and is_prose(text):
                out.append(row("pi", sess, o.get("timestamp"), text))
    return out

ADAPTERS = {"claude": from_claude, "codex": from_codex, "cursor": from_cursor,
            "opencode": from_opencode, "pi": from_pi}

def _lines(fp):
    try:
        with open(fp, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    yield line
    except OSError:
        return

def _json(line):
    try:
        return json.loads(line)
    except Exception:
        return None

def present_hosts():
    checks = {
        "claude": "~/.claude/projects",
        "codex": "~/.codex/history.jsonl",
        "cursor": "~/.cursor/prompt_history.json",
        "opencode": "~/.local/share/opencode/opencode.db",
        "pi": "~/.pi/agent/sessions",
    }
    return [h for h, p in checks.items() if os.path.exists(os.path.expanduser(p))]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="auto", choices=["auto"] + list(ADAPTERS))
    ap.add_argument("--last", type=int, default=20)
    ap.add_argument("--since", default=None)
    ap.add_argument("--path", default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    hosts = present_hosts() if a.host == "auto" else [a.host]
    prompts = []
    for h in hosts:
        prompts += ADAPTERS[h](a.path, a.last, a.since)

    result = {"hosts": hosts, "n_prompts": len(prompts), "prompts": prompts}
    payload = json.dumps(result, indent=0)
    if a.out:
        open(a.out, "w").write(payload)
        print(f"hosts: {hosts or 'none found'}  prompts: {len(prompts)}  wrote {a.out}")
    else:
        print(payload)

if __name__ == "__main__":
    main()
