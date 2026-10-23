#!/usr/bin/env python3
"""Build a PR roadmap map page from a plan file and fetched PR data.

Usage: build.py PLAN.json DATA_DIR OUT.html [--template PATH] [--report]

Everything that can be derived is derived here, deterministically:
layout (columns from dependencies, slots within a track), PR state, CI state,
stack structure (base branch = another tracked PR's head), each stack's progress,
step status, what each step waits on and unlocks, and the canned answers the
page's "Ask the map" panel shows. The page's script only renders this model.

--report prints the same answers as plain text, for a terminal summary.
"""
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TEMPLATE = os.path.join(HERE, '..', 'templates', 'roadmap.html')
FAIL = {'FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'}
PENDING = {'PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', 'WAITING', 'REQUESTED'}
SKIP = {'SKIPPED', 'NEUTRAL'}
# Step states: done, progress, todo. Derived from PRs; the plan can only set `done` (settled
# without a PR, e.g. a decision) or `open` (more work planned after merged PRs, or started with no PR).
DONE = {'done'}
OPEN_STEP = {'progress'}


class PlanError(Exception):
    pass


def group_names(names):
    counts = defaultdict(int)
    for n in names:
        counts[re.sub(r'\s*\(.*\)$', '', n)] += 1
    return [f'{k} ({v} jobs)' if v > 1 else k for k, v in counts.items()]


def summarize_pr(raw, meta_checks):
    fails, pend, total, meta_fail = [], [], 0, []
    for ch in raw.get('statusCheckRollup') or []:
        name = ch.get('name') or ch.get('context') or '?'
        st = (ch.get('conclusion') or ch.get('state') or ch.get('status') or '').upper()
        if st in SKIP:
            continue
        if name in meta_checks:
            if st in FAIL:
                meta_fail.append(meta_checks[name])
            continue
        total += 1
        if st in FAIL:
            fails.append(name)
        elif st in PENDING or st == '':
            pend.append(name)
    ci = 'none' if total == 0 else 'fail' if fails else 'pending' if pend else 'pass'
    state = raw['state'].lower()
    review = (raw.get('reviewDecision') or '').lower() or None
    if state == 'merged':
        kind = 'merged'
    elif state == 'closed':
        kind = 'closed'
    elif raw['isDraft']:
        kind = 'draft'
    else:
        kind = 'open'
    return {
        'n': raw['number'], 'title': raw['title'], 'url': raw['url'], 'author': raw['author']['login'],
        'state': state, 'kind': kind, 'review': review, 'base': raw['baseRefName'], 'head': raw['headRefName'],
        'mergedAt': raw.get('mergedAt'), 'ci': ci, 'ciTotal': total, 'ciFailed': group_names(fails),
        'ciFailCount': len(fails), 'ciPendingCount': len(pend), 'metaFailed': sorted(set(meta_fail)),
    }


def load_plan(plan):
    steps = plan['steps']
    ids = [s['id'] for s in steps]
    if len(set(ids)) != len(ids):
        raise PlanError('duplicate step ids')
    if 'end' in ids:
        raise PlanError('"end" is reserved for the goal')
    track_ids = [t['id'] for t in plan['tracks']]
    by_id = {s['id']: s for s in steps}
    for s in steps:
        for d in s.get('deps', []):
            if d not in by_id:
                raise PlanError(f"step {s['id']} depends on unknown step {d}")
        if s['track'] not in track_ids:
            raise PlanError(f"step {s['id']} has unknown track {s['track']}")
        if 'status' in s:
            raise PlanError(f"step {s['id']}: `status` is gone; state comes from PRs. Use `done: true` for a step "
                            "settled without a PR, or `open: true` for one with more work planned")
        if s.get('done') and s.get('open'):
            raise PlanError(f"step {s['id']} cannot be both done and open")
    for d in plan.get('goal', {}).get('deps', []):
        if d not in by_id:
            raise PlanError(f'goal depends on unknown step {d}')
    seen, stack = set(), set()

    def visit(i):
        if i in stack:
            raise PlanError(f'dependency cycle through {i}')
        if i in seen:
            return
        stack.add(i)
        for d in by_id[i].get('deps', []):
            visit(d)
        stack.discard(i)
        seen.add(i)
    for i in ids:
        visit(i)
    return by_id


