/* =========================================================================
   ArtemisHera — project store
   Local projects live in localStorage. News/web-scrape projects produced by
   GitHub Actions live in the repo (data/projects.json + data/news/{id}.json)
   and are merged in at read time.
   ========================================================================= */

const Store = {
  INDEX_KEY: 'artemishera.projects',

  _index() {
    try { return JSON.parse(localStorage.getItem(this.INDEX_KEY) || '[]'); }
    catch (e) { return []; }
  },
  _saveIndex(list) { localStorage.setItem(this.INDEX_KEY, JSON.stringify(list)); },

  // meta: {id, name, type, status, subject, created, updated, summary}
  saveProject(meta, payload) {
    const list = this._index().filter(p => p.id !== meta.id);
    meta.updated = new Date().toISOString();
    meta.created = meta.created || meta.updated;
    meta.origin = 'local';
    list.unshift(meta);
    this._saveIndex(list);
    if (payload !== undefined) {
      localStorage.setItem('artemishera.project.' + meta.id, JSON.stringify(payload));
    }
    return meta;
  },

  getMeta(id) { return this._index().find(p => p.id === id) || null; },

  getPayload(id) {
    try { return JSON.parse(localStorage.getItem('artemishera.project.' + id)); }
    catch (e) { return null; }
  },

  deleteProject(id) {
    this._saveIndex(this._index().filter(p => p.id !== id));
    localStorage.removeItem('artemishera.project.' + id);
  },

  // Repo-side projects (news / web scrapes committed by the Actions workflow)
  async repoProjects() {
    try {
      const resp = await fetch('data/projects.json?t=' + Date.now());
      if (!resp.ok) return [];
      const arr = await resp.json();
      return (Array.isArray(arr) ? arr : []).map(p => ({ ...p, origin: 'repo' }));
    } catch (e) { return []; }
  },

  async allProjects() {
    const local = this._index();
    const repo = await this.repoProjects();
    const seen = new Set(local.map(p => p.id));
    const merged = [...local, ...repo.filter(p => !seen.has(p.id))];
    merged.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    return merged;
  },

  exportProject(id) {
    const meta = this.getMeta(id);
    const payload = this.getPayload(id);
    if (!meta) return;
    downloadFile(
      (meta.name || 'project').replace(/[^\w-]+/g, '_') + '.artemishera.json',
      JSON.stringify({ meta, payload }, null, 2),
      'application/json'
    );
  },

  importProject(obj) {
    if (!obj || !obj.meta || !obj.meta.id) throw new Error('Not a valid ArtemisHera project file');
    this.saveProject(obj.meta, obj.payload);
    return obj.meta;
  },
};

// ── GitHub PAT handling (for workflow dispatch + run status, news-dashboard pattern) ──
const GH = {
  TOKEN_KEY: 'artemishera.gh_pat',
  getToken() { return localStorage.getItem(this.TOKEN_KEY) || ''; },
  setToken(t) { t ? localStorage.setItem(this.TOKEN_KEY, t) : localStorage.removeItem(this.TOKEN_KEY); },

  async api(path, opts = {}) {
    const token = this.getToken();
    if (!token) throw new Error('NO_TOKEN');
    const resp = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        ...(opts.headers || {}),
      },
    });
    if (resp.status === 401) throw new Error('BAD_TOKEN');
    return resp;
  },

  async dispatchScrape(inputs) {
    const resp = await this.api(
      `/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows/${CONFIG.GH_WORKFLOW}/dispatches`,
      { method: 'POST', body: JSON.stringify({ ref: 'main', inputs }) }
    );
    if (resp.status !== 204) {
      const body = await resp.text();
      throw new Error('Dispatch failed (' + resp.status + '): ' + body.slice(0, 200));
    }
    return true;
  },

  async recentRuns() {
    try {
      const resp = await this.api(
        `/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows/${CONFIG.GH_WORKFLOW}/runs?per_page=15`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.workflow_runs || [];
    } catch (e) { return []; }
  },
};
