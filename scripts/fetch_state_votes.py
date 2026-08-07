#!/usr/bin/env python3
"""
Pull a state legislative session from the LegiScan API and write it in the
packed ArtemisHera format (people.json / rollcalls.json / votes.json).

Uses LegiScan's getDataset endpoint — one ZIP per session containing every
bill, person, and rollcall as JSON — so a full session costs a handful of API
calls instead of thousands. Also refreshes data/state/sessions.json.

Requires the LEGISCAN_KEY environment variable (repo secret in Actions).

Usage:
    python scripts/fetch_state_votes.py --state VA --year 2024
    python scripts/fetch_state_votes.py --state VA --all-years   # full backfill
"""

import argparse
import base64
import io
import json
import os
import sys
import urllib.request
import urllib.parse
import zipfile

API = 'https://api.legiscan.com/'
CODE = {1: 1, 2: 2, 3: 3, 4: 4}   # LegiScan: 1=Yea 2=Nay 3=NV 4=Absent
LEGI_TO_APP = {1: 1, 2: 2, 3: 4, 4: 4}  # our codes: 1=Yes 2=No 3=Present 4=NV/Absent


def api(op, **params):
    key = os.environ.get('LEGISCAN_KEY')
    if not key:
        raise SystemExit('LEGISCAN_KEY environment variable is not set')
    qs = urllib.parse.urlencode({'key': key, 'op': op, **params})
    with urllib.request.urlopen(API + '?' + qs, timeout=300) as r:
        data = json.load(r)
    if data.get('status') != 'OK':
        raise SystemExit(f'LegiScan {op} failed: {json.dumps(data)[:300]}')
    return data


def fetch_session_dataset(session_id, access_key):
    data = api('getDataset', id=session_id, access_key=access_key)
    blob = base64.b64decode(data['dataset']['zip'])
    return zipfile.ZipFile(io.BytesIO(blob))


def pack_session(zf, out_dir):
    people, bills, rollcall_votes = {}, {}, []

    for name in zf.namelist():
        if not name.endswith('.json'):
            continue
        obj = json.loads(zf.read(name))
        if '/people/' in name:
            p = obj['person']
            people[p['people_id']] = {
                'people_id': p['people_id'],
                'name': p['name'],
                'party': p.get('party', ''),
                'role': p.get('role', ''),
                'district': p.get('district', ''),
            }
        elif '/bill/' in name:
            b = obj['bill']
            bills[b['bill_id']] = b
        elif '/vote/' in name:
            rollcall_votes.append(obj['roll_call'])

    rollcalls, votes = [], {}
    for rc in sorted(rollcall_votes, key=lambda r: r.get('date', '')):
        bill = bills.get(rc.get('bill_id'), {})
        idx = len(rollcalls)
        rollcalls.append([
            bill.get('bill_number', ''),
            bill.get('title', ''),
            rc.get('date', ''),
            rc.get('desc', ''),
            'Passed' if rc.get('passed') else 'Failed',
            rc.get('chamber', ''),
        ])
        for v in rc.get('votes', []):
            pid = str(v.get('people_id'))
            votes.setdefault(pid, []).append([idx, LEGI_TO_APP.get(v.get('vote_id'), 3)])

    os.makedirs(out_dir, exist_ok=True)
    json.dump(sorted(people.values(), key=lambda p: p['name']),
              open(os.path.join(out_dir, 'people.json'), 'w'), separators=(',', ':'))
    json.dump(rollcalls, open(os.path.join(out_dir, 'rollcalls.json'), 'w'), separators=(',', ':'))
    json.dump(votes, open(os.path.join(out_dir, 'votes.json'), 'w'), separators=(',', ':'))
    return len(people), len(rollcalls)


def update_sessions_index(base, state, session_meta):
    path = os.path.join(base, 'sessions.json')
    try:
        idx = json.load(open(path))
    except Exception:
        idx = {}
    entry = idx.setdefault(state, {'state_name': session_meta['state_name'], 'sessions': []})
    entry['sessions'] = [s for s in entry['sessions'] if s['id'] != session_meta['id']]
    entry['sessions'].append({k: session_meta[k] for k in ('id', 'name', 'year_start', 'year_end', 'people_count')})
    entry['sessions'].sort(key=lambda s: -s['year_start'])
    json.dump(idx, open(path, 'w'), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--state', required=True)
    ap.add_argument('--year', type=int)
    ap.add_argument('--all-years', action='store_true')
    ap.add_argument('--base', default='data/state')
    args = ap.parse_args()

    sessions = api('getSessionList', state=args.state)['sessions']
    targets = []
    for s in sessions:
        if s.get('special'):
            continue
        if args.all_years or (args.year and s['year_start'] <= args.year <= s['year_end']):
            targets.append(s)
    if not targets:
        raise SystemExit(f'No sessions found for {args.state} ' +
                         ('(all years)' if args.all_years else str(args.year)))

    datasets = {d['session_id']: d for d in api('getDatasetList', state=args.state)['datasetlist']}

    for s in targets:
        sid = s['session_id']
        label = str(s['year_start']) if s['year_start'] == s['year_end'] else f"{s['year_start']}-{s['year_end']}"
        ds = datasets.get(sid)
        if not ds:
            print(f'  no dataset for session {sid} ({label}) — skipping', file=sys.stderr)
            continue
        print(f'Fetching {args.state} {label} (session {sid})…', file=sys.stderr)
        zf = fetch_session_dataset(sid, ds['access_key'])
        out_dir = os.path.join(args.base, args.state, label)
        n_people, n_rc = pack_session(zf, out_dir)
        print(f'  {n_people} members, {n_rc} rollcalls -> {out_dir}', file=sys.stderr)
        update_sessions_index(args.base, args.state, {
            'id': label, 'name': s.get('session_title') or s.get('name', label),
            'year_start': s['year_start'], 'year_end': s['year_end'],
            'people_count': n_people, 'state_name': s.get('state_name', args.state),
        })


if __name__ == '__main__':
    main()
