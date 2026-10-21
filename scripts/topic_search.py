#!/usr/bin/env python3
"""
Topic search over the state vote library.

Starts from an issue instead of a legislator: scans every packed session in
ArtemisHera-data for roll calls whose bill title or vote description matches
any of the given phrases, then builds, for each matched bill, the full roll
call — every legislator's vote with party and district — plus a legislator
index ("the players") and universe matches for the topic.

    python scripts/topic_search.py --phrases "data center|data centers|high energy use facility" \
        --states VA,PA --from-year 2022 --out data/topics/tp-example.json

Data layout (per session): people.json (roster), rollcalls.json (one row per
roll call: [bill, title, date, question, result, chamber]) and votes.json
(people_id -> [[rollcall index, vote code], ...]). Only the sessions that match
have their vote files downloaded, so a nationwide scan is mostly rollcall files
(1-2 MB each).
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
import fetch_federal_votes as fv  # noqa: E402  (shared matching helpers)

DEFAULT_BASE = 'https://raw.githubusercontent.com/knunnenkamp25/ArtemisHera-data/main/data/state'
VOTE_CODES = {1: 'Yes', 2: 'No', 3: 'Present', 4: 'Not Voting'}
MAX_BILLS = 400          # keeps the result JSON a page can render
COMMITTEE_RE = re.compile(r'committee|reported from|subcommittee|reported out', re.I)
FLOOR_FRACTION = 0.5     # a floor vote records at least half the chamber; a committee never does
COMMITTEE_MAX_VOTERS = 12  # fallback when the chamber size is unknown


def load(base, path):
    """Read a JSON file from the data repo (URL) or a local copy (directory)."""
    if base.startswith('http'):
        # Session ids can carry spaces ("20232024 Special Session 2" in CA)
        quoted = '/'.join(urllib.parse.quote(seg) for seg in path.split('/'))
        req = urllib.request.Request(f'{base}/{quoted}', headers={'User-Agent': 'ArtemisHera/1.0'})
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read()
        return json.loads(body), len(body)
    with open(os.path.join(base, path), 'rb') as f:
        body = f.read()
    return json.loads(body), len(body)


def compile_phrases(phrases):
    """One regex per phrase: case-insensitive, whitespace-tolerant, word-bounded,
    optional plural on the last word ('data center' also hits 'data centers')."""
    out = []
    for p in phrases:
        p = p.strip()
        if not p:
            continue
        words = [re.escape(w) for w in p.split()]
        pat = r'\b' + r'\s+'.join(words) + r's?\b'
        out.append((p, re.compile(pat, re.I)))
    return out


def match_text(text, compiled):
    return [p for p, rx in compiled if rx.search(text or '')]


def is_committee(question, n_voters, chamber_size=0):
    """Open States often labels a committee roll call with nothing more than
    'S VOTE:', so the label alone is not enough: size the vote against the
    chamber. The Virginia Senate seats 40; a 15-member vote is a committee."""
    if chamber_size:
        # Size decides: 'Adopt Conference Committee Report' with the whole
        # chamber voting is a floor vote despite the word.
        return n_voters < chamber_size * FLOOR_FRACTION
    return bool(COMMITTEE_RE.search(question or '')) or n_voters < COMMITTEE_MAX_VOTERS


def chamber_sizes(people):
    """Members per chamber from the roster's role field (Senate / House / Assembly …)."""
    sizes = Counter()
    for p in people:
        role = (p.get('role') or '').strip()
        if role:
            sizes[role.lower()] += 1
    return sizes


def chamber_size_for(sizes, chamber):
    c = (chamber or '').strip().lower()
    if not c:
        return 0
    if c in sizes:
        return sizes[c]
    # 'upper'/'lower' or 'Senate' vs role 'Sen'; match on a shared prefix
    for role, n in sizes.items():
        if role.startswith(c[:3]) or c.startswith(role[:3]):
            return n
    if c == 'upper':
        return min(sizes.values()) if sizes else 0
    if c == 'lower':
        return max(sizes.values()) if sizes else 0
    return 0


def scan_session(base, state, sid, compiled):
    """Return (state, sid, matches, bytes) where matches maps rollcall index -> phrases hit."""
    try:
        rcs, nbytes = load(base, f'{state}/{sid}/rollcalls.json')
    except Exception as e:
        return state, sid, None, 0, str(e)[:120]
    hits = {}
    for i, rc in enumerate(rcs):
        found = match_text((rc[1] or '') + ' ' + (rc[3] or ''), compiled)
        if found:
            hits[i] = (rc, found)
    return state, sid, hits, nbytes, None


