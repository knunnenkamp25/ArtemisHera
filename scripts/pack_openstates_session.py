#!/usr/bin/env python3
"""
Convert an Open States bulk-session CSV archive into the packed ArtemisHera
state-vote format (people.json / rollcalls.json / votes.json).

Open States bulk zips (open.pluralpolicy.com/data/session-csv/) contain, among
others:
    *_bills.csv        — id, identifier (e.g. HB 1), title, …
    *_votes.csv        — id, bill_id, motion_text, start_date, result, chamber/organization
    *_vote_people.csv  — vote_event_id, voter_name, voter_id, option (yes/no/…)

Legislator metadata (party/district) is joined from the people repo CSV if
provided (--people), else from names alone.

Usage:
    python scripts/pack_openstates_session.py \
        --zip ~/Downloads/VA_2020_2020_csv_*.zip \
        --state VA --session 2020 --session-name "2020 Regular Session"
"""

import argparse
import csv
import glob
import io
import json
import os
import re
import zipfile

OPTION_CODE = {'yes': 1, 'no': 2, 'abstain': 3, 'other': 3, 'not voting': 4,
               'absent': 4, 'excused': 4, 'paired': 3}


def read_csv(zf, suffix):
    for name in zf.namelist():
        if name.endswith(suffix):
            return list(csv.DictReader(io.TextIOWrapper(zf.open(name), encoding='utf-8')))
    return []


def chamber_of(row):
    org = (row.get('organization__name') or row.get('organization') or '').lower()
    if 'senate' in org: return 'Senate'
    if 'house' in org or 'assembly' in org or 'delegates' in org: return 'House'
    return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip', required=True, help='Path or glob to the session CSV zip')
    ap.add_argument('--state', required=True)
    ap.add_argument('--session', required=True, help='Session id used in the URL/path (e.g. 2020)')
    ap.add_argument('--session-name', default='')
    ap.add_argument('--base', default='data/state')
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.expanduser(args.zip)))
    if not paths:
        raise SystemExit(f'No file matches {args.zip}')
    zf = zipfile.ZipFile(paths[-1])

    bills = {b['id']: b for b in read_csv(zf, '_bills.csv')}
    vote_events = read_csv(zf, '_votes.csv')
    vote_people = read_csv(zf, '_vote_people.csv')

    if not vote_events or not vote_people:
        raise SystemExit(f'{paths[-1]}: no vote data found (files present: {zf.namelist()[:8]}…)')

    # rollcalls, indexed by vote_event id
    rollcalls, rc_idx = [], {}
    for ve in sorted(vote_events, key=lambda v: v.get('start_date', '')):
        bill = bills.get(ve.get('bill_id'), {})
        rc_idx[ve['id']] = len(rollcalls)
        rollcalls.append([
            bill.get('identifier', '').replace(' ', ''),
            bill.get('title', ''),
            (ve.get('start_date', '') or '')[:10],
            ve.get('motion_text', ''),
            (ve.get('result', '') or '').capitalize(),
            chamber_of(ve),
        ])

    # per-person votes; people keyed by voter_id (fall back to name slug)
    votes, people = {}, {}
    for vp in vote_people:
        ve_id = vp.get('vote_event_id')
        if ve_id not in rc_idx:
            continue
        pid = vp.get('voter_id') or 'name:' + re.sub(r'\W+', '_', vp.get('voter_name', ''))
        code = OPTION_CODE.get((vp.get('option') or '').lower().strip(), 3)
        votes.setdefault(pid, []).append([rc_idx[ve_id], code])
        if pid not in people:
            people[pid] = {'people_id': pid, 'name': vp.get('voter_name', ''),
                           'party': '', 'role': '', 'district': ''}

    out_dir = os.path.join(args.base, args.state, args.session)
    os.makedirs(out_dir, exist_ok=True)
    json.dump(sorted(people.values(), key=lambda p: p['name']),
              open(os.path.join(out_dir, 'people.json'), 'w'), separators=(',', ':'))
    json.dump(rollcalls, open(os.path.join(out_dir, 'rollcalls.json'), 'w'), separators=(',', ':'))
    json.dump(votes, open(os.path.join(out_dir, 'votes.json'), 'w'), separators=(',', ':'))

    # sessions index
    idx_path = os.path.join(args.base, 'sessions.json')
    try:
        idx = json.load(open(idx_path))
    except Exception:
        idx = {}
    entry = idx.setdefault(args.state, {'state_name': args.state, 'sessions': []})
    year = int(re.search(r'\d{4}', args.session).group())
    entry['sessions'] = [s for s in entry['sessions'] if s['id'] != args.session]
    entry['sessions'].append({'id': args.session,
                              'name': args.session_name or f'{args.session} Session',
                              'year_start': year, 'year_end': year,
                              'people_count': len(people)})
    entry['sessions'].sort(key=lambda s: -s['year_start'])
    json.dump(idx, open(idx_path, 'w'), indent=1)

    print(f'{args.state} {args.session}: {len(people)} members, {len(rollcalls)} rollcalls, '
          f'{sum(len(v) for v in votes.values())} individual votes -> {out_dir}')


if __name__ == '__main__':
    main()