def layout(plan, by_id):
    col = {}

    def col_of(i):
        if i not in col:
            s = by_id[i]
            col[i] = s['col'] if 'col' in s else (max((col_of(d) for d in s.get('deps', [])), default=-1) + 1)
        return col[i]
    for i in by_id:
        col_of(i)
    taken = defaultdict(set)
    for s in plan['steps']:
        if 'slot' in s:
            taken[(s['track'], col[s['id']])].add(s['slot'])
    slot = {}
    for s in plan['steps']:
        key = (s['track'], col[s['id']])
        if 'slot' in s:
            slot[s['id']] = s['slot']
        else:
            k = 0
            while k in taken[key]:
                k += 1
            taken[key].add(k)
            slot[s['id']] = k
    tracks, offset = [], 0
    for t in plan['tracks']:
        n = max([slot[s['id']] + 1 for s in plan['steps'] if s['track'] == t['id']] or [1])
        tracks.append({'id': t['id'], 'label': t['label'], 'row': offset, 'rows': n})
        offset += n
    row_of_track = {t['id']: t['row'] for t in tracks}
    rows = {i: row_of_track[by_id[i]['track']] + slot[i] for i in by_id}
    return col, rows, tracks, offset


def build_model(plan, data_dir):
    by_id = load_plan(plan)
    raw = json.load(open(os.path.join(data_dir, 'prs.json')))
    fetch = json.load(open(os.path.join(data_dir, 'fetch.json'))) if os.path.exists(os.path.join(data_dir, 'fetch.json')) else {}
    meta_checks = plan.get('metaChecks', {})
    base_branch = plan.get('baseBranch', 'main')
    prs = {}
    for n, r in raw.items():
        prs[int(n)] = summarize_pr(r, meta_checks)

    pr_step = {}
    for s in plan['steps']:
        for n in s.get('prs', []):
            if n in pr_step:
                raise PlanError(f'PR #{n} is listed in both {pr_step[n]} and {s["id"]}')
            if n not in prs:
                raise PlanError(f'PR #{n} (step {s["id"]}) has no fetched data; run fetch.py')
            pr_step[n] = s['id']
    for s in plan['steps']:
        for r in s.get('related', []) + s.get('parts', []):
            if r.get('pr') and r['pr'] not in prs:
                raise PlanError(f'PR #{r["pr"]} (step {s["id"]}) has no fetched data; run fetch.py')
    tracked = list(pr_step)

    # Stacks: a tracked PR whose base branch is another tracked PR's head branch is stacked on it.
    by_head = {prs[n]['head']: n for n in tracked}
    parent = {n: (by_head.get(prs[n]['base']) if by_head.get(prs[n]['base']) != n else None) for n in tracked}
    children = defaultdict(list)
    for n in tracked:
        if parent[n]:
            children[parent[n]].append(n)
    chains = []
    for root in sorted((n for n in tracked if not parent[n]), key=lambda n: tracked.index(n)):
        c, cur = [root], root
        while children[cur]:
            cur = sorted(children[cur])[0]
            c.append(cur)
        chains.append(c)
    # GitHub retargets a stacked PR to the base branch once its parent merges, which breaks the
    # branch link. A merged PR listed just before a chain's root in the same step counts as that
    # chain's history, so a stack's progress keeps its merged PRs.
    chain_of = {n: c for c in chains for n in c}
    for c in list(chains):
        if not any(c is x for x in chains):
            continue
        while True:
            root = c[0]
            lst = by_id[pr_step[root]]['prs']
            i = lst.index(root)
            prev = lst[i - 1] if i > 0 else None
            if prev and prs[prev]['kind'] == 'merged' and len(chain_of[prev]) == 1 and chain_of[prev] is not c and prs[root]['base'] == base_branch:
                chains.remove(chain_of[prev])
                c.insert(0, prev)
                chain_of[prev] = c
            else:
                break
    stacks = []
    for c in chains:
        if len(c) < 2:
            continue
        sid = f's{c[0]}'
        segs = []
        for n in c:
            if not segs or segs[-1]['step'] != pr_step[n]:
                segs.append({'step': pr_step[n], 'prs': []})
            segs[-1]['prs'].append(n)
        open_prs = [n for n in c if prs[n]['state'] == 'open']
        stacks.append({'id': sid, 'prs': c, 'segments': segs, 'total': len(c),
                       'merged': sum(prs[n]['kind'] == 'merged' for n in c),
                       'drafts': sum(prs[n]['kind'] == 'draft' for n in c),
                       'next': open_prs[0] if open_prs else None, 'tip': c[-1]})
    stack_of = {n: s['id'] for s in stacks for n in s['prs']}

    for n in tracked:
        p = prs[n]
        p['step'] = pr_step[n]
        p['parent'] = parent[n]
        p['children'] = sorted(children[n])
        if n in stack_of:
            st = next(s for s in stacks if s['id'] == stack_of[n])
            p['stack'] = st['id']
            p['pos'] = st['prs'].index(n) + 1
        blockers = []
        if p['state'] == 'open':
            par = parent[n]
            if par and prs[par]['state'] == 'open':
                blockers.append({'k': 'base', 't': f'base #{par} not merged', 'pr': par})
            elif par and prs[par]['kind'] == 'merged':
                blockers.append({'k': 'base', 't': f'retarget base (#{par} merged)', 'pr': par})
            elif not par and p['base'] != base_branch:
                blockers.append({'k': 'base', 't': f'base is {p["base"]}'})
            if p['kind'] == 'draft':
                blockers.append({'k': 'draft', 't': 'draft'})
            if p['review'] == 'changes_requested':
                blockers.append({'k': 'review', 't': 'changes requested'})
            elif p['review'] != 'approved':
                blockers.append({'k': 'review', 't': 'needs approval'})
            if p['ci'] == 'fail':
                blockers.append({'k': 'ci', 't': 'CI failing'})
            elif p['ci'] == 'pending':
                blockers.append({'k': 'ci', 't': 'CI running'})
            elif p['ci'] == 'none':
                blockers.append({'k': 'ci', 't': 'CI not run'})
            for m in p['metaFailed']:
                blockers.append({'k': 'check', 't': f'{m} check'})
        p['blockers'] = blockers

    col, rows, tracks, total_rows = layout(plan, by_id)
    steps = []
    unlocks = defaultdict(list)
    for s in plan['steps']:
        for d in s.get('deps', []):
            unlocks[d].append(s['id'])
    goal = plan.get('goal', {})
    goal_deps = goal.get('deps') or [s['id'] for s in plan['steps'] if not unlocks[s['id']]]
    for d in goal_deps:
        unlocks[d].append('end')

    def status_of(s):
        kinds = [prs[n]['kind'] for n in s.get('prs', [])]
        if s.get('done'):
            return 'done'
        if s.get('open') or any(k in ('open', 'draft') for k in kinds):
            return 'progress'
        if any(k == 'merged' for k in kinds):
            return 'done'
        return 'todo'

    status = {s['id']: status_of(s) for s in plan['steps']}
    deps_of = {s['id']: s.get('deps', []) for s in plan['steps']}
    deps_of['end'] = goal_deps
    status['end'] = 'goal'

    def ancestors(i, seen=None):
        seen = set() if seen is None else seen
        for d in deps_of[i]:
            if d not in seen:
                seen.add(d)
                ancestors(d, seen)
        return seen

    def waiting_on(i):
        return [d for d in deps_of[i] if status[d] not in DONE]

    for s in plan['steps']:
        i = s['id']
        own = s.get('prs', [])
        st_ids = sorted({prs[n]['stack'] for n in own if 'stack' in prs[n]})
        pos = [prs[n]['pos'] for n in own if 'pos' in prs[n]]
        steps.append({
            'id': i, 'label': s.get('label', ''), 'title': s['title'], 'track': s['track'], 'story': s.get('story'),
            'prs': own, 'deps': deps_of[i], 'unlocks': unlocks[i], 'status': status[i],
            'col': col[i], 'row': rows[i], 'what': s.get('what', ''), 'why': s.get('why', ''),
            'parts': s.get('parts', []), 'related': s.get('related', []), 'links': s.get('links', []),
            'waitingOn': waiting_on(i),
            'openUpstream': sorted(a for a in ancestors(i) if status[a] not in DONE),
            'marker': ('blocked' if waiting_on(i) else ('ready' if status[i] == 'todo' else None)) if status[i] != 'done' else None,
            'stack': ({'id': st_ids[0], 'lo': min(pos), 'hi': max(pos),
                       'total': next(x['total'] for x in stacks if x['id'] == st_ids[0])} if st_ids else None),
            'merged': sum(prs[n]['kind'] == 'merged' for n in own),
        })
    end_col = max(col.values()) + 1
    steps.append({'id': 'end', 'label': 'Goal', 'title': goal.get('title', 'Goal'), 'track': None, 'story': None,
                  'prs': [], 'deps': goal_deps, 'unlocks': [], 'status': 'goal', 'marker': None, 'col': end_col, 'row': 0,
                  'what': goal.get('what', ''), 'why': '', 'parts': [], 'related': goal.get('related', []),
                  'links': goal.get('links', []), 'waitingOn': [d for d in goal_deps if status[d] not in DONE],
                  'openUpstream': sorted(a for a in ancestors('end') if status[a] not in DONE), 'stack': None, 'merged': 0})
    sb = {s['id']: s for s in steps}

    # Stack edges: the target step has a PR whose parent PR belongs to the source step.
    stack_edges = sorted({f"{pr_step[prs[n]['parent']]}>{pr_step[n]}" for n in tracked
                          if prs[n].get('parent') and pr_step[prs[n]['parent']] != pr_step[n]})

    def startable(assume_open_merged):
        ok = DONE | (OPEN_STEP if assume_open_merged else set())
        return [s['id'] for s in steps if s['status'] == 'todo' and all(status[d] in ok for d in s['deps'])]

    memo = {}

    def longest(i):
        if i not in memo:
            best = []
            for d in deps_of[i]:
                p = longest(d)
                if len(p) > len(best):
                    best = p
            memo[i] = best if status[i] in DONE else best + [i]
        return memo[i]

    open_tracked = [n for n in tracked if prs[n]['state'] == 'open']
    now = startable(False)
    answers = {
        'next': [n for n in open_tracked if not prs[n]['blockers']],
        'front': [n for n in open_tracked if prs[n]['blockers'] and not any(b['k'] == 'base' for b in prs[n]['blockers'])],
        'blocked': [{'step': s['id'], 'on': s['waitingOn']} for s in steps
                    if s['waitingOn'] and s['status'] not in DONE and s['id'] != 'end'],
        'drafts': [n for n in open_tracked if prs[n]['kind'] == 'draft'],
        'ciFail': [n for n in open_tracked if prs[n]['ci'] == 'fail'],
        'ciPending': [n for n in open_tracked if prs[n]['ci'] in ('pending', 'none')],
        'checks': [n for n in open_tracked if prs[n]['metaFailed']],
        'review': [n for n in open_tracked if prs[n]['kind'] == 'open' and prs[n]['review'] != 'approved'],
        'stacks': [s['id'] for s in stacks],
        'start': now,
        'soon': [i for i in startable(True) if i not in now],
        'chain': longest('end'),
    }
    labels = {str(k): v for k, v in plan.get('prLabels', {}).items()}
    for n, p in prs.items():
        p['label'] = labels.get(str(n)) or re.sub(r'\s*\[[^\]]+\]\s*$', '', p['title'])
    return {
        'meta': {k: plan.get(k) for k in ('title', 'eyebrow', 'subtitle', 'repo', 'baseBranch', 'storyUrl', 'storyPrefix')},
        'asOf': fetch.get('fetchedAt'), 'untracked': fetch.get('untracked', []),
        'tracks': tracks, 'rows': total_rows, 'cols': end_col + 1,
        'steps': steps, 'prs': {str(k): v for k, v in prs.items()}, 'tracked': tracked,
        'stacks': stacks, 'stackEdges': stack_edges, 'answers': answers,
    }, sb


