#!/usr/bin/env python3
"""
Bulk-convert a folder of Open States session CSV archives into the packed
ArtemisHera format.

State and session identity come from inside each archive (the `{ST}/{session}/`
path), so duplicate downloads — `foo.zip`, `foo (1).zip` — collapse onto the
same output automatically. Archives Open States ships without roll-call data
(Texas, and most pre-2010 sessions) are reported and skipped.

Usage:
    python scripts/backfill_openstates.py --src ~/Downloads --out ../ArtemisHera-data/data/state
    python scripts/backfill_openstates.py --src ~/Downloads --out … --states VA,NC --force
"""

import argparse
import glob
import json
import os
import sys
import time
import zipfile
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_openstates_session import pack, identity  # noqa: E402

NAMES = {
 'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California','CO':'Colorado',
 'CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho',
 'IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiana',
 'ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota',
 'MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada',
 'NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York','NC':'North Carolina',
 'ND':'North Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania',
 'RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota','TN':'Tennessee','TX':'Texas',
 'UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West Virginia',
 'WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia','PR':'Puerto Rico','US':'Congress',
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--states', default='')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    only = {s.strip().upper() for s in args.states.split(',') if s.strip()}
    zips = sorted(glob.glob(os.path.join(os.path.expanduser(args.src), '*.zip')))

    # Identify every archive first so duplicate downloads collapse and we can
    # report coverage before spending time unpacking.
    todo, dupes, unreadable = {}, 0, []
    for z in zips:
        try:
            with zipfile.ZipFile(z) as zf:
                st, se = identity(zf)
        except zipfile.BadZipFile:
            unreadable.append(os.path.basename(z));  continue
        if not st:
            continue                      # not an Open States archive
        if only and st not in only:
            continue
        if (st, se) in todo:
            dupes += 1;  continue
        todo[(st, se)] = z

    print(f'{len(zips)} files · {len(todo)} unique sessions · {dupes} duplicate downloads '
          f'· {len(unreadable)} unreadable', file=sys.stderr)
    if args.dry_run:
        for (st, se) in sorted(todo)[:40]:
            print(f'  {st} {se}')
        return

    os.makedirs(args.out, exist_ok=True)
    stats = defaultdict(int)
    novote_states = defaultdict(int)
    packed_states = defaultdict(int)
    t0 = time.time()

    for i, ((st, se), path) in enumerate(sorted(todo.items()), 1):
        try:
            _, _, status, n_people, n_rc = pack(path, args.out, args.force)
        except Exception as e:
            status = 'error'
            print(f'  [{i}/{len(todo)}] {st} {se}: ERROR {e}', file=sys.stderr)
        stats[status] += 1
        if status == 'packed':
            packed_states[st] += 1
        elif status == 'no-votes':
            novote_states[st] += 1
        if i % 25 == 0 or i == len(todo):
            print(f'  [{i}/{len(todo)}] {dict(stats)} ({time.time()-t0:.0f}s)', file=sys.stderr)

    # Fill full state names into the index
    idx_path = os.path.join(args.out, 'sessions.json')
    try:
        idx = json.load(open(idx_path))
        for ab, e in idx.items():
            e['state_name'] = NAMES.get(ab, ab)
        json.dump(idx, open(idx_path, 'w'), separators=(',', ':'))
    except Exception as e:
        print(f'index update failed: {e}', file=sys.stderr)

    print(f'\n=== done in {time.time()-t0:.0f}s ===', file=sys.stderr)
    print(f'packed {stats["packed"]} · skipped {stats["skipped"]} · '
          f'no vote data {stats["no-votes"]} · errors {stats["error"]}', file=sys.stderr)
    print(f'\nstates with vote data: {len(packed_states)}', file=sys.stderr)
    nov = sorted(s for s in novote_states if s not in packed_states)
    if nov:
        print(f'states with NO vote data at all: {", ".join(nov)}', file=sys.stderr)


if __name__ == '__main__':
    main()
