#!/usr/bin/env python3
"""
Weekly current-session refresh via the Open States v3 API.

Historical sessions are loaded once from bulk CSV archives
(scripts/pack_openstates_session.py). This script keeps the *current* session
current: it pulls bills updated since the last run, with their vote events, and
merges any new rollcalls into the packed session files in place.

Rate limits (free tier): 500 requests/day, 1 request/second. A quiet week is a
handful of pages; the script sleeps between calls and stops at --max-requests
so a busy week can never blow the daily budget.

Requires OPENSTATES_KEY in the environment.

Usage:
    python scripts/refresh_openstates.py --state Virginia --session 2026
    python scripts/refresh_openstates.py --state Virginia --session 2026 --since 2026-08-01
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

API = 'https://v3.openstates.org'
OPTION_CODE = {'yes': 1, 'no': 2, 'abstain': 3, 'other': 3,
               'not voting': 4, 'absent': 4, 'excused': 4, 'paired': 3}
STATE_ABBREV = {
 'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO',
 'Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID',
 'Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA',
 'Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
 'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
 'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
 'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
 'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX',
 'Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV',
 'Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
}

_requests = 0


class ApiError(Exception):
    """Raised instead of exiting, so a mid-run failure can still keep whatever
    was collected before it. A weekly refresh that gets most of the way through
    should commit that, not throw it away."""


def api(path, **params):
    """One GET against the v3 API, throttled to stay under 1 req/sec."""
    global _requests
    key = os.environ.get('OPENSTATES_KEY')
    if not key:
        raise SystemExit('OPENSTATES_KEY environment variable is not set')
    url = f'{API}{path}?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={'X-API-KEY': key})
    for attempt in range(4):
        try:
            time.sleep(1.1)              # documented limit: 1 request/second
            with urllib.request.urlopen(req, timeout=120) as r:
                _requests += 1
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = ''
            try:
                body = e.read().decode('utf-8', 'replace')[:300]
            except Exception:
                pass
            if e.code in (429, 502, 503, 504):
                # Honour Retry-After when the server sends one.
                hdr = e.headers.get('Retry-After') if e.headers else None
                wait = int(hdr) if (hdr or '').isdigit() else 15 * (attempt + 1)
                print(f'  {e.code} from API, waiting {wait}s (attempt {attempt + 1}/4)',
                      file=sys.stderr)
                time.sleep(wait)
                continue
            raise ApiError(f'{path} failed: HTTP {e.code} {body}')
        except Exception as e:
            print(f'  network error ({e}); retrying', file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise ApiError(f'{path}: still failing after retries')


CHAMBER_ROLE = {'upper': 'Senate', 'lower': 'House'}


def chamber_of(org):
    """Organization is an object {id, name, classification} — prefer the
    classification, which is reliable across states, and fall back to the name."""
    if isinstance(org, dict):
        by_cls = CHAMBER_ROLE.get((org.get('classification') or '').lower())
        if by_cls:
            return by_cls
        org = org.get('name') or ''
    o = (org or '').lower()
    if 'senate' in o: return 'Senate'
    if 'house' in o or 'assembly' in o or 'delegates' in o: return 'House'
    return ''


def load_packed(d):
    def read(name, default):
        try:
            return json.load(open(os.path.join(d, name)))
        except Exception:
            return default
    return read('people.json', []), read('rollcalls.json', []), read('votes.json', {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--state', required=True, help='Full jurisdiction name, e.g. Virginia')
    ap.add_argument('--session', required=True, help='Session identifier, e.g. 2026')
    ap.add_argument('--since', default='', help='ISO date; defaults to 8 days ago')
    ap.add_argument('--base', default='data/state')
    ap.add_argument('--max-requests', type=int, default=120,
                    help='Hard ceiling on API calls this run (daily budget is 500)')
    args = ap.parse_args()

    abbrev = STATE_ABBREV.get(args.state, args.state)
    out_dir = os.path.join(args.base, abbrev, args.session)
    people_list, rollcalls, votes = load_packed(out_dir)
    people = {p['people_id']: p for p in people_list}

    # Rollcalls are keyed so re-running never duplicates an existing entry.
    seen = {(rc[0], rc[2], rc[3]): i for i, rc in enumerate(rollcalls)}
    start_count = len(rollcalls)

    since = args.since or (datetime.now(timezone.utc) - timedelta(days=8)).strftime('%Y-%m-%d')
    print(f'{args.state} {args.session}: bills updated since {since}', file=sys.stderr)

    page, added_votes = 1, 0
    bills_seen = vote_events_seen = dupes = 0
    while True:
        if _requests >= args.max_requests:
            print(f'  stopping at request ceiling ({args.max_requests})', file=sys.stderr)
            break
        try:
            data = api('/bills', jurisdiction=args.state, session=args.session,
                       updated_since=since, include='votes', page=page, per_page=20)
        except ApiError as e:
            print(f'  stopped at page {page}: {e}', file=sys.stderr)
            print('  keeping everything collected up to this point.', file=sys.stderr)
            break
        results = data.get('results', [])
        bills_seen += len(results)
        if page == 1:
            pg = data.get('pagination', {})
            print(f"  query -> jurisdiction={args.state} session={args.session} "
                  f"updated_since={since}", file=sys.stderr)
            print(f"  API reports {pg.get('total_items', '?')} matching bills "
                  f"across {pg.get('max_page', '?')} pages", file=sys.stderr)
        for bill in results:
            for ve in bill.get('votes', []) or []:
                vote_events_seen += 1
                if not isinstance(ve, dict):
                    continue
                key = (bill.get('identifier', '').replace(' ', ''),
                       (ve.get('start_date') or '')[:10], ve.get('motion_text', ''))
                if key in seen:
                    dupes += 1
                    continue
                idx = len(rollcalls)
                seen[key] = idx
                rollcalls.append([
                    key[0], bill.get('title', ''), key[1], key[2],
                    (ve.get('result') or '').capitalize(), chamber_of(ve.get('organization')),
                ])
                for v in ve.get('votes', []) or []:
                    # The API returns the person under `voter` (a CompactPerson),
                    # NOT a flat `voter_id` — reading voter_id always fell through
                    # to a name-derived key, which would not match the
                    # ocd-person ids from the bulk backfill and would have
                    # created a duplicate roster on every refresh.
                    voter = v.get('voter') or {}
                    pid = voter.get('id') or v.get('voter_id')
                    name = v.get('voter_name') or voter.get('name') or ''
                    if not pid:
                        pid = 'name:' + name.replace(' ', '_')
                    votes.setdefault(pid, []).append([idx, OPTION_CODE.get((v.get('option') or '').lower(), 3)])
                    # CompactPerson exposes: id, name, party, current_role
                    role = (voter.get('current_role') or {})
                    people.setdefault(pid, {'people_id': pid, 'name': name,
                                            'party': voter.get('party', ''),
                                            'role': CHAMBER_ROLE.get(role.get('org_classification', ''), ''),
                                            'district': str(role.get('district', '') or '')})
                    added_votes += 1
        pagination = data.get('pagination', {})
        if page >= pagination.get('max_page', 1) or not results:
            break
        page += 1

    new_rollcalls = len(rollcalls) - start_count
    print(f'  scanned {bills_seen} bills, {vote_events_seen} vote events '
          f'({dupes} already stored, {new_rollcalls} new) in {_requests} API requests',
          file=sys.stderr)
    if not new_rollcalls:
        if vote_events_seen:
            print('No new rollcalls — everything returned was already stored. '
                  'Fetch and dedup both verified.', file=sys.stderr)
        else:
            print('No vote events returned at all. Either nothing was updated in '
                  'this window, or the session id does not match what the API '
                  'expects — widen --since to confirm.', file=sys.stderr)
        return

    os.makedirs(out_dir, exist_ok=True)
    json.dump(sorted(people.values(), key=lambda p: p['name']),
              open(os.path.join(out_dir, 'people.json'), 'w'), separators=(',', ':'))
    json.dump(rollcalls, open(os.path.join(out_dir, 'rollcalls.json'), 'w'), separators=(',', ':'))
    json.dump(votes, open(os.path.join(out_dir, 'votes.json'), 'w'), separators=(',', ':'))

    # keep the session index in step
    idx_path = os.path.join(args.base, 'sessions.json')
    try:
        idx = json.load(open(idx_path))
    except Exception:
        idx = {}
    entry = idx.setdefault(abbrev, {'state_name': args.state, 'sessions': []})
    year = int(args.session[:4]) if args.session[:4].isdigit() else 0
    entry['sessions'] = [s for s in entry['sessions'] if s['id'] != args.session]
    entry['sessions'].append({'id': args.session, 'name': f'{args.session} Session',
                              'year_start': year, 'year_end': year, 'people_count': len(people)})
    entry['sessions'].sort(key=lambda s: -s['year_start'])
    json.dump(idx, open(idx_path, 'w'), indent=1)

    print(f'+{new_rollcalls} rollcalls, +{added_votes} individual votes '
          f'({_requests} API requests used)', file=sys.stderr)


if __name__ == '__main__':
    main()
