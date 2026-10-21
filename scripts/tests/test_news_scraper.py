#!/usr/bin/env python3
"""Offline tests for scripts/news_scraper.py.

Runs a local HTTP server that impersonates the outlet types the cloud runs
kept failing on, then drives the real scrape waterfall against it. No
network access is needed, so it runs in CI and in sandboxes.

    python3 scripts/tests/test_news_scraper.py
"""
import os
import sys
import threading
import unittest
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import news_scraper as ns  # noqa: E402

TODAY = datetime.now().date()
TODAY_ISO = TODAY.strftime("%Y-%m-%d")
TODAY_RFC = datetime(TODAY.year, TODAY.month, TODAY.day, 9, 0).strftime("%a, %d %b %Y %H:%M:%S +0000")
LOREM = ("Council members debated the proposal for nearly three hours before voting. "
         "Residents who spoke said the plan would change the neighborhood. ") * 3


def article_page(title, date_iso, slug):
    return f"""<html><head><title>{title} | Fake Site</title>
<meta property="og:title" content="{title}">
<meta property="article:published_time" content="{date_iso}T09:00:00Z">
</head><body><nav>menu</nav><h1>{title}</h1>
<article><p>{LOREM}</p><p>{LOREM}</p></article><footer>foot</footer></body></html>"""


def feed(items, base):
    body = ""
    for slug, title, pub in items:
        body += f"""<item><title>{title}</title><link>{base}/{slug}</link>
<pubDate>{pub}</pubDate><dc:creator>Staff</dc:creator>
<content:encoded><![CDATA[<p>{LOREM}</p>]]></content:encoded></item>"""
    return ('<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Feed</title>' + body + '</channel></rss>')


