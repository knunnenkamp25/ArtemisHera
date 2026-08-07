#!/usr/bin/env python3
"""
Server-side federal vote loader.

Voteview blocks browser access (no CORS headers) and the free CORS proxies are
unreliable on multi-megabyte vote files. This script runs in GitHub Actions,
pulls the vote + rollcall CSVs for a member, joins them, extracts keywords, and
writes a report JSON the app renders directly.

Usage:
    python scripts/fetch_federal_votes.py \
        --project-id fed-abc123 --bioguide A000370 --name "ADAMS, Alma" \
        --congress-from 118 --congress-to 119 --chamber both \
        --out data/federal/fed-abc123.json
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.request

BASES = [
    'https://voteview.com/static/data/out',
    'https://voteview.polisci.ucla.edu/static/data/out',
]
CAST_CODES = {1: 'Yes', 2: 'Yes', 3: 'Yes', 4: 'No', 5: 'No', 6: 'No',
              7: 'Present', 8: 'Present', 9: 'Not Voting'}
PARTY_CODES = {'100': 'Democratic', '200': 'Republican', '328': 'Independent'}

STOP = set("""a an the of to for in on and or by with from at is it be as that this which act bill
resolution provide providing amend relating united states america congress house senate section
purpose purposes other certain establish authorize making regarding concerning department federal
require general agreeing agreed passage motion table suspend rules stat app cong sess under title
joint submitted chapter code proceed upon cloture nomination confirmation invoke invoking calendar
consideration referred clerk thereof shall may such not into been has have would further than its
all secretary virginia florida texas california ohio new york pennsylvania georgia illinois michigan
north carolina south carolina arizona colorado missouri indiana iowa oregon utah district columbia
judge circuit court""".split())


def fetch(path):
    last = None
    for base in BASES:
        try:
            req = urllib.request.Request(f'{base}/{path}',
                                         headers={'User-Agent': 'ArtemisHera/1.0'})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read().decode('utf-8', errors='replace')
        except Exception as e:
            last = e
    raise RuntimeError(f'Could not fetch {path}: {last}')


def extract_keywords(text):
    words = [w for w in re.split(r'\W+', (text or '').lower())
             if len(w) > 3 and w not in STOP]
    return sorted(set(words))


def load_topic_keywords():
    """Mirror the browser's unified universe matching from js/data.js.

    Every universe in POSEIDON_UNIVERSES gets a pattern list: the curated
    UNIVERSE_KEYWORDS entry when one exists, otherwise the full lowercased
    name as a single phrase (len >= 6) — same rules as universePatterns().
    Note: the server can't see a user's sheet override (it lives in browser
    localStorage), so cloud runs always match against the bundled list.
    """
    src = open(os.path.join(os.path.dirname(__file__), '..', 'js', 'data.js')).read()

    block = src.split('const UNIVERSE_KEYWORDS = {', 1)[1].split('\n};', 1)[0]
    curated = {}
    for line in block.splitlines():
        m = re.match(r"\s*'([^']+)':\s*\[(.*)\],\s*$", line)
        if m:
            curated[m.group(1)] = re.findall(r"'([^']*)'", m.group(2))

    uni_block = src.split('const POSEIDON_UNIVERSES = [', 1)[1].split('];', 1)[0]
    universes = re.findall(r"'([^']+)'", uni_block)

    topics = {}
    for name in universes:
        if name in curated:
            topics[name] = curated[name]
        elif len(name) >= 6:
            topics[name] = [name.lower()]
    return topics


def icpsrs_for(bioguide):
    text = fetch('members/HSall_members.csv')
    ids, member = set(), None
    for r in csv.DictReader(io.StringIO(text)):
        if r.get('bioguide_id') != bioguide:
            continue
        ids.add(r['icpsr'])
        if member is None or int(r['congress']) >= member['_c']:
            member = {'_c': int(r['congress']), 'bioguide_id': bioguide,
                      'name': r['bioname'], 'state': r['state_abbrev'],
                      'party': PARTY_CODES.get(r['party_code'], 'Other')}
    if member:
        member.pop('_c')
    return ids, member


def load_votes(icpsrs, congress_from, congress_to, chamber):
    records = []
    for congress in range(congress_from, congress_to + 1):
        for ch, prefix in (('House', 'H'), ('Senate', 'S')):
            if chamber != 'both' and ch != chamber:
                continue
            try:
                votes = list(csv.DictReader(io.StringIO(fetch(f'votes/{prefix}{congress}_votes.csv'))))
                rolls = list(csv.DictReader(io.StringIO(fetch(f'rollcalls/{prefix}{congress}_rollcalls.csv'))))
            except Exception as e:
                print(f'  skip {prefix}{congress}: {e}', file=sys.stderr)
                continue
            rc_map = {r['rollnumber']: r for r in rolls}
            hits = 0
            for v in votes:
                if v.get('icpsr') not in icpsrs:
                    continue
                rc = rc_map.get(v.get('rollnumber'), {})
                desc = rc.get('vote_desc') or rc.get('dtl_desc') or rc.get('vote_question') or ''
                records.append({
                    'date': rc.get('date', ''), 'congress': congress, 'chamber': ch,
                    'bill_number': rc.get('bill_number', ''), 'description': desc,
                    'question': rc.get('vote_question', ''), 'result': rc.get('vote_result', ''),
                    'member_vote': CAST_CODES.get(int(v.get('cast_code') or 0), 'Unknown'),
                    'keywords': extract_keywords((rc.get('bill_number', '') or '') + ' ' + desc),
                })
                hits += 1
            print(f'  {prefix}{congress}: {hits} votes', file=sys.stderr)
    records.sort(key=lambda r: r['date'], reverse=True)
    return records


def pattern_hit(hay, pattern):
    """Mirror js patternHit(): word-boundary match for short patterns —
    plain substring poisons them ('ssi' hits 'commission')."""
    p = pattern.strip()
    if len(p) >= 5:
        return pattern in hay
    return re.search(r'\b' + re.escape(p) + r'\b', hay) is not None


def match_topics(records, topics):
    out = []
    for model, patterns in topics.items():
        yes = no = other = 0
        matched = set()
        for v in records:
            hay = (v['description'] + ' ' + ' '.join(v['keywords'])).lower()
            hit = next((p for p in patterns if pattern_hit(hay, p)), None)
            if not hit:
                continue
            matched.add(hit)
            if v['member_vote'] == 'Yes':
                yes += 1
            elif v['member_vote'] == 'No':
                no += 1
            else:
                other += 1
        total = yes + no + other
        if total:
            out.append({'model': model, 'total': total, 'yes': yes, 'no': no,
                        'other': other, 'matchedKeywords': sorted(matched)})
    out.sort(key=lambda t: -t['total'])
    return out


def score_tier(kw, patterns):
    if kw in patterns:
        return 'primary'
    for p in patterns:
        if kw in p or p in kw:
            return 'secondary'
    kw_words = kw.split()
    for p in patterns:
        if any(w in p.split() for w in kw_words):
            return 'tertiary'
    return None


def analyze_keywords(records, topics):
    agg = {}
    for v in records:
        for kw in v['keywords']:
            a = agg.setdefault(kw, {'keyword': kw, 'total': 0, 'yes': 0, 'no': 0, 'other': 0})
            a['total'] += 1
            if v['member_vote'] == 'Yes':
                a['yes'] += 1
            elif v['member_vote'] == 'No':
                a['no'] += 1
            else:
                a['other'] += 1
    results = [a for a in agg.values() if a['total'] >= 2]
    rank = {'primary': 0, 'secondary': 1, 'tertiary': 2}
    for a in results:
        a['percentage'] = round(a['yes'] / a['total'] * 100) if a['total'] else 0
        tiered = []
        for model, patterns in topics.items():
            tier = score_tier(a['keyword'], patterns)
            if tier:
                tiered.append({'model': model, 'tier': tier})
        tiered.sort(key=lambda t: rank[t['tier']])
        a['tieredModels'] = tiered[:5]
    results.sort(key=lambda a: -a['total'])
    return results[:400]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--project-id', required=True)
    ap.add_argument('--bioguide', required=True)
    ap.add_argument('--name', default='')
    ap.add_argument('--congress-from', type=int, required=True)
    ap.add_argument('--congress-to', type=int, required=True)
    ap.add_argument('--chamber', default='both', choices=['both', 'House', 'Senate'])
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    print('Resolving ICPSR ids…', file=sys.stderr)
    icpsrs, member = icpsrs_for(args.bioguide)
    if not icpsrs:
        raise SystemExit(f'No ICPSR ids found for bioguide {args.bioguide}')
    member = member or {'name': args.name, 'bioguide_id': args.bioguide}

    print('Loading votes…', file=sys.stderr)
    records = load_votes(icpsrs, args.congress_from, args.congress_to, args.chamber)
    topics_dict = load_topic_keywords()

    payload = {
        'member': member,
        'votes': records,
        'topics': match_topics(records, topics_dict),
        'keywords': analyze_keywords(records, topics_dict),
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))
    print(f'Wrote {len(records)} votes to {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
