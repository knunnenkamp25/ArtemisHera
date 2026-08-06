# ArtemisHera

**Pantheon Insight Research — unified political intelligence platform.**

ArtemisHera combines three proven prototypes — the Congress Votes tool, the Poseidon opposition-research extractor, and the News Intelligence Dashboard — into one branded application, and adds **Hera**, a messaging-campaign studio that turns any project's findings into a full campaign plan.

**Live app:** https://knunnenkamp25.github.io/ArtemisHera/

## What it does

| Task | How it works |
|---|---|
| **Scrape Federal Votes** | Searches every member of Congress (Voteview `HSall_members.csv`), loads their roll-call record per congress/chamber, extracts keywords, and matches votes to OTS targeting models. Runs entirely in the browser with a CORS-proxy fallback chain. |
| **Scrape State Votes** | Pulls pre-scraped LegiScan data (`state_data/` in the congress-votes repo) for state legislators and runs the same analysis. |
| **Upload Oppo Book** | Reads a PDF/DOCX in the browser (pdf.js / mammoth), runs a signal-phrase attack-extraction engine across Poseidon's 23 categories, scores severity, and matches each hit to voter universes. Also imports a Poseidon-skill `attacks.json` directly for full-fidelity results. |
| **Upload Documents** | Any PDF/DOCX/TXT — keyword frequency analysis with tiered universe matching. |
| **News Scrape** | Dispatches a GitHub Actions workflow that runs `scripts/news_scraper.py` against a Google Sheet site list, commits `data/news/{project}.json` back to the repo, and renders a live landing page (keyword cloud, source filters, article cards). |
| **Scrape Web Pages** | Same pipeline, but for up to **5** manually entered URLs. |
| **Projects** | Library of every past/ongoing run — local (browser) and cloud (repo-committed) — with live status for running scrapes, plus export/import of project files. |
| **Hera** | Select any project and generate a messaging campaign: phased channel timeline (email, social, SMS, press, ads), sample emails/tweets/texts/posts, press releases for top hits, and brand-palette ad concepts — each matched to the universes the research surfaced. |

## Architecture

- **No build step.** Static HTML/CSS/JS served by GitHub Pages. Repo-as-database: the Actions workflow commits scrape output JSON back to `data/`.
- `index.html` + `js/*.js` — SPA with hash routing
- `css/main.css` — Pantheon Insight brand system (March 2025 guidelines: forest/tan/gold palette, Gill Sans Nova stack)
- `scripts/news_scraper.py` — multi-strategy scraper (WP REST → RSS → sitemap → HTML waterfall)
- `.github/workflows/scrape.yml` — `workflow_dispatch` scraper runner, triggered from the app with a user-supplied PAT (stored in localStorage, sent only to api.github.com)
- `data/projects.json` — manifest of cloud projects; `data/news/{id}.json` — per-project results

## Configuration

- **OTS universe Google Sheet:** `CONFIG.OTS_SHEET_ID` in `js/data.js` is a **placeholder** — set it to the sheet ID (published/shared "anyone with link") and the app will load models from it; until then it uses the bundled 124-model fallback list.
- **GitHub PAT:** needed only for launching cloud scrapes (repo scope or fine-grained Actions write). Prompted in-app on first launch.

## Local development

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

---
*Pantheon Insight Research · Artemis (research) + Hera (messaging)*
