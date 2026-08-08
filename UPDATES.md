# ArtemisHera — Update Queue

Status legend: `[ ]` queued · `[~]` in progress · `[x]` done

**Batch of 2026-08-07: all five items shipped and verified live.**

| # | Item | Outcome |
|---|---|---|
| 1 | Internalize news site list | `data/news_sites.json` — 3,140 outlets, 99.4% joined to Nielsen DMAs; scrape page is a State/DMA/type picker with live counts |
| 2 | Historical state votes in-repo | 384 sessions, 51 states, 1997–2026 in `ArtemisHera-data`; ~10 GB of archives → ~500 MB packed |
| 3 | Richer ad concepts | Platform-true mockups (FB/X chrome), contrast + quote layouts, PNG export at true ad dimensions |
| 4 | ARTEMIS │ HERA divider | Shipped |
| 5 | Support vs. Oppose | Stance on every project; flows through reports, vulnerability-audit reframing, and all Hera output |

---

## Next: deep dive

1. **Pressure test** the codebase end to end
2. **Fix** problems and future problems found
3. **Recommend** efficiency and product improvements

Known areas to probe (from building it, not yet investigated):

- **Untested paths.** The weekly `state-votes.yml` refresh has never run — the
  Open States `include=votes` shape is assumed, not observed. Cloud federal-vote
  and news-scrape workflows have also never completed a real run.
- **Error handling.** Most `fetch` calls outside `smartFetch` have no timeout.
  A hung request leaves a spinner forever.
- **Scale.** Reports hold every vote in memory and re-render whole tables on
  each filter keystroke; a 22k-rollcall session (CA) may be sluggish.
- **Storage.** localStorage has a ~5 MB quota and a big vote project can
  approach it. No quota handling exists — a failed save is currently silent.
- **Duplication.** Vote-matching logic is implemented twice (JS + Python) and
  can drift; the Python side parses `js/data.js` with regex.
- **Data quality.** Open States `people.json` has empty party/district for
  backfilled sessions (bulk CSVs carry vote records, not rosters).

## Open loose ends

- [ ] **Rotate the Open States API key** — it was visible in a screenshot on 8/7
- [ ] **Test the weekly refresh** — manual dispatch of `state-votes.yml` on one state
- [ ] **Universe Google Sheet** — Settings → Universe Source still on the bundled
      211-universe fallback, pending Ken's replacement sheet
- [ ] **First real news scrape** — pipeline built and wired, never run end to end
- [ ] **Commit `match_rules.json`** once training rules accumulate, so cloud runs
      use the same corrections as the browser
- [ ] **LegiScan** — survey submitted; would fill pre-2017 history and the Texas gap