class Handler(BaseHTTPRequestHandler):
    base = ""  # set by the test setup: http://127.0.0.1:PORT

    def log_message(self, *a):  # silence
        pass

    def _send(self, code, body="", ctype="text/html; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        query = urlparse(self.path).query
        seg = path.strip("/").split("/")
        site = seg[0] if seg else ""
        rest = "/" + "/".join(seg[1:]) if len(seg) > 1 else "/"
        if site == "siteA":
            return self.site_a(rest)
        if site == "siteB":
            if not self.headers.get("Sec-Fetch-Mode"):
                return self._send(403, "<html>Access denied</html>")
            return self.site_a(rest)  # same content, but behind a WAF
        if site == "siteC":
            return self.site_c(rest, query)
        if site == "siteD":
            return self.site_d(rest)
        if site == "siteE":
            return self._send(403, "blocked")
        if site == "siteF":
            return self.site_f(rest)
        if site == "siteG":
            return self.site_g(rest)
        if site == "siteH":
            return self.site_h(rest)
        if site == "siteJ":   # Hearst-style: a tiny challenge page on every URL
            return self._send(200, "<html><head><title>Just a moment...</title></head><body>"
                                   "Checking your browser before accessing the site. Ray ID: abc</body></html>")
        return self._send(404, "nope")

    # Feed only advertised via <link rel=alternate> at a non-standard path
    def site_a(self, rest):
        b = f"{Handler.base}/{'siteB' if 'siteB' in self.path else 'siteA'}"
        if rest == "/":
            return self._send(200, f'<html><head><link rel="alternate" type="application/rss+xml" '
                                   f'href="{b}/custom/section-news-437.php"></head><body>home</body></html>')
        if rest == "/custom/section-news-437.php":
            items = [(f"story-{i}-long-headline-about-local-events-{i}", f"Story {i} headline", TODAY_RFC) for i in range(3)]
            return self._send(200, feed(items, b), "application/rss+xml")
        return self._send(404, "nope")

    # No feed, no API: homepage links straight to dated article pages
    def site_c(self, rest, query):
        b = f"{Handler.base}/siteC"
        slugs = [f"news/{TODAY.strftime('%Y/%m/%d')}/headline-number-{i}-about-the-city-budget" for i in range(3)]
        old = "news/2020/01/05/an-old-story-that-should-not-be-kept-here"
        if rest == "/":
            links = "".join(f'<a href="{b}/{s}">link {i}</a>' for i, s in enumerate(slugs + [old]))
            return self._send(200, f"<html><body>{links}</body></html>")
        for i, s in enumerate(slugs):
            if rest == "/" + s:
                return self._send(200, article_page(f"Headline number {i} about the city budget", TODAY_ISO, s))
        if rest == "/" + old:
            return self._send(200, article_page("An old story", "2020-01-05", old))
        return self._send(404, "nope")

    # News sitemap is the only index of stories
    def site_d(self, rest):
        b = f"{Handler.base}/siteD"
        slugs = [f"story/{TODAY.strftime('%Y/%m/%d')}/sitemap-listed-headline-{i}-for-testing" for i in range(2)]
        if rest == "/":
            return self._send(200, "<html><body><a href='/siteD/about'>About</a></body></html>")
        if rest == "/news-sitemap.xml":
            urls = "".join(f"<url><loc>{b}/{s}</loc></url>" for s in slugs)
            return self._send(200, f'<?xml version="1.0"?><urlset>{urls}</urlset>', "application/xml")
        for i, s in enumerate(slugs):
            if rest == "/" + s:
                return self._send(200, article_page(f"Sitemap listed headline {i} for testing", TODAY_ISO, s))
        return self._send(404, "nope")

    # WP probe answers 200 with HTML (Hearst-style), feed exists but is stale
    def site_f(self, rest):
        b = f"{Handler.base}/siteF"
        if rest == "/wp-json/wp/v2/posts":
            return self._send(200, "<html>not json</html>")
        if rest == "/":
            return self._send(200, "<html><body>quiet</body></html>")
        if rest in ("/feed", "/feed/"):
            items = [("old-story-slug-that-is-long-enough", "Old story", "Mon, 06 Jan 2020 09:00:00 +0000")]
            return self._send(200, feed(items, b), "application/rss+xml")
        return self._send(404, "nope")


    # Hearst-style: no advertised feed; the homepage links an HTML "RSS" index
    # page that lists the real section feeds at paths nobody would guess
    def site_g(self, rest):
        b = f"{Handler.base}/siteG"
        if rest == "/":
            return self._send(200, f'<html><body><a href="{b}/rss/">RSS</a></body></html>')
        if rest in ("/rss", "/rss/"):
            return self._send(200, f'<html><body><h1>Feeds</h1><a href="{b}/rss/feed/News-437.php">News</a>'
                                   f'<a href="{b}/rss/feed/Sports-12.php">Sports</a></body></html>')
        if rest == "/rss/feed/News-437.php":
            items = [(f"hearst-story-{i}-with-a-long-enough-slug", f"Hearst story {i}", TODAY_RFC) for i in range(2)]
            return self._send(200, feed(items, b), "application/rss+xml")
        return self._send(404, "nope")

    # Only robots.txt knows where the news sitemap is
    def site_h(self, rest):
        b = f"{Handler.base}/siteH"
        slugs = [f"news/{TODAY.strftime('%Y/%m/%d')}/robots-listed-headline-{i}-for-testing" for i in range(2)]
        if rest == "/":
            return self._send(200, "<html><body>nothing to see</body></html>")
        if rest == "/robots.txt":
            return self._send(200, f"User-agent: *\nSitemap: {b}/arc/outboundfeeds/sitemap-archive/\nSitemap: {b}/custom/news-sitemap-2026.xml\n", "text/plain")
        if rest == "/custom/news-sitemap-2026.xml":
            # gzipped, oldest-first: the parser must decompress and reorder
            import gzip as _gz
            old = f"<url><loc>{b}/news/2019/01/01/an-ancient-story-listed-first-in-the-sitemap</loc><lastmod>2019-01-01</lastmod></url>"
            urls = old + "".join(f"<url><loc>{b}/{s}</loc><lastmod>{TODAY_ISO}</lastmod></url>" for s in slugs)
            data = _gz.compress(f'<?xml version="1.0"?><urlset>{urls}</urlset>'.encode())
            self.send_response(200); self.send_header("Content-Type", "application/x-gzip")
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data); return
        for i, s in enumerate(slugs):
            if rest == "/" + s:
                return self._send(200, article_page(f"Robots listed headline {i} for testing", TODAY_ISO, s))
        return self._send(404, "nope")


class ScraperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.server.server_address[1]
        Handler.base = f"http://127.0.0.1:{cls.port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        # Keep politeness delays out of the test clock
        cls._sleep = ns.time.sleep
        ns.time.sleep = lambda s: cls._sleep(min(s, 0.01))
        ns.DELAY_BETWEEN_REQUESTS = 0.01
        ns.MAX_ARTICLES_PER_SITE = 25
        ns.log.setLevel("WARNING")

    @classmethod
    def tearDownClass(cls):
        ns.time.sleep = cls._sleep
        cls.server.shutdown()

    def site(self, name):
        return f"{Handler.base}/{name}"

    def run_one(self, name, dated=True):
        diag = {}
        arts = ns.scrape_site(ns.PageFetcher(), self.site(name),
                              target_dates={TODAY_ISO} if dated else None, diag=diag)
        return arts, diag

    def test_feed_autodiscovery_from_homepage_link_tag(self):
        arts, diag = self.run_one("siteA")
        self.assertEqual(len(arts), 3)
        self.assertEqual(diag["status"], "ok")
        self.assertEqual(diag["method"], "rss")

    def test_waf_403_falls_back_to_browser_profile_session(self):
        arts, diag = self.run_one("siteB")
        self.assertEqual(len(arts), 3, diag)
        self.assertGreaterEqual(diag["challenge_fallback"], 1)

    def test_dated_run_falls_through_to_homepage_links(self):
        arts, diag = self.run_one("siteC")
        self.assertEqual(len(arts), 3, diag)
        self.assertEqual(diag["method"], "html_links")
        self.assertTrue(all(a.date_published == TODAY_ISO for a in arts))

    def test_dated_run_uses_news_sitemap(self):
        arts, diag = self.run_one("siteD")
        self.assertEqual(len(arts), 2, diag)
        self.assertEqual(diag["method"], "sitemap")

    def test_fully_blocked_site_is_reported_as_blocked(self):
        arts, diag = self.run_one("siteE")
        self.assertEqual(arts, [])
        self.assertEqual(diag["status"], "blocked")

    def test_quiet_feed_is_no_recent_not_a_failure(self):
        arts, diag = self.run_one("siteF")
        self.assertEqual(arts, [])
        self.assertEqual(diag["status"], "no_recent")
        self.assertEqual(diag["found"], 1)

    def test_parallel_run_keeps_input_order_and_reports_every_site(self):
        urls = [self.site(n) for n in ("siteA", "siteE", "siteC", "siteD")]
        arts, reports = ns.run_sites(urls, workers=4, target_dates={TODAY_ISO})
        self.assertEqual([r["domain"] for r in reports], [ns._outlet_label(u) for u in urls])
        self.assertEqual([r["status"] for r in reports], ["ok", "blocked", "ok", "ok"])
        self.assertEqual(len(arts), 3 + 0 + 3 + 2)

    def test_run_budget_skips_remaining_sites_and_still_exports(self):
        urls = [self.site("siteA"), self.site("siteC")]
        arts, reports = ns.run_sites(urls, workers=1, max_minutes=1e-9, target_dates={TODAY_ISO})
        self.assertEqual([r["status"] for r in reports], ["skipped", "skipped"])
        meta = ns.summarize_run(reports, 1.0)
        self.assertTrue(meta["run"]["budget_hit"])
        self.assertEqual(meta["outlets"]["tried"], 2)

    def test_rss_index_page_is_harvested_for_section_feeds(self):
        arts, diag = self.run_one("siteG")
        self.assertEqual(len(arts), 2, diag)
        self.assertEqual(diag["method"], "rss")

    def test_robots_txt_sitemap_is_used_gzipped_and_newest_first(self):
        ns.DATE_MODE_PAGE_CAP, cap = 2, ns.DATE_MODE_PAGE_CAP
        try:
            arts, diag = self.run_one("siteH")
        finally:
            ns.DATE_MODE_PAGE_CAP = cap
        # Only two page fetches allowed: they must be the two dated stories,
        # not the 2019 entry the sitemap lists first.
        self.assertEqual(len(arts), 2, diag)
        self.assertEqual(diag["method"], "sitemap")

    def test_challenge_page_on_every_url_is_reported_as_blocked(self):
        arts, diag = self.run_one("siteJ")
        self.assertEqual(arts, [])
        self.assertEqual(diag["status"], "blocked")
        self.assertIn("challenge", diag["note"])

    def test_sitemap_entries_newest_first_with_news_dates_or_year_hint(self):
        base = "https://x.com"
        dated = (f'<urlset xmlns:news="n"><url><loc>{base}/news/old-story-with-a-long-enough-slug</loc>'
                 f'<news:news><news:publication_date>2019-01-01T00:00:00Z</news:publication_date></news:news></url>'
                 f'<url><loc>{base}/news/new-story-with-a-long-enough-slug</loc><lastmod>2026-10-21</lastmod></url></urlset>')
        self.assertEqual([u.rsplit("/", 1)[1][:3] for u in ns._sitemap_entries(dated, base)], ["new", "old"])
        y = ns.datetime.now().year
        undated = "".join(f"<url><loc>{base}/{p}</loc></url>" for p in (
            "news/2011/12/23/ancient-story-with-a-long-slug", "news/2012/01/05/another-ancient-long-slug",
            f"news/{y}/10/20/fresh-story-with-a-long-enough-slug", "news/2013/02/01/undated-but-later-in-file"))
        got = ns._sitemap_entries(f"<urlset>{undated}</urlset>", base)
        self.assertTrue(got[0].endswith("fresh-story-with-a-long-enough-slug"))
        self.assertTrue(got[1].endswith("undated-but-later-in-file"))

    def test_sitemap_with_identical_stamps_orders_by_trailing_story_id(self):
        base = "https://x.com"
        blocks = "".join(
            f'<url><loc>{base}/stories/{slug},{sid}</loc><news:news><news:publication_date>2026-10-21T00:00:00Z'
            f'</news:publication_date></news:news></url>'
            for slug, sid in (("an-old-story-from-way-back", 1200), ("a-newer-story-slug-here", 98000), ("mid-story-slug-value", 45000)))
        got = ns._sitemap_entries(f'<urlset xmlns:news="n">{blocks}</urlset>', base)
        self.assertEqual([ns._trailing_id(h) for h in got], [98000, 45000, 1200])

    def test_same_story_from_two_outlets_is_kept_once(self):
        urls = [self.site("siteA"), self.site("siteA")]
        arts, reports = ns.run_sites(urls, workers=2, target_dates={TODAY_ISO})
        self.assertEqual(len(arts), 3)
        self.assertEqual([r["kept"] for r in reports], [3, 3])

    def test_links_survive_a_www_redirect(self):
        html = '<a href="https://nymag.com/intelligencer/article/a-long-headline-about-the-mayor-race">x</a>'
        self.assertEqual(len(ns.discover_article_links(html, "https://www.nymag.com")), 1)
        self.assertTrue(ns.same_site("https://www.nymag.com/", "https://nymag.com/x"))
        self.assertFalse(ns.same_site("https://www.nymag.com/", "https://www.vulture.com/"))

    def test_outlet_label_keeps_section_paths(self):
        self.assertEqual(ns._outlet_label("https://www.patch.com/new-york/brooklyn"), "www.patch.com/new-york/brooklyn")
        self.assertEqual(ns._outlet_label("https://www.ctpost.com/"), "www.ctpost.com")

    def test_retry_after_accepts_http_date_and_caps(self):
        class R:
            def __init__(self, v): self.headers = {"Retry-After": v}
        self.assertEqual(ns._retry_after_seconds(R("86400"), 5), 120.0)
        future = (datetime.utcnow() + timedelta(seconds=30)).strftime("%a, %d %b %Y %H:%M:%S GMT")
        self.assertTrue(0 < ns._retry_after_seconds(R(future), 5) <= 31)
        self.assertEqual(ns._retry_after_seconds(R("garbage"), 7), 7)

    def test_feed_url_discovery_prefers_link_tags_and_skips_comments(self):
        html = ('<link rel="alternate" type="application/rss+xml" href="/rss/feed/News-437.php">'
                '<link rel="alternate" type="application/rss+xml" href="/comments/feed/">'
                '<a href="/search/?f=rss&t=article">RSS</a><a href="/about">x</a>')
        got = ns.discover_feed_urls_from_html(html, "https://example.com/")
        self.assertEqual(got, ["https://example.com/rss/feed/News-437.php",
                               "https://example.com/search/?f=rss&t=article"])

    def test_dashboard_json_carries_outlet_diagnostics(self):
        import json, tempfile
        arts, reports = ns.run_sites([self.site("siteA")], target_dates={TODAY_ISO})
        meta = ns.summarize_run(reports, 2.0)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "out.json")
            ns.export_dashboard_json(arts, path, run_meta=meta)
            data = json.load(open(path))
        self.assertEqual(data["meta"]["total"], 3)
        self.assertEqual(data["meta"]["outlets"]["produced"], 1)
        self.assertEqual(data["meta"]["sites"][0]["status"], "ok")


if __name__ == "__main__":
    unittest.main(verbosity=2)
