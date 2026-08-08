#!/usr/bin/env python3
"""
Fill in party / district / chamber on packed people.json files.

Open States bulk session archives carry vote records but no roster, so every
backfilled legislator lands with an empty party. Their people repo publishes a
current roster per state as public CSV — no API key, no rate limit:

    https://data.openstates.org/people/current/{state}.csv

Only *currently serving* legislators are published, so coverage is naturally
partial on older sessions. Anyone not matched keeps an empty party, which the
app renders as no tag rather than a wrong one.

Usage:
    python scripts/enrich_people.py --base ../ArtemisHera-data/data/state
    python scripts/enrich_people.py --base … --states VA,NC
"""

import argparse
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request

ROSTER = 'https://data.openstates.org/people/current/{}.csv'
CHAMBER = {'upper': 'Senate', 'lower': 'House', 'legislature': ''}


def fetch_roster(abbrev):
    """-> {ocd-person id: {party, district, role}} for one state."""
    url = ROSTER.format(abbrev.lower())
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'ArtemisHera/1.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            text = r.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        print(f'  {abbrev}: roster unavailable ({e.code})', file=sys.stderr)
        return {}
    except Exception as e:
        print(f'  {abbrev}: {e}', file=sys.stderr)
        return {}

    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        pid = (row.get('id') or '').strip()
        if not pid:
            continue
        out[pid] = {
            'party': (row.get('current_party') or '').strip(),
            'district': (row.get('current_district') or '').strip(),
            'role': CHAMBER.get((row.get('current_chamber') or '').strip().lower(), ''),
        }
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True, help='data/state directory')
    ap.add_argument('--states', default='', help='comma-separated abbrevs (default: all present)')
    args = ap.parse_args()

    only = {s.strip().upper() for s in args.states.split(',') if s.strip()}
    states = sorted(d for d in os.listdir(args.base)
                    if len(d) == 2 and d.isupper() and os.path.isdir(os.path.join(args.base, d)))
    if only:
        states = [s for s in states if s in only]

    grand_matched = grand_total = 0
    per_state = []

    for ab in states:
        roster = fetch_roster(ab)
        if not roster:
            continue
        matched = total = 0
        for sid in sorted(os.listdir(os.path.join(args.base, ab))):
            path = os.path.join(args.base, ab, sid, 'people.json')
            if not os.path.exists(path):
                continue
            people = json.load(open(path))
            changed = False
            for p in people:
                total += 1
                info = roster.get(p.get('people_id'))
                if not info:
                    continue
                matched += 1
                # Only fill blanks — never overwrite data already present.
                for field in ('party', 'district', 'role'):
                    if info[field] and not p.get(field):
                        p[field] = info[field]
                        changed = True
            if changed:
                json.dump(people, open(path, 'w'), separators=(',', ':'))
        grand_matched += matched
        grand_total += total
        per_state.append((ab, matched, total))
        print(f'  {ab}: {matched}/{total} legislator records matched '
              f'({matched * 100 // max(total, 1)}%)', file=sys.stderr)

    print(f'\n{grand_matched}/{grand_total} records enriched '
          f'({grand_matched * 100 // max(grand_total, 1)}%) across {len(per_state)} states',
          file=sys.stderr)
    print('Unmatched are legislators no longer serving — Open States publishes '
          'only a current roster.', file=sys.stderr)


if __name__ == '__main__':
    main()
