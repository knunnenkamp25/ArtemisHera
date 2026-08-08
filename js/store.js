/* =========================================================================
   ArtemisHera — project store
   Local projects live in localStorage. News/web-scrape projects produced by
   GitHub Actions live in the repo (data/projects.json + data/news/{id}.json)
   and are merged in at read time.
   ========================================================================= */

const Store = {
  INDEX_KEY: 'artemishera.projects',

  _index() {
    try {
      const v = JSON.parse(localStorage.getItem(this.INDEX_KEY) || '[]');
      return Array.isArray(v) ? v : [];     // corrupted write must not throw later
    } catch (e) { return []; }
  },
  _saveIndex(list) { localStorage.setItem(this.INDEX_KEY, JSON.stringify(list)); },

  // meta: {id, name, type, status, subject, created, updated, summary}
  // Payload first, then the index. The reverse order left a ghost entry in the
  // library whenever the payload write blew the ~5MB localStorage quota — the
  // project appeared but could never be opened.
  saveProject(meta, payload) {
    // Only stamp `updated` when a payload is actually written. Metadata-only
    // saves (opening a cloud report, reconciling run status) used to rewrite it,
    // so simply viewing a project showed today's date and jumped it to the top.
    if (payload !== undefined) meta.updated = new Date().toISOString();
    else meta.updated = meta.updated || new Date().toISOString();
    meta.created = meta.created || meta.updated;
    meta.origin = 'local';

    if (payload !== undefined) {
      try {
        localStorage.setItem('artemishera.project.' + meta.id, JSON.stringify(payload));
      } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        throw new Error(quota
          ? 'Browser storage is full — this report is too large to save. Export an older project and delete it from Projects to free space.'
          : 'Could not save this project: ' + e.message);
      }
    }
    const list = this._index().filter(p => p.id !== meta.id);
    list.unshift(meta);
    try {
      this._saveIndex(list);
    } catch (e) {
      localStorage.removeItem('artemishera.project.' + meta.id);   // don't orphan the payload
      throw new Error('Browser storage is full — could not update the project list.');
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
      const resp = await fetchTimed('data/projects.json?t=' + Date.now());
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
  EXPIRY_KEY: 'artemishera.gh_pat_expiry',

  getToken() { return localStorage.getItem(this.TOKEN_KEY) || ''; },
  // Presence check — use this instead of reading the token when you only need
  // to know whether one is stored. The value itself should never be logged,
  // rendered, or copied anywhere.
  hasToken() { return !!localStorage.getItem(this.TOKEN_KEY); },
  setToken(t) {
    if (t) localStorage.setItem(this.TOKEN_KEY, t);
    else { localStorage.removeItem(this.TOKEN_KEY); localStorage.removeItem(this.EXPIRY_KEY); }
  },
  getExpiry() { return localStorage.getItem(this.EXPIRY_KEY) || ''; },

  async api(path, opts = {}) {
    const token = this.getToken();
    if (!token) throw new Error('NO_TOKEN');
    const resp = await fetchTimed(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        ...(opts.headers || {}),
      },
    });
    // GitHub reports fine-grained token expiry on every response; cache it so
    // the Settings page can warn before the token lapses.
    const exp = resp.headers.get('github-authentication-token-expiration');
    if (exp) localStorage.setItem(this.EXPIRY_KEY, exp);
    // 401 = the token itself is invalid or revoked. 403 usually means the token
    // is fine but lacks a permission — never discard it for that.
    if (resp.status === 401) throw new Error('BAD_TOKEN');
    return resp;
  },

  // Validate the stored token against the repo. Returns {ok, reason, expiry}.
  async verify() {
    if (!this.hasToken()) return { ok: false, reason: 'No token saved yet.' };
    let resp;
    try {
      resp = await this.api(`/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows`);
    } catch (e) {
      if (e.message === 'BAD_TOKEN') return { ok: false, reason: 'Token was rejected by GitHub — it may have been revoked or expired.', invalid: true };
      return { ok: false, reason: 'Could not reach GitHub: ' + e.message };
    }
    if (resp.status === 403) return { ok: false, reason: `Token is valid but lacks the "Actions: Read and write" permission on ${CONFIG.GH_REPO}.` };
    if (resp.status === 404) return { ok: false, reason: `Token cannot see ${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}. Check that the repository is selected under "Repository access".` };
    if (!resp.ok) return { ok: false, reason: 'GitHub returned ' + resp.status + '.' };
    // A non-JSON 2xx (proxy interstitial, outage page) used to reject here and
    // strand the modal on "Verifying…" with the unverified token still saved.
    try {
      const data = await resp.json();
      return {
        ok: true,
        workflows: (data.workflows || []).map(w => w.name),
        expiry: this.getExpiry(),
      };
    } catch (e) {
      return { ok: false, reason: 'GitHub returned an unreadable response — try again.' };
    }
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
