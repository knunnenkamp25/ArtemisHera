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

## Audit backlog — cleared

All 45 findings are now addressed. The final pass:

- **#7** Voteview CSVs are filtered during the parse (`parseCSVFiltered`) instead
  of materializing ~1M row objects to keep ~1,000.
- **#14** Project ids no longer reach inline `onclick` JS-string contexts;
  the Projects list and delete modal use delegated `data-id` handlers.
- **#22** The tertiary match tier was unreachable dead code. Redefined as a real
  morphological variant match via `wordVariants` — a looser shared-prefix rule
  fired on 45% of keywords, so it was tightened to 194 assignments on the VA
  sample, e.g. "services" → Veterans through *military service*.
- **#23** `partial` returned alongside the array instead of as an array property
  `JSON.stringify` silently drops.
- **#30** `downloadFile` appends the anchor (Firefox needs it) and defers revoke.
- **#31** One `fetchRepoJSON`, replacing two byte-identical copies.
- **#32** One `evidenceVerdict` in `data.js`; both the vote and text paths call
  it rather than each implementing the rule. Verified behaviour-preserving —
  VA 2025 still yields 42 universes, Spanberger H118 still 29.
- **#37** Scrape parameters are persisted, so "Re-run Scrape" actually re-runs.
- **#42** One `APP_VERSION` in `index.html` drives every asset URL. This needed
  a boot guard: dynamically injected scripts can finish after
  `DOMContentLoaded`, so `App.route()` now checks `readyState`.
- **#45** CDN scripts load with `crossorigin` and an SRI hook (`SCRIPT_HASHES`);
  populate it to pin a library.

## Marketing collateral (local only, gitignored)

Lives in `marketing/` — not committed, since the repo is public and the deck
names internal next steps:

- `Artemis_OnePager.pdf` / `Hera_OnePager.pdf` — Franking-style one-pagers.
  Rebuild: edit the HTML, then print via headless Chrome (Letter, no margins).
- `ArtemisHera_Deck.pptx` — 12 slides, Sweet Briar design system, real app
  screenshots. Rebuild from the repo root: `python3 marketing/build_deck.py`
  (screenshots live in `_refs/shots/`, captured off `_shot.html`, which seeds
  demo projects from the real VA 2025 pipeline).
- Deck ends on next steps: Poseidon DB integration (Jessie), permanent home at
  www.artemishera.pantheoninsight.com, customer-facing portal.

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
- [ ] **Re-run the Long Island scrape after pushing** — run 31822970969 died
      because CI-only CDN hostility hit three fatal paths in the scraper
      (date-form Retry-After, unguarded WP-API size probes, no per-site
      isolation). Fixed in c1bce76; the workflow runs whatever is on main, so
      push before re-running. Use "Re-run Scrape" on the failed project —
      the parameters were saved
- [ ] **LegiScan** — survey submitted; would fill pre-2017 history and the Texas
      gap (Open States publishes no recent Texas floor votes)
