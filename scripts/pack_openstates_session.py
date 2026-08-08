#!/usr/bin/env python3
"""
Convert an Open States bulk-session CSV archive into the packed ArtemisHera
state-vote format (people.json / rollcalls.json / votes.json).

Open States zips contain a nested `{ST}/{session}/` directory, which is the
authoritative state + session identifier — the filename is only a slug plus a
random hash, so we read identity from inside the archive rather than parsing it.

Files used:
    *_bills.csv         id, identifier ("HB 1304"), title
    *_votes.csv         id, motion_text, start_date, result, organization_id, bill_id
    *_vote_people.csv   vote_event_id, option, voter_name, voter_id
    *_organizations.csv id, name, classification   (to resolve chamber)

Usage:
    python scripts/pack_openstates_session.py --zip VA_2024_csv_xxx.zip --base data/state
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile

OPTION_CODE = {'yes': 1, 'no': 2, 'abstain': 3, 'other': 3, 'not voting': 4,
               'absent': 4, 'excused': 4, 'paired': 3}


def write_if_changed(path, payload):
    """Only touch the file when its content actually differs.

    A full repack used to rewrite all ~1,150 files unconditionally, so a fix
    touching one field added another few hundred MB to git history forever.
    Comparing first means a no-op repack produces an empty diff, and a targeted
    fix only rewrites the sessions it actually affects.
    """
    body = json.dumps(payload, separators=(',', ':'))
    try:
        if open(path).read() == body:
            return False
    except FileNotFoundError:
        pass
    with open(path, 'w') as f:
        f.write(body)
    return True


def read_csv(zf, suffix):
    for name in zf.namelist():
        if name.endswith(suffix) and not name.startswith('__MACOSX'):
            with zf.open(name) as fh:
                return list(csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8', errors='replace')))
    return []


def identity(zf):
    """(state, session) from the archive's internal {ST}/{session}/ path."""
    for name in zf.namelist():
        m = re.match(r'^([A-Z]{2})/([^/]+)/', name)
        if m:
            return m.group(1), m.group(2)
    return None, None


def chamber_map(zf):
    """organization_id -> 'House' | 'Senate' | ''

    Most votes in many states happen in committees, whose own classification is
    'committee' — the chamber is its parent. Walk the parent chain to resolve
    those; without this, ~41% of rollcalls came through with no chamber.
    Unicameral bodies (Nebraska, DC) legitimately resolve to ''.
    """
    orgs = {o['id']: o for o in read_csv(zf, '_organizations.csv') if o.get('id')}

    def own_chamber(o):
        cls = (o.get('classification') or '').lower()
        if cls == 'upper':
            return 'Senate'
        if cls == 'lower':
            return 'House'
        name = (o.get('name') or '').lower()
        if 'senate' in name:
            return 'Senate'
        if any(w in name for w in ('house', 'assembly', 'delegates')):
            return 'House'
        return ''

    resolved = {}

    def resolve(oid, depth=0):
        if oid in resolved:
            return resolved[oid]
        o = orgs.get(oid)
        if not o or depth > 6:            # missing org, or a parent cycle
            return ''
        ch = own_chamber(o) or resolve(o.get('parent_id'), depth + 1)
        resolved[oid] = ch
        return ch

    return {oid: resolve(oid) for oid in orgs}


def pack(zip_path, base, force=False):
    zf = zipfile.ZipFile(zip_path)
    state, session = identity(zf)
    if not state:
        raise ValueError('no {ST}/{session}/ path inside archive')

    out_dir = os.path.join(base, state, session)
    if os.path.exists(os.path.join(out_dir, 'votes.json')) and not force:
        return state, session, 'skipped', 0, 0

    vote_events = read_csv(zf, '_votes.csv')
    vote_people = read_csv(zf, '_vote_people.csv')
    if not vote_events or not vote_people:
        return state, session, 'no-votes', 0, 0

    bills = {b['id']: b for b in read_csv(zf, '_bills.csv')}
    chambers = chamber_map(zf)

    rollcalls, rc_idx = [], {}
    for ve in sorted(vote_events, key=lambda v: v.get('start_date') or ''):
        bill = bills.get(ve.get('bill_id'), {})
        rc_idx[ve['id']] = len(rollcalls)
        rollcalls.append([
            (bill.get('identifier') or ve.get('identifier') or '').replace(' ', ''),
            bill.get('title', ''),
            (ve.get('start_date') or '')[:10],
            ve.get('motion_text', ''),
            (ve.get('result') or '').capitalize(),
            chambers.get(ve.get('organization_id'), ''),
        ])

    votes, people = {}, {}
    for vp in vote_people:
        idx = rc_idx.get(vp.get('vote_event_id'))
        if idx is None:
            continue
        pid = vp.get('voter_id') or 'name:' + re.sub(r'\W+', '_', vp.get('voter_name', ''))
        votes.setdefault(pid, []).append([idx, OPTION_CODE.get((vp.get('option') or '').lower().strip(), 3)])
        if pid not in people:
            people[pid] = {'people_id': pid, 'name': vp.get('voter_name', ''),
                           'party': '', 'role': '', 'district': ''}

    if not people:
        return state, session, 'no-votes', 0, 0

    os.makedirs(out_dir, exist_ok=True)
    for fname, payload in (('people.json', sorted(people.values(), key=lambda p: p['name'])),
                           ('rollcalls.json', rollcalls),
                           ('votes.json', votes)):
        write_if_changed(os.path.join(out_dir, fname), payload)

    years = sorted({r[2][:4] for r in rollcalls if r[2][:4].isdigit()})
    update_index(base, state, session, len(people), years)
    return state, session, 'packed', len(people), len(rollcalls)


def update_index(base, state, session, n_people, years):
    """Years come from the rollcall dates, not the session id — many states name
    sessions by legislature number ("112", "88", "30") with no year in them."""
    path = os.path.join(base, 'sessions.json')
    try:
        idx = json.load(open(path))
    except Exception:
        idx = {}
    entry = idx.setdefault(state, {'state_name': state, 'sessions': []})
    y0 = int(years[0]) if years else 0
    y1 = int(years[-1]) if years else 0
    special = bool(re.search(r'(special|extraordinary|\bss\b|s\d)', session, re.I))
    span = str(y0) if y0 == y1 else f'{y0}–{y1}'
    if y0:
        name = f'{span} Special Session' if special else f'{span} Session'
        if not re.fullmatch(r'\d{4}(-\d{4})?', session):
            name += f' ({session})'          # keep the source id visible
    else:
        name = session
    entry['sessions'] = [s for s in entry['sessions'] if s['id'] != session]
    entry['sessions'].append({'id': session, 'name': name, 'year_start': y0,
                              'year_end': y1, 'people_count': n_people,
                              'special': special})
    entry['sessions'].sort(key=lambda s: (-s['year_start'], s['id']))
    json.dump(idx, open(path, 'w'), separators=(',', ':'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip', required=True)
    ap.add_argument('--base', default='data/state')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    st, se, status, np_, nrc = pack(args.zip, args.base, args.force)
    print(f'{st} {se}: {status} ({np_} members, {nrc} rollcalls)')


if __name__ == '__main__':
    main()