def build_bills(base, state, sid, session_name, hits, legislators):
    """Download the session's roster and vote map, build per-bill roll calls."""
    people, _ = load(base, f'{state}/{sid}/people.json')
    votes, _ = load(base, f'{state}/{sid}/votes.json')
    roster = {str(p['people_id']): p for p in people}
    sizes = chamber_sizes(people)
    wanted = set(hits)
    by_rc = defaultdict(list)          # rollcall index -> [(pid, code)]
    for pid, lst in votes.items():
        for idx, code in lst:
            if idx in wanted:
                by_rc[idx].append((pid, code))

    bills = {}
    for idx, (rc, phrases) in hits.items():
        bill_number, title, date, question, result, chamber = (list(rc) + [''] * 6)[:6]
        voters = by_rc.get(idx, [])
        tally = Counter(VOTE_CODES.get(code, 'Other') for _, code in voters)
        by_party = defaultdict(Counter)
        vote_rows = []
        for pid, code in voters:
            p = roster.get(pid, {})
            party = (p.get('party') or '').strip() or 'Unknown'
            v = VOTE_CODES.get(code, 'Other')
            by_party[party][v] += 1
            vote_rows.append({
                'people_id': pid, 'name': p.get('name', pid), 'party': party,
                'district': p.get('district', ''), 'role': p.get('role', ''), 'vote': v,
            })
        committee = is_committee(question, len(voters), chamber_size_for(sizes, chamber))
        entry = {
            'date': date, 'chamber': chamber, 'question': question, 'result': result,
            'committee': committee,
            'tally': {k: tally.get(k, 0) for k in ('Yes', 'No', 'Present', 'Not Voting')},
            'by_party': {party: dict(c) for party, c in sorted(by_party.items())},
            'votes': sorted(vote_rows, key=lambda r: (r['vote'], r['party'], r['name'])),
        }
        key = bill_number or f'rollcall-{idx}'
        b = bills.setdefault(key, {
            'state': state, 'session': sid, 'session_name': session_name,
            'bill': bill_number, 'title': title, 'phrases': [], 'rollcalls': [],
        })
        b['phrases'] = sorted(set(b['phrases']) | set(phrases))
        b['rollcalls'].append(entry)

        if not committee:
            for r in vote_rows:
                lk = f"{state}:{r['people_id']}"
                L = legislators.setdefault(lk, {
                    'state': state, 'people_id': r['people_id'], 'name': r['name'],
                    'party': r['party'], 'district': r['district'], 'role': r['role'],
                    'yes': 0, 'no': 0, 'other': 0, 'bills': set(),
                })
                L['yes' if r['vote'] == 'Yes' else 'no' if r['vote'] == 'No' else 'other'] += 1
                L['bills'].add(f'{state} {bill_number}')

    for b in bills.values():
        b['rollcalls'].sort(key=lambda r: (r['date'], r['chamber']))
        floor = [r for r in b['rollcalls'] if not r['committee']]
        b['first_date'] = b['rollcalls'][0]['date']
        b['last_date'] = b['rollcalls'][-1]['date']
        last = (floor or b['rollcalls'])[-1]
        b['last_result'] = last['result']
        b['chambers'] = sorted({r['chamber'] for r in b['rollcalls'] if r['chamber']})
        b['floor_rollcalls'] = len(floor)
    return list(bills.values())


def universe_matches(bills, topics):
    """Which universes the topic's bills touch — reuses the shared evidence rule."""
    records = [{
        'description': b['title'], 'keywords': fv.extract_keywords(b['bill'] + ' ' + b['title']),
        'member_vote': 'Yes' if b['last_result'].lower().startswith('pass') else 'No',
    } for b in bills]
    out = fv.match_topics(records, topics)
    for t in out:
        t['bills'] = t.pop('total')
        t['passed'] = t.pop('yes')
        t['failed'] = t.pop('no')
        t.pop('other', None)
    return out


