#!/usr/bin/env python3
"""Fetch GitHub PR data for every PR a roadmap plan references, read-only.

Usage: fetch.py PLAN.json DATA_DIR [--no-discover]

Writes DATA_DIR/prs.json ({number: gh pr view JSON}) and DATA_DIR/fetch.json
(fetch time, repo, and any PRs the plan does not track yet). Story ids need no
fetch: the page links them through the plan's storyUrl template.

Discovery (on by default) lists open PRs with `gh pr list` using the plan's
`discover` block and reports two kinds of untracked PR:
  - stacked: its base branch is the head branch of a tracked PR
  - matching: it matches the discover search but is not in the plan
The plan is never edited; add what you want tracked by hand.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

FIELDS = 'number,title,state,isDraft,reviewDecision,baseRefName,headRefName,mergedAt,statusCheckRollup,url,author'
LIST_FIELDS = 'number,title,state,isDraft,baseRefName,headRefName,url'


def gh(args):
    out = subprocess.run(['gh', *args], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {out.stderr.strip()}")
    return json.loads(out.stdout)


def referenced_prs(plan):
    nums = []
    for s in plan['steps']:
        nums += s.get('prs', [])
        nums += [r['pr'] for r in s.get('related', []) if r.get('pr')]
        nums += [p['pr'] for p in s.get('parts', []) if p.get('pr')]
    nums += [r['pr'] for r in plan.get('goal', {}).get('related', []) if r.get('pr')]
    return sorted(set(nums))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        sys.exit(__doc__)
    plan_path, data_dir = args
    discover = '--no-discover' not in sys.argv
    plan = json.load(open(plan_path))
    repo = plan['repo']
    os.makedirs(data_dir, exist_ok=True)

    nums = referenced_prs(plan)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda n: gh(['pr', 'view', str(n), '--repo', repo, '--json', FIELDS]), nums))
    prs = {str(p['number']): p for p in results}
    json.dump(prs, open(os.path.join(data_dir, 'prs.json'), 'w'), indent=1)

    untracked = []
    if discover and plan.get('discover'):
        d = plan['discover']
        cmd = ['pr', 'list', '--repo', repo, '--state', d.get('state', 'open'), '--limit', str(d.get('limit', 100)),
               '--json', LIST_FIELDS]
        if d.get('author'):
            cmd += ['--author', d['author']]
        listed = gh(cmd)
        tracked = set(str(n) for s in plan['steps'] for n in s.get('prs', []))
        heads = {p['headRefName']: n for n, p in prs.items() if n in tracked}
        terms = [t.lower() for t in d.get('match', [])]
        for p in listed:
            if str(p['number']) in tracked:
                continue
            why = None
            if p['baseRefName'] in heads:
                why = f"stacked on #{heads[p['baseRefName']]}"
            elif terms and any(t in (p['title'] + ' ' + p['headRefName']).lower() for t in terms):
                why = 'matches discover.match'
            if why:
                untracked.append({'number': p['number'], 'title': p['title'], 'draft': p['isDraft'],
                                  'base': p['baseRefName'], 'head': p['headRefName'], 'why': why})

    meta = {'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'repo': repo,
            'prCount': len(prs), 'untracked': untracked}
    json.dump(meta, open(os.path.join(data_dir, 'fetch.json'), 'w'), indent=1)
    print(f"fetched {len(prs)} PRs from {repo} at {meta['fetchedAt']}")
    for u in untracked:
        print(f"  untracked #{u['number']} ({u['why']}{', draft' if u['draft'] else ''}): {u['title']}")


if __name__ == '__main__':
    main()
