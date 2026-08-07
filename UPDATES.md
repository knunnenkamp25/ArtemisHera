# ArtemisHera — Update Queue

Running list of changes to batch together. Logged 2026-08-07; work begins next session.
Status legend: `[ ]` queued · `[~]` in progress · `[x]` done

**Batch shipped 2026-08-07.** Notes: news list internalized as `data/news_sites.json`
(3,140 outlets, 99.4% joined to DMAs via county crosswalk); VA 2025 votes packed
into `data/state/` (124 MB → 4.9 MB normalized format) with LegiScan backfill
workflow ready pending the `LEGISCAN_KEY` secret; ads rebuilt as platform-true
mockups (FB/X chrome, contrast + quote layouts, PNG export at spec via
html2canvas); stance flows through setup → reports → all Hera output.
Remaining from this batch: add LEGISCAN_KEY secret + run backfill dispatches.

---

## 1. [x] Internalize the news site list (geography picker)

Bring the news-websites spreadsheet into the app as a static data file — it's small
and won't change, so there's no reason to depend on a Google Sheet at scrape time.

- Convert the sheet to `data/news_sites.json`: `{ url, name, state, dma }` per site
  (**need the spreadsheet from Ken** — the old `SHEET_URL` secret's sheet, or a fresh export)
- Replace the "Google Sheet URL" field on Begin News Scrape with in-app **geography
  selection: State and DMA** (multi-select; DMA list derived from whatever the sheet carries)
- Workflow change: pass the selected site subset to the scraper (`-f` url-list file built
  from the JSON at run time) instead of `--sheet`
- Keep manual web-page scrape (5-URL) unchanged
- Note: sites-by-DMA needs the sheet to carry DMA per site; if it only has state,
  add a state→DMA crosswalk column while importing

## 2. [x] Store historical state legislative votes in-repo (through 2025)

Static data; hosting it ourselves removes the risk of LegiScan or the congress-votes
repo going away. Scrape only the current year going forward.

- Audit what exists in `knunnenkamp25/congress-votes/state_data/` today (currently VA 2025
  only, 142 members) and what LegiScan can backfill (datasets exist per session as bulk JSON)
- Size check before committing: rough estimate is tens of MB per state-decade, not GB —
  verify actual sizes; if a single repo gets bloated, use a dedicated `ArtemisHera-data`
  repo and point `CONFIG.STATE_DATA_BASE` at it (raw.githubusercontent serves fine)
- Structure: keep the existing `{state}/{session}/people.json` + `{people_id}.json` shape
  so `js/votes.js` needs only a base-URL change
- Add a GitHub Actions job (or script) for the current-year scrape that appends to the store
- **Need from Ken:** LegiScan API key if we backfill via API; or confirm bulk-dataset
  downloads are the path

## 3. [x] Workshop richer ad concepts in Hera

Current output (headline + kicker + CTA on flat brand-color backgrounds) is too thin.
Ideas to workshop together before building:

- **Format-true mockups:** render at real ad dimensions (300×250 / 970×250 / 1080×1080 /
  1200×628) with platform chrome (FB/IG post frame, promoted-tweet frame) so they read
  as ads, not colored cards
- **Layout variety:** contrast/quote cards ("They said X / They did Y"), receipt-style
  evidence cards (vote number, date, dollar amount pulled from the hit's key_detail),
  stat callouts (big number + source line), side-by-side comparison frames
- **Visual texture:** the sunburst mark as a watermark, halftone/paper textures via CSS,
  severity-driven art direction (Major = starkest treatment)
- **Copy depth:** headline + support line + citation line + disclaimer slot, all from the
  hit; A/B variants per concept
- **Export:** download any concept as PNG (html2canvas or SVG render) sized to spec so
  they're usable as actual creative comps
- Decide: keep pure-CSS mocks vs. generate real image files

## 4. [x] Masthead: separate ARTEMIS and HERA

Add a space and a vertical divider between ARTEMIS and HERA in the app label
(mirroring the divider treatment already between the PI lockup and the app name).

## 5. [x] Support vs. Oppose mode (the big one)

Every project gets a stance: are we **for** this person or **against** them?
This should flow through everything:

- **Project creation:** stance selector (Support / Oppose) on every setup page;
  stored on project meta; changeable later from the report
- **Vote reports:** framing flips — for a supported elected, high-Yes universes are
  *validation/persuasion targets* ("tout this record to these people"); for an opposed
  one they're *attack surfaces*. Column emphasis and report language should follow.
- **Oppo extraction:** against = attacks (current behavior); for = **vulnerability audit**
  (same hits reframed as "what we must inoculate against") — category labels, severity
  language, and report title all shift
- **Hera is where it transforms most:**
  - Universe selection: oppose = target the universes the hits resonate with;
    support = target base + persuadables where the record is a *positive*, and
    inoculation audiences where it's a liability
  - Script/copy generation: entirely separate template sets — positive/contrast/GOTV
    voice for support vs. hit-driven voice for oppose (current templates are all oppose)
  - Timeline phases: support arc (define yourself → build record narrative → GOTV) vs.
    oppose arc (define them → sustained hits → close)
  - Press releases: endorsement/accomplishment format vs. attack format
  - Ad concepts: positive art direction (record, biography, endorsements) vs. contrast/attack
- Default: existing projects = Oppose (matches current behavior); prompt on first open

---

## After the batch: deep dive (Ken's ask)

1. **Pressure test** existing code end to end
2. **Fix** problems and future problems found
3. **Recommend** efficiency and product improvements