def report(model, sb):
    P = model['prs']
    A = model['answers']
    lab = lambda n: f"#{n} {P[str(n)]['label']}"
    why = lambda n: ', '.join(b['t'] for b in P[str(n)]['blockers'])
    title = lambda i: sb[i]['title']
    out = [f"{model['meta']['title']} · data as of {model['asOf']}"]
    out.append('Next to land: ' + (', '.join(lab(n) for n in A['next']) or 'nothing ready'))
    for n in A['front']:
        out.append(f'  front of line {lab(n)}: {why(n)}')
    for s in model['stacks']:
        out.append(f"Stack {s['prs'][0]}…{s['tip']}: {s['merged']}/{s['total']} merged, {s['drafts']} drafts, next #{s['next']}")
    out.append('CI failing: ' + (', '.join(lab(n) for n in A['ciFail']) or 'none'))
    out.append('CI running or not run: ' + (', '.join(f'#{n}' for n in A['ciPending']) or 'none'))
    out.append('Drafts: ' + (', '.join(f'#{n}' for n in A['drafts']) or 'none'))
    out.append('Awaiting review: ' + (', '.join(f'#{n}' for n in A['review']) or 'none'))
    for b in A['blocked']:
        out.append(f"Blocked: {title(b['step'])} waits on {', '.join(title(x) for x in b['on'])}")
    out.append('Can start now: ' + (', '.join(title(i) for i in A['start']) or 'nothing'))
    out.append('Longest chain: ' + ' → '.join(title(i) for i in A['chain']))
    for u in model['untracked']:
        out.append(f"Untracked PR #{u['number']} ({u['why']}): {u['title']}")
    return '\n'.join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    tpl_path = DEFAULT_TEMPLATE
    if '--template' in sys.argv:
        tpl_path = sys.argv[sys.argv.index('--template') + 1]
        args.remove(tpl_path)
    if len(args) != 3:
        sys.exit(__doc__)
    plan_path, data_dir, out_path = args
    try:
        model, sb = build_model(json.load(open(plan_path)), data_dir)
    except PlanError as e:
        sys.exit(f'plan error: {e}')
    blob = json.dumps(model, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    tpl = open(tpl_path).read()
    if tpl.count('__ROADMAP_DATA__') != 1 or tpl.count('__ROADMAP_TITLE__') != 1:
        sys.exit('template must contain __ROADMAP_DATA__ and __ROADMAP_TITLE__ exactly once')
    esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    html = tpl.replace('__ROADMAP_TITLE__', esc(model['meta']['title'] or 'PR Roadmap')).replace('__ROADMAP_DATA__', blob)
    open(out_path, 'w').write(html)
    print(f"wrote {out_path} ({len(html):,} bytes): {len(model['steps']) - 1} steps, {len(model['tracked'])} tracked PRs, {len(model['stacks'])} stacks")
    if '--report' in sys.argv:
        print(report(model, sb))


if __name__ == '__main__':
    main()
