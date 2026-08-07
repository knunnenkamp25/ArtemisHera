#!/usr/bin/env python3
"""
Pack a state legislative session into the normalized ArtemisHera format.

The legacy congress-votes layout stores one file per legislator with every
rollcall's full text repeated — VA 2025 alone is 124 MB that way. Packed, the
same session is a few MB: rollcall metadata is stored once and each member is
just a list of (rollcall index, vote code) pairs. Keywords are NOT stored —
the app re-derives them from bill titles at load time.

Input : a directory of legacy per-person JSON files + people.json
Output: {out}/people.json     — [{people_id, name, party, role, district}]
        {out}/rollcalls.json  — [[bill_number, title, date, question, result, chamber], ...]
        {out}/votes.json      — {people_id: [[rollcall_idx, code], ...]}
Codes : 1=Yes 2=No 3=Present/Other 4=Not Voting/Absent

Usage:
    python scripts/pack_state_session.py --src data/state/VA/2025 --out data/state/VA/2025
"""

import argparse
import glob
import json
import os

CODE = {'Yes': 1, 'Yea': 1, 'Y': 1, 'Aye': 1,
        'No': 2, 'Nay': 2, 'N': 2,
        'Present': 3, 'Other': 3,
        'Not Voting': 4, 'NV': 4, 'Absent': 4, 'Excused': 4}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--delete-legacy', action='store_true',
                    help='Remove the per-person legacy files after packing')
    args = ap.parse_args()

    people = json.load(open(os.path.join(args.src, 'people.json')))
    rc_index = {}          # key -> idx
    rollcalls = []
    votes = {}
    legacy_files = []

    for p in people:
        pid = str(p['people_id'])
        path = os.path.join(args.src, f'{pid}.json')
        if not os.path.exists(path):
            continue
        legacy_files.append(path)
        raw = json.load(open(path))
        records = raw if isinstance(raw, list) else raw.get('votes', [])
        out = []
        for v in records:
            key = (v.get('bill_number', ''), v.get('date', ''), v.get('vote_question', ''))
            idx = rc_index.get(key)
            if idx is None:
                idx = len(rollcalls)
                rc_index[key] = idx
                rollcalls.append([
                    v.get('bill_number', ''), v.get('bill_title', ''), v.get('date', ''),
                    v.get('vote_question', ''), v.get('vote_result', ''), v.get('chamber', ''),
                ])
            code = CODE.get(str(v.get('member_vote', '')).strip(), 3)
            out.append([idx, code])
        votes[pid] = out

    os.makedirs(args.out, exist_ok=True)
    json.dump(rollcalls, open(os.path.join(args.out, 'rollcalls.json'), 'w'), separators=(',', ':'))
    json.dump(votes, open(os.path.join(args.out, 'votes.json'), 'w'), separators=(',', ':'))
    json.dump(people, open(os.path.join(args.out, 'people.json'), 'w'), separators=(',', ':'))

    rc_mb = os.path.getsize(os.path.join(args.out, 'rollcalls.json')) / 1e6
    vt_mb = os.path.getsize(os.path.join(args.out, 'votes.json')) / 1e6
    print(f'{len(people)} members, {len(rollcalls)} rollcalls')
    print(f'rollcalls.json {rc_mb:.1f} MB · votes.json {vt_mb:.1f} MB')

    if args.delete_legacy:
        for f in legacy_files:
            os.remove(f)
        print(f'removed {len(legacy_files)} legacy per-person files')


if __name__ == '__main__':
    main()
