# ArtemisHera

**Pantheon Insight Research — unified political intelligence platform.**

ArtemisHera combines three proven prototypes — the Congress Votes tool, the Poseidon opposition-research extractor, and the News Intelligence Dashboard — into one branded application, and adds **Hera**, a messaging-campaign studio that turns any project's findings into a full campaign plan.

**Live app:** https://knunnenkamp25.github.io/ArtemisHera/

## What it does

| Task | How it works |
|---|---|
| **Scrape Federal Votes** | Searches every member of Congress from a repo-hosted member index (12,607 members, rebuilt monthly from Voteview), loads their roll-call record per congress/chamber, extracts keywords, and matches votes to targeting universes. Tries the browser first; when Voteview is unreachable it offers a one-click cloud run that does the same work in GitHub Actions. |
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
- `scripts/build_federal_index.py` — builds `data/federal/members.json` from Voteview's 6 MB member CSV
- `scripts/fetch_federal_votes.py` — server-side vote loader (reads `UNIVERSE_KEYWORDS` straight out of `js/data.js` so the dictionary has one home)
- `.github/workflows/scrape.yml` — news/web scraper runner
- `.github/workflows/federal-votes.yml` — cloud vote lookups + monthly member-index refresh
- Workflows are `workflow_dispatch`, triggered from the app with a user-supplied PAT (stored in localStorage, sent only to api.github.com)
- `data/projects.json` — manifest of cloud projects; `data/news/{id}.json` and `data/federal/{id}.json` — per-project results

### Why Voteview needs a server-side path

Voteview serves no `Access-Control-Allow-Origin` header, so a browser cannot fetch it directly, and the public CORS proxies rate-limit and stall on the 7–15 MB per-congress vote files. Two things follow: the member directory is mirrored into the repo (instant, same-origin), and vote loading falls back to GitHub Actions, which has no CORS constraint. Every browser fetch is time-boxed with `AbortController` so a hung proxy surfaces the fallback instead of spinning forever.

## Configuration

- **Universe Google Sheet:** one list drives all matching (votes, oppo, documents, news). Point the app at a sheet from **Settings → Universe Source** (column A = names, shared "anyone with link"); until then it uses the bundled 211-universe list. Curated keyword patterns for vote matching live in `UNIVERSE_KEYWORDS` in `js/data.js`.
- **GitHub PAT:** needed only for launching cloud scrapes (repo scope or fine-grained Actions write). Prompted in-app on first launch.

## Local development

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

---
*Pantheon Insight Research · Artemis (research) + Hera (messaging)*
