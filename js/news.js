/* =========================================================================
   ArtemisHera — news & web scrapes
   Scrapes run in GitHub Actions (scripts/news_scraper.py); results are
   committed to data/news/{project_id}.json and indexed in data/projects.json.
   The landing page renders that JSON — same model as the news-dashboard.
   ========================================================================= */

const News = {
  async launchScrape({ projectName, urls = [], states = '', dmas = '', types = '',
                       outletCount = 0, mode = 'web', geography = '', stance = 'oppose',
                       days = 2, maxArticles = 50 }) {
    const projectId = 'scr-' + uid();
    await GH.dispatchScrape({
      project_id: projectId,
      project_name: projectName,
      urls: urls.join('\n'),      // manual web scrape only (max 5)
      states, dmas, types,          // geography mode: workflow resolves the URLs
      mode,
      days: String(days),
      max_articles: String(maxArticles),
    });
    // Track locally right away so it shows as "running" in Projects
    Store.saveProject({
      id: projectId,
      name: projectName,
      type: mode === 'news' ? 'news-scrape' : 'web-scrape',
      stance,
      status: 'running',
      subject: mode === 'news' ? geography : urls.map(u => u.replace(/^https?:\/\//, '').split('/')[0]).join(', '),
      summary: mode === 'news'
        ? `${outletCount} outlets · ${geography}`
        : `${urls.length} page${urls.length > 1 ? 's' : ''} queued`,
      // Persist the parameters so "Re-run Scrape" can actually re-run this
      // scrape instead of dumping the user on an empty form. #37
      params: { mode, states, dmas, types, days, maxArticles, urls, geography },
    });
    return projectId;
  },

  fetchResults(projectId) { return fetchRepoJSON(`data/news/${projectId}.json`); },

  // Which workflow produces each cloud project type (for status polling)
  WORKFLOW_FOR: { 'news-scrape': () => CONFIG.GH_WORKFLOW, 'web-scrape': () => CONFIG.GH_WORKFLOW,
                  'topic-search': () => CONFIG.GH_TOPIC_WORKFLOW },

  async refreshRunStatus() {
    // Reconcile locally-tracked "running" cloud projects against Actions runs
    const running = Store._index().filter(p => p.status === 'running' && this.WORKFLOW_FOR[p.type]);
    if (!running.length || !GH.hasToken()) return;
    const runCache = {};
    for (const proj of running) {
      const wf = this.WORKFLOW_FOR[proj.type]();
      if (!runCache[wf]) runCache[wf] = await GH.recentRuns(wf);
      const runs = runCache[wf];
      const run = runs.find(r => (r.name || '').includes(proj.id) || (r.display_title || '').includes(proj.id));
      // Status flips are best-effort: a quota throw out of saveProject would
      // reject refreshRunStatus and blank the whole Projects page.
      try {
        if (run) {
          if (run.status === 'completed') {
            proj.status = run.conclusion === 'success' ? 'complete' : 'failed';
            Store.saveProject(proj);
          }
        } else {
          // No matching run and results exist → completed before we ever polled
          const data = await fetchRepoPayload(proj);
          if (data) { proj.status = 'complete'; Store.saveProject(proj); }
        }
      } catch (e) { console.warn('Could not update run status:', e.message); }
    }
  },
};
