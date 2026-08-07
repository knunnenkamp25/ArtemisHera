#!/usr/bin/env python3
"""
Build a compact federal member index from Voteview's HSall_members.csv.

Voteview sends no CORS headers, so the browser cannot fetch it directly and the
free CORS proxies choke on the 6 MB file. This script mirrors the directory into
the repo as data/federal/members.json, which GitHub Pages serves same-origin.

Usage:
    python scripts/build_federal_index.py [--out data/federal/members.json]
"""

import argparse
import csv
import io
import json
import os
import urllib.request

BASES = [
    'https://voteview.com/static/data/out',
    'https://voteview.polisci.ucla.edu/static/data/out',
]
PARTY_CODES = {'100': 'Democratic', '200': 'Republican', '328': 'Independent'}


def party_name(code):
    """Voteview writes party_code inconsistently as '100' or '100.0'."""
    code = (code or '').strip()
    if code.endswith('.0'):
        code = code[:-2]
    return PARTY_CODES.get(code, 'Other')


def fetch(path):
    last = None
    for base in BASES:
        url = f'{base}/{path}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ArtemisHera/1.0'})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode('utf-8', errors='replace')
        except Exception as e:  # try the mirror
            last = e
    raise RuntimeError(f'Could not fetch {path}: {last}')


def build_index(local_csv=None):
    if local_csv:
        with open(local_csv, encoding='utf-8', errors='replace') as f:
            text = f.read()
    else:
        text = fetch('members/HSall_members.csv')
    rows = list(csv.DictReader(io.StringIO(text)))
    members = {}
    for r in rows:
        key = r.get('bioguide_id') or (r.get('bioname', '') + r.get('state_abbrev', ''))
        if not key:
            continue
        congress = int(r['congress'])
        m = members.get(key)
        if not m:
            m = {
                'bioguide_id': r.get('bioguide_id', ''),
                'name': r.get('bioname', ''),
                'state': r.get('state_abbrev', ''),
                'party': party_name(r.get('party_code')),
                'chambers': [],
                'minCongress': congress,
                'maxCongress': congress,
                'icpsrs': [],
            }
            members[key] = m
        if congress >= m['maxCongress']:
            m['party'] = party_name(r.get('party_code'))  # most recent affiliation wins
        ch = r.get('chamber', '')
        if ch and ch not in m['chambers']:
            m['chambers'].append(ch)
        icpsr = r.get('icpsr', '')
        if icpsr and icpsr not in m['icpsrs']:
            m['icpsrs'].append(icpsr)
        m['minCongress'] = min(m['minCongress'], congress)
        m['maxCongress'] = max(m['maxCongress'], congress)
    return sorted(members.values(), key=lambda m: (-m['maxCongress'], m['name']))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='data/federal/members.json')
    ap.add_argument('--source', default=None,
                    help='Path to a locally downloaded HSall_members.csv (skips the network fetch)')
    args = ap.parse_args()
    index = build_index(args.source)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(f'Wrote {len(index)} members to {args.out}')


if __name__ == '__main__':
    main()
