#!/usr/bin/env python3
"""Offline tests for scripts/topic_search.py against a fixture session on disk.

    python3 scripts/tests/test_topic_search.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'topic_search.py')
sys.path.insert(0, os.path.join(HERE, '..'))
import topic_search as ts  # noqa: E402


def write_fixture(base):
    """One state, one session: a 10-seat Senate and a 20-seat House."""
    sess = os.path.join(base, 'ZZ', '2026')
    os.makedirs(sess)
    people = []
    for i in range(10):
        people.append({'people_id': f's{i}', 'name': f'Senator {i}', 'party': 'Democratic' if i < 6 else 'Republican', 'role': 'Senate', 'district': str(i)})
    for i in range(20):
        people.append({'people_id': f'h{i}', 'name': f'Delegate {i}', 'party': 'Democratic' if i < 11 else 'Republican', 'role': 'House', 'district': str(i)})
    rollcalls = [
        ['SB1', 'Data centers; siting and noise.', '2026-01-10', 'S VOTE:', 'Pass', 'Senate'],              # committee: 4 voters
        ['SB1', 'Data centers; siting and noise.', '2026-01-20', 'Passage', 'Pass', 'Senate'],              # floor: 10 voters
        ['SB1', 'Data centers; siting and noise.', '2026-02-01', 'Adopt Conference Committee Report', 'Pass', 'House'],  # floor despite the word
        ['HB7', 'High energy use facility; water reporting.', '2026-01-15', 'H VOTE:', 'Fail', 'House'],    # floor: 20 voters
        ['HB9', 'Budget bill.', '2026-01-16', 'H VOTE:', 'Pass', 'House'],                                   # no match
    ]
    votes = {}
    def cast(pid, idx, code): votes.setdefault(pid, []).append([idx, code])
    for i in range(4): cast(f's{i}', 0, 1)
    for i in range(10): cast(f's{i}', 1, 1 if i < 7 else 2)
    for i in range(20): cast(f'h{i}', 2, 1 if i < 15 else 2)
    for i in range(20): cast(f'h{i}', 3, 2 if i < 12 else 1)
    for i in range(20): cast(f'h{i}', 4, 1)
    json.dump(people, open(os.path.join(sess, 'people.json'), 'w'))
    json.dump(rollcalls, open(os.path.join(sess, 'rollcalls.json'), 'w'))
    json.dump(votes, open(os.path.join(sess, 'votes.json'), 'w'))
    json.dump({'ZZ': {'state_name': 'Zedland', 'sessions': [
        {'id': '2026', 'name': '2026 Session', 'year_start': 2026, 'year_end': 2026, 'people_count': 30},
        {'id': '2015', 'name': '2015 Session', 'year_start': 2015, 'year_end': 2015, 'people_count': 30}]}},
        open(os.path.join(base, 'sessions.json'), 'w'))


class TopicSearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.base = os.path.join(cls.tmp.name, 'state')
        write_fixture(cls.base)
        cls.out = os.path.join(cls.tmp.name, 'out.json')
        r = subprocess.run([sys.executable, SCRIPT, '--phrases', 'data center|high energy use facility',
                            '--base', cls.base, '--from-year', '2020', '--project-id', 'tp-x', '--name', 'x',
                            '--out', cls.out], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.data = json.load(open(cls.out))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def bill(self, n):
        return next(b for b in self.data['bills'] if b['bill'] == n)

    def test_phrases_match_titles_with_plurals_and_skip_unrelated_bills(self):
        self.assertEqual(sorted(b['bill'] for b in self.data['bills']), ['HB7', 'SB1'])
        self.assertEqual(self.bill('SB1')['phrases'], ['data center'])
        self.assertEqual(self.bill('HB7')['phrases'], ['high energy use facility'])

    def test_year_filter_skips_old_sessions(self):
        self.assertEqual(self.data['meta']['sessions_scanned'], 1)

    def test_committee_votes_are_sized_against_the_chamber(self):
        rcs = self.bill('SB1')['rollcalls']
        self.assertEqual([rc['committee'] for rc in rcs], [True, False, False])
        self.assertEqual(self.bill('SB1')['floor_rollcalls'], 2)

    def test_party_split_and_tally(self):
        floor = self.bill('SB1')['rollcalls'][1]
        self.assertEqual(floor['tally']['Yes'], 7)
        self.assertEqual(floor['by_party']['Republican'], {'Yes': 1, 'No': 3})
        self.assertEqual(len(floor['votes']), 10)

    def test_legislator_index_counts_floor_votes_only(self):
        s0 = next(L for L in self.data['legislators'] if L['people_id'] == 's0')
        self.assertEqual((s0['yes'], s0['no']), (1, 0))       # committee vote not counted
        h0 = next(L for L in self.data['legislators'] if L['people_id'] == 'h0')
        self.assertEqual((h0['yes'], h0['no']), (1, 1))
        self.assertEqual(h0['bills'], ['ZZ HB7', 'ZZ SB1'])

    def test_last_result_comes_from_the_last_floor_vote(self):
        self.assertEqual(self.bill('HB7')['last_result'], 'Fail')
        self.assertEqual(self.bill('SB1')['last_result'], 'Pass')

    def test_is_committee_falls_back_to_label_without_chamber_size(self):
        self.assertTrue(ts.is_committee('Reported from Finance', 30, 0))
        self.assertFalse(ts.is_committee('Passage', 30, 0))
        self.assertFalse(ts.is_committee('Adopt Conference Committee Report', 38, 40))


if __name__ == '__main__':
    unittest.main(verbosity=2)
