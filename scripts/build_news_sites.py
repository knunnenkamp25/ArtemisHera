#!/usr/bin/env python3
"""
Convert the Local_News_Sites_by_State.xlsx inventory into data/news_sites.json,
joining each outlet's county to its Nielsen TV DMA via a county-DMA crosswalk
(alex-patton/US-TVDMA-BY-COUNTY). The spreadsheet is static, so this runs once
per update of the source file — the app itself only ever reads the JSON.

Usage:
    python scripts/build_news_sites.py \
        --xlsx ~/Downloads/Local_News_Sites_by_State.xlsx \
        --crosswalk /path/to/usa-tvdma-county.csv \
        --out data/news_sites.json
"""

import argparse
import csv
import json
import re

import openpyxl

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


def norm_county(name):
    """Normalize county names for joining: case, punctuation, common variants.
    The crosswalk's Alaska rows carry abbreviations and row numbers
    ("FAIRBANKS NO.STAR BOR8.") — strip those too."""
    n = (name or '').upper().strip()
    n = re.sub(r'\s*\d+\.?$', '', n)                      # trailing row numbers
    n = n.replace('.', ' ').replace("'", '')
    n = re.sub(r'\b(BOR|C A|CENSUS AREA|CITY AND BOROUGH|MUNICIPALITY|COUNTY|PARISH|BOROUGH)\b', '', n)
    n = n.replace('SAINT ', 'ST ').replace(' NO STAR', ' NORTH STAR')
    for a, b in (('LASALLE', 'LA SALLE'), ('DEKALB', 'DE KALB'), ('DESOTO', 'DE SOTO'),
                 ('DEWITT', 'DE WITT'), ('DUPAGE', 'DU PAGE'), (' CITY', '')):
        n = n.replace(a, b)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


def load_crosswalk(path):
    xwalk = {}
    for row in csv.DictReader(open(path, encoding='utf-8', errors='replace')):
        key = (row['STATE_AB'].strip(), norm_county(row['COUNTY']))
        dma = row['TVDMA'].strip().removesuffix(' DMA').strip()
        xwalk[key] = dma
    return xwalk


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', required=True)
    ap.add_argument('--crosswalk', required=True)
    ap.add_argument('--out', default='data/news_sites.json')
    args = ap.parse_args()

    xwalk = load_crosswalk(args.crosswalk)
    wb = openpyxl.load_workbook(args.xlsx, read_only=True)
    ws = wb['Local News Sites by State']

    sites, unmatched = [], []
    rows = ws.iter_rows(values_only=True)
    next(rows)  # header
    for state, market, outlet, typ, website, county in rows:
        if not website or not state:
            continue
        st = STATE_ABBREV.get(str(state).strip(), str(state).strip())
        url = str(website).strip()
        if not url.startswith('http'):
            url = 'https://' + url
        dma = xwalk.get((st, norm_county(str(county or ''))), '')
        if st == 'DC' and not dma:
            dma = 'Washington, DC - MD - VA'   # crosswalk has no DC rows
        if dma.startswith('Unmeasured'):
            dma = ''
        if not dma and county and str(county).strip().lower() not in ('various', 'multiple', 'statewide', ''):
            unmatched.append(f'{county}, {st}')
        sites.append({
            'url': url,
            'name': str(outlet or '').strip(),
            'state': st,
            'market': str(market or '').strip(),
            'county': str(county or '').strip(),
            'dma': dma,
            'type': str(typ or '').strip(),
        })

    with open(args.out, 'w') as f:
        json.dump(sites, f, separators=(',', ':'))

    dmas = sorted(set(s['dma'] for s in sites if s['dma']))
    states = sorted(set(s['state'] for s in sites))
    print(f'{len(sites)} outlets -> {args.out}')
    print(f'{len(states)} states, {len(dmas)} DMAs, {len(unmatched)} county rows unmatched to a DMA')
    if unmatched:
        from collections import Counter
        for c, n in Counter(unmatched).most_common(15):
            print(f'  unmatched: {c} x{n}')


if __name__ == '__main__':
    main()
