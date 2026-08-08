# ArtemisHera — Update Queue

Status legend: `[ ]` queued · `[~]` in progress · `[x]` done

## ⏰ Next session: check Monday's scheduled run

The weekly `State Votes Refresh` fires **Mondays 07:00 UTC** in the *data* repo:
https://github.com/knunnenkamp25/ArtemisHera-data/actions

This is the first unattended run. What to look for in the log:

- `resolved session -> …` should show each state's real id (CA `20252026`,
  OH `136`, MA `194th`) — **not** the current year. If it shows a bare year for
  a state that doesn't use one, session resolution regressed.
- `API reports N matching bills` distinguishes "nothing changed" (fine, most
  states are out of session) from "wrong query" (N=0 for a state that is
  clearly in session).
- Runtime should be minutes, not the 13 minutes one manual backfill test took.
  The `--max-minutes 8` ceiling now bounds it.

Still never observed: a live API response actually parsing into stored votes.
Every run so far correctly found everything already present. Not a defect —
just unproven until a legislature is in session and something new appears.

---

## Shipped 2026-08-07/08

| Area | Outcome |
|---|---|
| News site list | Internal `data/news_sites.json` (3,140 outlets, DMA-joined); State/DMA/type picker |
| State votes | 384 sessions, 51 states, 1997–2026 in `ArtemisHera-data` |
| Ad concepts | Platform-true mockups, contrast/quote layouts, PNG export at spec |
| Masthead | ARTEMIS │ HERA divider; real Pantheon Insight sunburst logo |
| Support vs. Oppose | Stance on every project, flows through reports and all Hera output |
| Matching | Evidence rule (strong signal or two weak), trainable pin/ban rules |
| Progress | Shared component on every slow path, real byte progress |
| Audit | 45 findings; all Critical and high-impact Major fixed over two passes |

---

## Remaining audit backlog (low severity)

Deliberately not fixed — none affect correctness of output:

- **#7** `parseCSV` materializes every row of a multi-million-row Voteview file
  before filtering to ~1,000. Only hit on the browser federal path, which
  already falls back to the cloud when Voteview is slow. Fix = stream and filter
  per line.
- **#14** Project ids are interpolated into `onclick` JS-string contexts in ~8
  places. Locally-generated ids are safe; an imported `.artemishera.json` could
  carry a hostile id. Fix = delegated `data-id` handlers (the pattern already
  used in the vote and oppo tables).
- **#16** Banning a keyword re-runs the full analysis and re-serializes the
  whole payload. Fine at a few thousand votes, sluggish at 20k.
- **#22** `scoreModelMatch`'s tertiary tier is unreachable — keywords are always
  single tokens, so the secondary check always wins first. Confirmed: zero
  tertiary assignments across every committed report. Either remove the tier or
  redefine it.
- **#23** `voteRecords.partial` is an array property, dropped by
  `JSON.stringify`, so nothing downstream can tell a partial report from a
  complete one.
- **#30** `downloadFile` revokes the object URL synchronously and never appends
  the anchor — unreliable in Firefox.
- **#31** `Votes.fetchCloudVotes` and `News.fetchResults` are the same function
  with different paths.
- **#32** The evidence rule is implemented twice (JS vote path vs. JS text
  path) with slightly different scoring. They agree today; they will drift.
- **#37** "Re-run Scrape" discards the original parameters and dumps the user on
  a blank form — scrape params are never persisted.
- **#42** The cache-buster must be hand-bumped in 9 places in `index.html`.
- **#45** CDN libraries load without SRI hashes. The hook exists
  (`SCRIPT_HASHES` in `util.js`); the hashes are not filled in.

## Open loose ends

- [ ] **Rotate the Open States API key** — it appeared in a screenshot on 8/7
- [ ] **Universe Google Sheet** — still on the bundled 211-universe fallback,
      pending Ken's replacement sheet (Settings → Universe Source)
- [ ] **Commit `match_rules.json`** once training rules accumulate, so cloud
      runs apply the same corrections as the browser
- [ ] **Federal cloud vote path** — never exercised; the browser path has always
      succeeded, so the fallback stays unproven
- [ ] **News content quality** — the Richmond scrape returned 48 articles but
      largely syndicated entertainment filler, and only 6 of 24 outlets produced
      anything. Pipeline works; the *content* may need filtering
- [ ] **LegiScan** — survey submitted; would fill pre-2017 history and the Texas
      gap (Open States publishes no recent Texas floor votes)