def keyword_cloud(bills, topics):
    """News-style keyword list so Hera's theme path can read a topic project."""
    counts = Counter()
    for b in bills:
        for w in fv.extract_keywords(b['title']):
            counts[w] += 1
    out = []
    for w, n in counts.most_common(150):
        if n < 2:
            break
        best, score = None, None
        for model, patterns in topics.items():
            tier = fv.score_tier(w, patterns)
            if tier:
                s = {'primary': 1.0, 'secondary': 0.75, 'tertiary': 0.5}[tier]
                if score is None or s > score:
                    best, score = model, s
        out.append({'word': w, 'count': n, 'universe_match': best, 'universe_score': score})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--phrases', required=True, help='Pipe-separated phrases, e.g. "data center|high energy use facility"')
    ap.add_argument('--states', default='', help='Comma-separated state abbreviations (empty = all)')
    ap.add_argument('--from-year', type=int, default=2022)
    ap.add_argument('--to-year', type=int, default=9999)
    ap.add_argument('--base', default=DEFAULT_BASE, help='Data repo URL or a local data/state directory')
    ap.add_argument('--workers', type=int, default=12)
    ap.add_argument('--project-id', default='')
    ap.add_argument('--name', default='')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    phrases = [p for p in args.phrases.split('|') if p.strip()]
    compiled = compile_phrases(phrases)
    if not compiled:
        raise SystemExit('No phrases given')
    states = {s.strip().upper() for s in args.states.split(',') if s.strip()}
    topics = fv.load_matching()

    t0 = time.time()
    sessions, _ = load(args.base, 'sessions.json')
    targets = []
    for st, entry in sessions.items():
        if states and st not in states:
            continue
        for s in entry['sessions']:
            if s['year_end'] >= args.from_year and s['year_start'] <= args.to_year:
                targets.append((st, s['id'], s.get('name', s['id'])))
    print(f'Scanning {len(targets)} sessions for {phrases} …', file=sys.stderr)

    matched, errors, scanned_bytes, scanned_rc = {}, [], 0, 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for (st, sid, hits, nbytes, err) in pool.map(lambda t: scan_session(args.base, t[0], t[1], compiled), targets):
            if err:
                errors.append(f'{st}/{sid}: {err}')
                continue
            scanned_bytes += nbytes
            if hits:
                matched[(st, sid)] = hits
    names = {(st, sid): name for st, sid, name in targets}
    print(f'  {len(matched)} sessions matched ({scanned_bytes/1e6:.0f} MB scanned, '
          f'{time.time()-t0:.0f}s); {len(errors)} errors', file=sys.stderr)

    legislators = {}
    bills = []
    def build(item):
        (st, sid), hits = item
        try:
            return build_bills(args.base, st, sid, names[(st, sid)], hits, legislators)
        except Exception as e:
            errors.append(f'{st}/{sid} votes: {str(e)[:120]}')
            return []
    # Legislator index is shared across threads: build sequentially per session
    # but fetch in parallel would need locking; sessions are few, so keep it simple.
    for item in sorted(matched.items()):
        bills.extend(build(item))
        print(f'  {item[0][0]} {item[0][1]}: {len(matched[item[0]])} roll calls', file=sys.stderr)

    bills.sort(key=lambda b: (b['state'], b['first_date'], b['bill']))
    truncated = len(bills) > MAX_BILLS
    bills = bills[:MAX_BILLS]

    legis_out = []
    for L in legislators.values():
        L['bills'] = sorted(L['bills'])
        L['votes'] = L['yes'] + L['no'] + L['other']
        legis_out.append(L)
    legis_out.sort(key=lambda L: (-L['votes'], -abs(L['yes'] - L['no']), L['name']))

    payload = {
        'meta': {
            'project_id': args.project_id, 'name': args.name,
            'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'phrases': phrases, 'states': sorted(states) if states else [],
            'from_year': args.from_year, 'to_year': None if args.to_year == 9999 else args.to_year,
            'sessions_scanned': len(targets), 'sessions_matched': len(matched),
            'bills': len(bills), 'truncated': truncated,
            'floor_rollcalls': sum(b['floor_rollcalls'] for b in bills),
            'rollcalls': sum(len(b['rollcalls']) for b in bills),
            'states_hit': sorted({b['state'] for b in bills}),
            'elapsed_seconds': round(time.time() - t0, 1),
            'errors': errors[:50],
        },
        'bills': bills,
        'legislators': legis_out,
        'topics': universe_matches(bills, topics),
        'keywords': keyword_cloud(bills, topics),
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Wrote {args.out}: {len(bills)} bills in {len(payload["meta"]["states_hit"])} states, '
          f'{len(legis_out)} legislators, {payload["meta"]["floor_rollcalls"]} floor roll calls '
          f'({time.time()-t0:.0f}s)', file=sys.stderr)

    summary_path = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_path:
        with open(summary_path, 'a', encoding='utf-8') as f:
            m = payload['meta']
            f.write(f"## Topic search: {len(bills)} bills in {len(m['states_hit'])} states\n\n")
            f.write(f"Phrases: {', '.join(phrases)} · sessions scanned: {m['sessions_scanned']} · "
                    f"matched: {m['sessions_matched']} · {m['elapsed_seconds']}s\n\n")
            f.write('| State | Bill | First vote | Result | Title |\n|---|---|---|---|---|\n')
            for b in bills[:100]:
                f.write(f"| {b['state']} | {b['bill']} | {b['first_date']} | {b['last_result']} | {b['title'][:90]} |\n")
            if errors:
                f.write(f"\n{len(errors)} session(s) could not be read.\n")


if __name__ == '__main__':
    main()
