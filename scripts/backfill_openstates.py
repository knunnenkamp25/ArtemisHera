#!/usr/bin/env python3
"""
Bulk-convert a folder of Open States session CSV archives into the packed
ArtemisHera format, writing into the data repo.

Open States zips are named like `VA_2023_Regular_Session_csv_<hash>.zip` or
`AK_31st_Legislature_2019-2020_csv_<hash>.zip`; this derives the state and a
session id from the filename, so a whole Downloads folder can be processed in
one pass. Already-packed sessions are skipped unless --force.

Usage:
    python scripts/backfill_openstates.py --src ~/Downloads \
        --out ../ArtemisHera-data/data/state
    python scripts/backfill_openstates.py --src ~/Downloads --out … --states VA,NC
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import zipfile

STATES = {
 'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
 'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
 'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','US',
}
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
 'WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia','PR':'Puerto Rico','US':'United States',
}


def parse_name(path):
    """-> (state_abbrev, session_id, pretty_name) from an Open States zip name."""
    base = os.path.basename(path)
    stem = re.sub(r'_csv[_-][0-9a-f]{6,}\.zip$', '', base, flags=re.I)
    stem = re.sub(r'\.zip$', '', stem)
    parts = stem.split('_')
    st = parts[0].upper() if parts and parts[0].upper() in STATES else None
    if not st:
        return None, None, None
    rest = '_'.join(parts[1:]) or 'session'
    pretty = rest.replace('_', ' ').strip()
    # Session id: a year range if present (incl. the unpunctuated "20172018"
    # form), else the first year, else a slug. Special sessions get an S suffix
    # so they never collide with that year's regular session.
    m = (re.search(r'(\d{4})\s*[-–]\s*(\d{4})', pretty)
         or re.search(r'\b(\d{4})(\d{4})\b', pretty))
    if m and m.group(1) != m.group(2):
        sid = f'{m.group(1)}-{m.group(2)}'
    else:
        y = re.search(r'(\d{4})', pretty)
        sid = y.group(1) if y else re.sub(r'\W+', '', rest)[:12]
    if re.search(r'special', pretty, re.I):
        # Must be the ordinal attached to "Special" — "88th Legislature 2023
        # 1st Special Session" is the 1st special, not the 88th.
        ordinal = re.search(
            r'\b(\d+)(?:st|nd|rd|th)\s+special|\b(first|second|third|fourth|fifth)\s+special',
            pretty, re.I)
        n = ''
        if ordinal:
            word = (ordinal.group(1) or ordinal.group(2) or '').lower()
            n = word if word.isdigit() else str(
                {'first': 1, 'second': 2, 'third': 3, 'fourth': 4}.get(word, ''))
        sid = f'{sid}S{n}'
    return st, sid, pretty


def has_votes(path):
    try:
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            return any(n.endswith('_vote_people.csv') for n in names)
    except zipfile.BadZipFile:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='Folder containing the session zips')
    ap.add_argument('--out', required=True, help='Target data/state directory')
    ap.add_argument('--states', default='', help='Comma-separated abbrevs to limit to')
    ap.add_argument('--force', action='store_true', help='Repack sessions that already exist')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    only = {s.strip().upper() for s in args.states.split(',') if s.strip()}
    zips = sorted(glob.glob(os.path.join(os.path.expanduser(args.src), '*.zip')))
    packer = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pack_openstates_session.py')

    todo, skipped, unparsed, novotes = [], [], [], []
    for z in zips:
        st, sid, pretty = parse_name(z)
        if not st:
            unparsed.append(os.path.basename(z));  continue
        if only and st not in only:
            continue
        if not has_votes(z):
            novotes.append(f'{st} {sid}');  continue
        dest = os.path.join(args.out, st, sid)
        if os.path.exists(os.path.join(dest, 'votes.json')) and not args.force:
            skipped.append(f'{st} {sid}');  continue
        todo.append((z, st, sid, pretty))

    print(f'{len(zips)} zips found · {len(todo)} to pack · {len(skipped)} already packed · '
          f'{len(novotes)} without vote data · {len(unparsed)} unrecognized', file=sys.stderr)
    if unparsed:
        print('  unrecognized: ' + ', '.join(unparsed[:6]), file=sys.stderr)
    if novotes:
        print('  no vote data: ' + ', '.join(novotes[:10]), file=sys.stderr)
    if args.dry_run:
        for _, st, sid, pretty in todo[:40]:
            print(f'  would pack {st} {sid}  ({pretty})')
        return

    ok = fail = 0
    for i, (z, st, sid, pretty) in enumerate(todo, 1):
        print(f'[{i}/{len(todo)}] {st} {sid}', file=sys.stderr)
        r = subprocess.run([sys.executable, packer, '--zip', z, '--state', st,
                            '--session', sid, '--session-name', pretty, '--base', args.out],
                           capture_output=True, text=True)
        if r.returncode == 0:
            ok += 1
            print('   ' + r.stdout.strip(), file=sys.stderr)
        else:
            fail += 1
            print('   FAILED: ' + (r.stderr.strip().splitlines() or ['?'])[-1], file=sys.stderr)

    # Fill in full state names in the index
    idx_path = os.path.join(args.out, 'sessions.json')
    try:
        idx = json.load(open(idx_path))
        for ab, e in idx.items():
            e['state_name'] = NAMES.get(ab, e.get('state_name', ab))
        json.dump(idx, open(idx_path, 'w'), indent=1)
    except Exception:
        pass

    print(f'\nPacked {ok} sessions, {fail} failed.', file=sys.stderr)


if __name__ == '__main__':
    main()
