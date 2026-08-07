/* =========================================================================
   ArtemisHera — app shell: router, home, setup flows, projects
   ========================================================================= */

const App = {

  /* ── Router ─────────────────────────────────────────────────────────── */
  route() {
    const hash = location.hash || '#/';
    const [path, query] = hash.slice(2).split('?');
    const params = new URLSearchParams(query || '');
    const seg = path.split('/').filter(Boolean);

    $$('.nav a').forEach(a => a.classList.remove('active'));
    const navKey = (seg[0] === 'report' || seg[0] === 'news') ? 'projects'
      : (!seg.length || seg[0] === 'setup') ? 'home'
      : seg[0];
    $(`.nav a[data-nav="${navKey}"]`)?.classList.add('active');

    if (!seg.length) return this.home();
    if (seg[0] === 'setup') return this.setup(seg[1]);
    if (seg[0] === 'report') return this.openReport(seg[1]);
    if (seg[0] === 'news') return this.openNews(seg[1]);
    if (seg[0] === 'projects') return this.projects();
    if (seg[0] === 'hera') return Hera.renderPicker(params.get('project') || '');
    if (seg[0] === 'settings') return this.settings();
    this.home();
  },

  /* ── Home: choose what to do ────────────────────────────────────────── */
  home() {
    const g = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="#CEC0AB" stroke-width="1.7" stroke-linecap="square">${paths}</svg>`;
    const cards = [
      { id: 'federal', title: 'Scrape Federal Votes', desc: 'Search any member of Congress (1st–current) and pull their full roll-call record from Voteview, with keyword extraction and universe matching.', icon: g('<path d="M12 3 L21 9 L3 9 Z"/><path d="M5 9 V19 M9.7 9 V19 M14.3 9 V19 M19 9 V19"/><path d="M3 19 H21"/>') },
      { id: 'state', title: 'Scrape State Votes', desc: 'Search state legislators from the pre-scraped LegiScan library and analyze their voting record against targeting universes.', icon: g('<path d="M4 20 L4 10 L12 4 L20 10 L20 20"/><path d="M9 20 V14 H15 V20"/>') },
      { id: 'oppo', title: 'Upload Oppo Book', desc: 'Feed in an opposition research book (PDF/DOCX) — or a Poseidon attacks.json — and get the full attack-extraction dashboard with severity and universe matching.', icon: g('<path d="M5 4 H17 L19 6 V20 H5 Z"/><path d="M8 9 H16 M8 12.5 H16 M8 16 H13"/>') },
      { id: 'docs', title: 'Upload Documents', desc: 'Analyze any document — mailers, transcripts, filings, reports. Extracts significant keywords and maps them to voter universes.', icon: g('<path d="M4 5 H20 V19 H4 Z"/><path d="M7 9 H17 M7 12 H17 M7 15 H12"/>') },
      { id: 'news', title: 'Begin News Scrape', desc: 'Launch the automated news pipeline against your Google Sheet site list. Runs in the cloud; results land on a live intelligence page.', icon: g('<path d="M4 4 H16 V20 H4 Z"/><path d="M16 8 H20 V20 H16"/><path d="M7 8 H13 M7 11.5 H13 M7 15 H13"/>') },
      { id: 'web', title: 'Scrape Web Pages', desc: `Manually enter up to ${CONFIG.MAX_MANUAL_URLS} specific pages or sites to scrape and analyze — one-off targets outside your standing site list.`, icon: g('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12 H20.5 M12 3.5 C15 7 15 17 12 20.5 C9 17 9 7 12 3.5"/>') },
    ];
    $('#view').innerHTML = `
      <h1 class="page-title">What do you want to work on?</h1>
      <div class="page-sub">Pick a task to start a new project. Every run is saved to your Projects library and can feed a Hera messaging campaign.</div>
      <div class="action-grid">
        ${cards.map(c => `
          <div class="action-card" onclick="location.hash='#/setup/${c.id}'">
            <div class="glyph">${c.icon}</div>
            <h3>${c.title}</h3>
            <p>${c.desc}</p>
            <span class="go">Start →</span>
          </div>`).join('')}
      </div>`;
  },

  /* ── Setup pages ────────────────────────────────────────────────────── */
  setup(kind) {
    switch (kind) {
      case 'federal': return this.setupFederal();
      case 'state': return this.setupState();
      case 'oppo': return this.setupUpload('oppo');
      case 'docs': return this.setupUpload('docs');
      case 'news': return this.setupNews();
      case 'web': return this.setupWeb();
    }
    this.home();
  },

  header(title, sub) {
    return `<div class="crumbs"><a href="#/">New Project</a><span class="sep">/</span>${esc(title)}</div>
      <h1 class="page-title">${esc(title)}</h1><div class="page-sub">${esc(sub)}</div>`;
  },

  /* Federal votes */
  async setupFederal() {
    $('#view').innerHTML = `
      ${this.header('Scrape Federal Votes', 'Search any member of Congress, choose the chambers and congresses to load, then run the scrape.')}
      <div class="card panel">
        <label class="fld">Member Search</label>
        <div class="dd-wrap">
          <input type="search" id="fv-search" placeholder="Start typing a name… (e.g. Spanberger)" autocomplete="off" disabled>
          <div class="dd-list" id="fv-dd"></div>
        </div>
        <div id="fv-member"></div>
        <div class="row" id="fv-opts" style="display:none">
          <div style="width:160px"><label class="fld">Chamber</label>
            <select id="fv-chamber"><option value="both">Both</option><option>House</option><option>Senate</option></select></div>
          <div style="width:160px"><label class="fld">From Congress</label><select id="fv-from"></select></div>
          <div style="width:160px"><label class="fld">To Congress</label><select id="fv-to"></select></div>
          <button class="btn gold" id="fv-run">Load Votes</button>
        </div>
        <div class="status" id="fv-status">Loading member directory…</div>
        <div class="progress-track hidden" id="fv-track"><div class="progress-fill" id="fv-fill"></div></div>
      </div>`;

    let selected = null;
    try {
      await Votes.loadMembers(msg => setStatus('#fv-status', msg));
      setStatus('#fv-status', `${Votes.allMembers.length.toLocaleString()} members indexed. Search above.`, 'ok');
      $('#fv-search').disabled = false;
      $('#fv-search').focus();
    } catch (e) { return setStatus('#fv-status', e.message, 'err'); }

    $('#fv-search').addEventListener('input', e => {
      const results = Votes.searchMembers(e.target.value);
      const dd = $('#fv-dd');
      dd.innerHTML = results.map((m, i) => `
        <div class="dd-item" data-i="${i}"><b>${esc(m.name)}</b>
          <div class="meta">${esc(m.party)} · ${esc(m.state)} · ${m.chambers.join('/')} · Congress ${m.minCongress}–${m.maxCongress}</div></div>`).join('');
      dd.classList.toggle('open', results.length > 0);
      $$('#fv-dd .dd-item').forEach(el => el.onclick = () => {
        selected = results[+el.dataset.i];
        dd.classList.remove('open');
        $('#fv-search').value = selected.name;
        $('#fv-member').innerHTML = `
          <div class="card member-card">
            <div class="avatar">${esc(selected.name[0])}</div>
            <div><h3>${esc(selected.name)}</h3>
            <div class="sub">${esc(selected.party)} · ${esc(selected.state)} · ${selected.chambers.join(' / ')} · Congress ${selected.minCongress}–${selected.maxCongress}</div></div>
          </div>`;
        const opts = [];
        for (let c = selected.maxCongress; c >= selected.minCongress; c--) opts.push(`<option>${c}</option>`);
        $('#fv-from').innerHTML = opts.join('');
        $('#fv-to').innerHTML = opts.join('');
        $('#fv-from').value = selected.maxCongress;
        $('#fv-to').value = selected.maxCongress;
        $('#fv-opts').style.display = 'flex';
        setStatus('#fv-status', '');
      });
    });

    $('#view').addEventListener('click', e => { if (!e.target.closest('.dd-wrap')) $('#fv-dd')?.classList.remove('open'); });

    $('#view').addEventListener('click', async e => {
      if (e.target.id !== 'fv-run' || !selected) return;
      const from = Math.min(+$('#fv-from').value, +$('#fv-to').value);
      const to = Math.max(+$('#fv-from').value, +$('#fv-to').value);
      const opts = { chamber: $('#fv-chamber').value, congressFrom: from, congressTo: to };
      e.target.disabled = true;
      $('#fv-track').classList.remove('hidden');
      try {
        const votes = await Votes.loadFederalVotes(selected, opts,
          (msg, frac) => { setStatus('#fv-status', msg); $('#fv-fill').style.width = Math.round(frac * 100) + '%'; });
        if (!votes.length) throw new Error('No votes found for that selection.');
        setStatus('#fv-status', 'Analyzing…');
        $('#fv-fill').style.width = '100%';
        const models = await loadUniverses();
        const meta = Store.saveProject({
          id: 'fed-' + uid(), name: `${selected.name} — Federal Votes`, type: 'federal-votes',
          status: 'complete', subject: selected.name,
          summary: `${votes.length} votes · Congress ${from}–${to}${votes.partial ? ' (partial)' : ''}`,
        }, {
          member: selected, votes,
          topics: Votes.matchVotesToTopics(votes, models),
          keywords: Votes.analyzeKeywords(votes, models),
        });
        location.hash = '#/report/' + meta.id;
      } catch (err) {
        e.target.disabled = false;
        if (err.code === 'PROXY_FAILED') return this.offerCloudVotes(selected, opts);
        setStatus('#fv-status', err.message, 'err');
      }
    });
  },

  // Voteview has no CORS headers; when every proxy fails, run it server-side.
  offerCloudVotes(member, opts) {
    setStatus('#fv-status', 'Voteview is not reachable directly from the browser.', 'err');
    showModal('Run this lookup in the cloud', `
      <p style="font-size:13.5px">Voteview does not send CORS headers, so the browser can only reach it through public proxies — and all of them failed just now (they rate-limit and choke on the multi-megabyte vote files).</p>
      <p style="font-size:13.5px;margin-top:10px">ArtemisHera can run the same lookup in GitHub Actions instead: it downloads the vote files server-side, does the keyword and universe analysis, and commits the report. Takes roughly 2–5 minutes for <b>${esc(member.name)}</b>, Congress ${opts.congressFrom}–${opts.congressTo}.</p>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button class="btn gold" id="cv-go">Run in the Cloud</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
      <div class="status" id="cv-status"></div>`);

    $('#cv-go').onclick = async () => {
      if (!GH.hasToken()) {
        // Chain straight into the connect prompt, then resume this run.
        return this.promptForToken(() => this.offerCloudVotes(member, opts));
      }
      setStatus('#cv-status', 'Dispatching workflow…');
      try {
        const id = await Votes.dispatchCloudVotes(member, opts);
        closeModal();
        location.hash = '#/report/' + id;
      } catch (e) {
        if (e.message === 'BAD_TOKEN') {
          GH.setToken('');
          return this.promptForToken(() => this.offerCloudVotes(member, opts));
        }
        setStatus('#cv-status', e.message, 'err');
      }
    };
  },

  /* State votes */
  async setupState() {
    $('#view').innerHTML = `
      ${this.header('Scrape State Votes', 'Pick a state, session, and legislator from the pre-scraped LegiScan library.')}
      <div class="card panel">
        <div class="row">
          <div style="width:220px"><label class="fld">State</label><select id="sv-state"><option>Loading…</option></select></div>
          <div style="width:260px"><label class="fld">Session</label><select id="sv-session"></select></div>
          <div class="grow"><label class="fld">Legislator</label><select id="sv-member"></select></div>
          <button class="btn gold" id="sv-run" disabled>Load Votes</button>
        </div>
        <div class="status" id="sv-status"></div>
      </div>`;

    let sessions;
    try {
      sessions = await Votes.loadStateSessions();
    } catch (e) { return setStatus('#sv-status', 'Could not load the state data library: ' + e.message, 'err'); }

    const states = Object.keys(sessions).sort();
    $('#sv-state').innerHTML = states.map(s => `<option value="${s}">${esc(sessions[s].state_name || s)}</option>`).join('');

    const fillSessions = () => {
      const st = $('#sv-state').value;
      $('#sv-session').innerHTML = (sessions[st].sessions || []).map(s => `<option value="${s.id}">${esc(s.name)} (${s.people_count} members)</option>`).join('');
      fillMembers();
    };
    const fillMembers = async () => {
      const st = $('#sv-state').value, se = $('#sv-session').value;
      setStatus('#sv-status', 'Loading legislators…');
      $('#sv-run').disabled = true;
      try {
        const people = await Votes.loadStateMembers(st, se);
        $('#sv-member').innerHTML = people
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p, i) => `<option value="${i}">${esc(p.name)} (${esc(p.party || '?')}) — ${esc(p.role || '')} ${esc(p.district || '')}</option>`).join('');
        setStatus('#sv-status', `${people.length} legislators loaded.`, 'ok');
        $('#sv-run').disabled = false;
      } catch (e) { setStatus('#sv-status', 'Could not load legislators: ' + e.message, 'err'); }
    };
    $('#sv-state').onchange = fillSessions;
    $('#sv-session').onchange = fillMembers;
    fillSessions();

    $('#sv-run').onclick = async () => {
      const st = $('#sv-state').value, se = $('#sv-session').value;
      const person = Votes.stateMembers.sort((a, b) => a.name.localeCompare(b.name))[+$('#sv-member').value];
      $('#sv-run').disabled = true;
      setStatus('#sv-status', 'Loading vote record…');
      try {
        const votes = await Votes.loadStateVotes(st, se, person);
        if (!votes.length) throw new Error('No votes found for this legislator.');
        const models = await loadUniverses();
        const topics = Votes.matchVotesToTopics(votes, models);
        const keywords = Votes.analyzeKeywords(votes, models);
        const meta = Store.saveProject({
          id: 'st-' + uid(), name: `${person.name} — ${st} Votes`, type: 'state-votes',
          status: 'complete', subject: person.name,
          summary: `${votes.length} votes · ${sessions[st].state_name} ${se}`,
        }, { member: { name: person.name, party: person.party, state: st, district: person.district }, votes, topics, keywords });
        location.hash = '#/report/' + meta.id;
      } catch (e) {
        setStatus('#sv-status', e.message, 'err');
        $('#sv-run').disabled = false;
      }
    };
  },

  /* Oppo book / general documents upload */
  setupUpload(mode) {
    const isOppo = mode === 'oppo';
    $('#view').innerHTML = `
      ${this.header(isOppo ? 'Upload Oppo Book' : 'Upload Documents',
        isOppo ? 'PDF or DOCX oppo research book — or import a Poseidon attacks.json for full-fidelity results.'
               : 'Any PDF, DOCX or TXT — extracts significant keywords and maps them to voter universes.')}
      <div class="card panel">
        ${isOppo ? `<label class="fld">Subject Name</label>
        <input type="text" id="up-subject" placeholder="e.g. Jane Smith" style="max-width:380px">` : ''}
        <label class="fld">Document</label>
        <div class="dropzone" id="up-zone">
          <div class="big">Drop your file here or click to browse</div>
          <div class="small">${isOppo ? 'PDF · DOCX · TXT · Poseidon attacks.json' : 'PDF · DOCX · TXT'}</div>
          <input type="file" id="up-file" class="hidden" accept="${isOppo ? '.pdf,.docx,.txt,.md,.json' : '.pdf,.docx,.txt,.md'}">
        </div>
        <div id="up-chip"></div>
        <div style="margin-top:18px"><button class="btn gold" id="up-run" disabled>${isOppo ? 'Extract Attacks' : 'Analyze Document'}</button></div>
        <div class="status" id="up-status"></div>
        <div class="progress-track hidden" id="up-track"><div class="progress-fill" id="up-fill"></div></div>
        ${isOppo ? `<div class="notice"><b>Note:</b> in-browser extraction is signal-based and finds candidate hits fast. For the deepest read of a full oppo book, run the Poseidon skill and import its <b>attacks.json</b> here — the dashboard is identical.</div>` : ''}
      </div>`;

    let file = null;
    const zone = $('#up-zone'), input = $('#up-file');
    zone.onclick = () => input.click();
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
    zone.ondragleave = () => zone.classList.remove('drag');
    zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
    input.onchange = () => { if (input.files[0]) pick(input.files[0]); };
    const pick = f => {
      file = f;
      $('#up-chip').innerHTML = `<span class="filechip">📄 ${esc(f.name)} <span style="color:var(--tan)">(${(f.size / 1048576).toFixed(1)} MB)</span> <span class="x" onclick="this.parentElement.remove()">×</span></span>`;
      $('#up-run').disabled = false;
    };

    $('#up-run').onclick = async () => {
      if (!file) return;
      $('#up-run').disabled = true;
      $('#up-track').classList.remove('hidden');
      const onStatus = (msg, frac) => { setStatus('#up-status', msg); if (frac != null) $('#up-fill').style.width = Math.round(frac * 100) + '%'; };
      try {
        const text = await Docs.extractText(file, onStatus);
        const universes = await loadUniverses();
        if (isOppo) {
          const subject = $('#up-subject').value.trim() || file.name.replace(/\.[^.]+$/, '');
          let attacks;
          if (file.name.toLowerCase().endsWith('.json')) {
            attacks = Docs.parseAttacksJSON(text);
            onStatus('Imported ' + attacks.length + ' attacks from Poseidon file.');
          } else {
            attacks = Docs.extractAttacks(text, subject, onStatus, universes);
            if (!attacks.length) throw new Error('No attack-signal sentences found — is this an oppo research document?');
          }
          const meta = Store.saveProject({
            id: 'op-' + uid(), name: `${subject} — Oppo Extraction`, type: 'oppo-book',
            status: 'complete', subject,
            summary: `${attacks.length} attacks · ${file.name}`,
          }, { attacks, source: file.name });
          location.hash = '#/report/' + meta.id;
        } else {
          onStatus('Analyzing keywords…', 0.9);
          const keywords = Docs.analyzeDocument(text, universes);
          const meta = Store.saveProject({
            id: 'doc-' + uid(), name: file.name.replace(/\.[^.]+$/, ''), type: 'documents',
            status: 'complete', subject: file.name,
            summary: `${keywords.length} keywords · ${file.name}`,
          }, { keywords, wordCount: text.split(/\s+/).length, source: file.name });
          location.hash = '#/report/' + meta.id;
        }
      } catch (e) {
        setStatus('#up-status', e.message, 'err');
        $('#up-run').disabled = false;
      }
    };
  },

  /* News scrape (site list from Google Sheet) */
  setupNews() {
    $('#view').innerHTML = `
      ${this.header('Begin News Scrape', 'Launches the cloud scraper (GitHub Actions) against your Google Sheet site list. Results appear on a live landing page when the run finishes (~15–25 min for a full list).')}
      <div class="card panel">
        <label class="fld">Project Name</label>
        <input type="text" id="ns-name" placeholder="e.g. Virginia News — August" style="max-width:420px">
        <label class="fld">Google Sheet URL (site list — column A = URLs)</label>
        <input type="text" id="ns-sheet" placeholder="https://docs.google.com/spreadsheets/d/…  (shared: Anyone with the link)">
        <div class="row" style="margin-top:4px">
          <div style="width:170px"><label class="fld">Look-back Days</label>
            <select id="ns-days"><option>1</option><option selected>2</option><option>7</option><option>14</option><option value="0">All (bulk)</option></select></div>
          <div style="width:190px"><label class="fld">Max Articles / Site</label>
            <select id="ns-max"><option>25</option><option selected>50</option><option>100</option></select></div>
          <button class="btn gold" id="ns-run">Launch Scrape</button>
        </div>
        <div class="status" id="ns-status"></div>
        ${this.tokenNotice()}
      </div>`;
    $('#ns-run').onclick = () => this.launchScrapeFlow({
      projectName: $('#ns-name').value.trim() || 'News Scrape ' + new Date().toLocaleDateString(),
      sheetUrl: $('#ns-sheet').value.trim(),
      urls: [],
      days: +$('#ns-days').value,
      maxArticles: +$('#ns-max').value,
      statusEl: '#ns-status',
    });
  },

  /* Manual web-page scrape (max 5 URLs) */
  setupWeb() {
    const N = CONFIG.MAX_MANUAL_URLS;
    $('#view').innerHTML = `
      ${this.header('Scrape Web Pages', `Enter up to ${N} specific sites or pages. The cloud scraper pulls their articles/content and builds an intelligence page.`)}
      <div class="card panel">
        <label class="fld">Project Name</label>
        <input type="text" id="ws-name" placeholder="e.g. Opponent Site Watch" style="max-width:420px">
        <label class="fld">Page URLs (one per line, max ${N})</label>
        <textarea id="ws-urls" rows="6" placeholder="https://example.com/news&#10;https://another-site.org"></textarea>
        <div class="row" style="margin-top:14px">
          <div style="width:190px"><label class="fld">Max Articles / Site</label>
            <select id="ws-max"><option>10</option><option selected>25</option><option>50</option></select></div>
          <button class="btn gold" id="ws-run">Launch Scrape</button>
        </div>
        <div class="status" id="ws-status"></div>
        ${this.tokenNotice()}
      </div>`;
    $('#ws-run').onclick = () => {
      const urls = $('#ws-urls').value.split(/\n+/).map(u => u.trim()).filter(Boolean);
      if (!urls.length) return setStatus('#ws-status', 'Enter at least one URL.', 'err');
      if (urls.length > N) return setStatus('#ws-status', `Limit is ${N} pages — you entered ${urls.length}.`, 'err');
      const bad = urls.find(u => !/^https?:\/\/.+\..+/.test(u));
      if (bad) return setStatus('#ws-status', 'Not a valid URL: ' + bad, 'err');
      this.launchScrapeFlow({
        projectName: $('#ws-name').value.trim() || 'Web Scrape ' + new Date().toLocaleDateString(),
        urls, sheetUrl: '', days: 0, maxArticles: +$('#ws-max').value,
        statusEl: '#ws-status',
      });
    };
  },

  tokenNotice() {
    return GH.hasToken()
      ? `<div class="notice">GitHub connected ✓ — scrapes launch directly. <a href="#/settings">Manage connection</a></div>`
      : `<div class="notice"><b>One-time setup:</b> launching cloud scrapes needs a GitHub token so this page can trigger the workflow. You'll be prompted on your first launch and it's remembered in this browser from then on — you do <b>not</b> need a new one per scrape. <a href="#/settings">Set it up now</a></div>`;
  },

  // Single place that asks for a token. `onSaved` runs after a successful save
  // so the action the user was already trying to take just continues.
  promptForToken(onSaved) {
    showModal('Connect GitHub — one time', `
      <p style="font-size:13.5px;margin-bottom:10px">Cloud scrapes run in GitHub Actions, so this page needs a token to start them. You only do this <b>once per browser</b> — it's saved locally and reused for every future scrape.</p>
      <p style="font-size:13.5px;margin-bottom:6px">Create one at
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> with:</p>
      <ul style="font-size:13px;margin:0 0 12px 20px">
        <li>Repository access: <b>Only select repositories</b> → <b>${esc(CONFIG.GH_REPO)}</b></li>
        <li>Permissions: <b>Actions → Read and write</b></li>
        <li>Expiration: pick a long one (or <b>No expiration</b>) so you're not redoing this</li>
      </ul>
      <p style="font-size:12.5px;color:var(--bark);margin-bottom:12px">Avoid a classic <code>repo</code>-scope token — it would grant access to every repository you own. Stored only in this browser and sent only to api.github.com.</p>
      <input type="password" id="pat-input" placeholder="github_pat_…" autocomplete="off">
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
        <button class="btn gold" id="pat-save">Save &amp; Verify</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
      <div class="status" id="pat-status"></div>`);

    $('#pat-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pat-save').click(); });
    $('#pat-save').onclick = async () => {
      const field = $('#pat-input');
      const value = field.value.trim();
      if (!value) return setStatus('#pat-status', 'Paste a token first.', 'err');
      GH.setToken(value);
      field.value = '';                       // don't leave the secret in the DOM
      setStatus('#pat-status', 'Verifying with GitHub…');
      const res = await GH.verify();
      if (!res.ok) {
        GH.setToken('');
        return setStatus('#pat-status', res.reason, 'err');
      }
      setStatus('#pat-status', 'Connected ✓', 'ok');
      setTimeout(() => { closeModal(); onSaved && onSaved(); }, 500);
    };
  },

  async launchScrapeFlow(opts) {
    const el = opts.statusEl;
    if (!GH.hasToken()) return this.promptForToken(() => this.launchScrapeFlow(opts));
    setStatus(el, 'Dispatching workflow…');
    try {
      const id = await News.launchScrape(opts);
      setStatus(el, 'Scrape launched ✓ — tracking as a running project.', 'ok');
      setTimeout(() => location.hash = '#/news/' + id, 900);
    } catch (e) {
      if (e.message === 'BAD_TOKEN') {
        GH.setToken('');
        setStatus(el, 'GitHub rejected the saved token — it was revoked or expired. Re-connecting…', 'err');
        this.promptForToken(() => this.launchScrapeFlow(opts));
      } else {
        // Any other failure (permissions, network, GitHub outage) keeps the
        // token — discarding it here is what made this feel per-scrape.
        setStatus(el, e.message, 'err');
      }
    }
  },

  /* ── Settings: GitHub connection ────────────────────────────────────── */
  async settings() {
    const connected = GH.hasToken();
    $('#view').innerHTML = `
      <h1 class="page-title">Settings</h1>
      <div class="page-sub">Connection and configuration for this browser.</div>

      <div class="card panel">
        <div class="section-h" style="margin-top:0"><h2 style="font-size:17px">GitHub Connection</h2>
          <span class="hint">needed only for cloud scrapes and cloud vote lookups</span></div>
        <p style="font-size:13.5px;color:var(--bark);max-width:760px">
          Reports you generate in the browser (uploads, state votes) need nothing here. A token is only required to
          <b>start</b> a GitHub Actions run. It is saved in this browser and reused indefinitely — one setup, not one per scrape.
        </p>
        <div id="set-state" style="margin-top:16px"></div>
      </div>

      <div class="card panel" style="margin-top:18px">
        <div class="section-h" style="margin-top:0"><h2 style="font-size:17px">Universe Source</h2>
          <span class="hint">one list drives everything — votes, oppo books, documents, news</span></div>
        <p style="font-size:13.5px;color:var(--bark);max-width:760px">
          Paste a Google Sheet link to load the universe list live — <b>column A</b> is read as the universe names.
          The sheet must be shared <b>"Anyone with the link can view"</b>, or the unauthenticated CSV export is refused.
          Leave it blank to use the bundled ${POSEIDON_UNIVERSES.length}-universe list.
          ${Object.keys(UNIVERSE_KEYWORDS).length} universes carry curated keyword patterns for vote matching;
          the rest match documents and news by name and match votes only when their full name appears in bill text.
        </p>
        <div class="row">
          <div class="grow"><label class="fld">Google Sheet URL or ID</label>
            <input type="text" id="uni-sheet" placeholder="https://docs.google.com/spreadsheets/d/…"
              value="${esc(getUniverseSheet())}"></div>
          <div style="width:150px"><label class="fld">Header Rows</label>
            <input type="number" id="uni-skip" min="0" max="20" value="${getUniverseSkip()}"></div>
          <button class="btn" id="uni-test">Test &amp; Save</button>
          <button class="btn ghost" id="uni-clear">Use Bundled List</button>
        </div>
        <p style="font-size:12.5px;color:var(--bark);margin-top:8px">
          <b>Header Rows</b> is how many rows to skip before the data starts — the old Poseidon inventory sheet used
          <b>2</b> (a title row and a column-header row). Check the preview below after testing: if the first chip is a
          title rather than a real universe, raise this by one.
        </p>
        <div class="status" id="uni-status"></div>
        <div id="uni-preview"></div>
      </div>

      <div class="card panel" style="margin-top:18px">
        <div class="section-h" style="margin-top:0"><h2 style="font-size:17px">Matching Rules</h2>
          <span class="hint">your corrections — they persist and apply to every future run</span></div>
        <p style="font-size:13.5px;color:var(--bark);max-width:760px">
          <b>Pin</b> a keyword to make it strong evidence for a universe. <b>Ban</b> a keyword→universe pairing to kill a
          bad match (the × on matched keywords in vote reports does this too). To make cloud vote runs use the same
          rules, export this file and commit it to the repo as <code>data/match_rules.json</code>.
        </p>
        <div class="row" style="margin-top:6px">
          <div style="width:130px"><label class="fld">Rule</label>
            <select id="mr-type"><option value="pin">Pin</option><option value="ban">Ban</option></select></div>
          <div class="grow"><label class="fld">Keyword or Phrase</label>
            <input type="text" id="mr-kw" placeholder="e.g. school choice"></div>
          <div class="grow"><label class="fld">Universe</label>
            <select id="mr-uni"><option>Loading…</option></select></div>
          <button class="btn" id="mr-add">Add Rule</button>
        </div>
        <div class="status" id="mr-status"></div>
        <div id="mr-list" style="margin-top:10px"></div>
        <div class="row" style="margin-top:14px">
          <button class="btn ghost sm" onclick="MatchRules.export()">Export match_rules.json</button>
          <button class="btn ghost sm" id="mr-import">Import Rules</button>
        </div>
      </div>`;

    // ── Matching rules controls ──
    const renderRules = () => {
      const rules = MatchRules.load();
      const rows = [
        ...rules.pins.map(r => ({ ...r, type: 'pin' })),
        ...rules.bans.map(r => ({ ...r, type: 'ban' })),
      ];
      $('#mr-list').innerHTML = rows.length
        ? rows.map(r => `<div class="rule-row">
            <span class="type ${r.type}">${r.type.toUpperCase()}</span>
            <b>${esc(r.kw)}</b> <span style="color:var(--tan)">${r.type === 'pin' ? '→' : '↛'}</span> ${esc(r.universe)}
            <span class="del" data-t="${r.type}s" data-k="${esc(r.kw)}" data-u="${esc(r.universe)}" title="Delete rule">✕</span>
          </div>`).join('')
        : '<p style="font-size:13px;color:var(--tan)">No rules yet. Ban bad matches from any vote report, or add rules here.</p>';
      $$('#mr-list .del').forEach(el => el.onclick = () => {
        MatchRules.remove(el.dataset.t, el.dataset.k, el.dataset.u);
        renderRules();
      });
    };
    renderRules();
    loadUniverses().then(list => {
      $('#mr-uni').innerHTML = list.map(u => `<option>${esc(u)}</option>`).join('');
    });
    $('#mr-add').onclick = () => {
      const kw = $('#mr-kw').value.trim().toLowerCase();
      const uni = $('#mr-uni').value;
      if (!kw || kw.length < 3) return setStatus('#mr-status', 'Keyword must be at least 3 characters.', 'err');
      if (!uni || uni === 'Loading…') return setStatus('#mr-status', 'Pick a universe.', 'err');
      MatchRules[$('#mr-type').value](kw, uni);
      $('#mr-kw').value = '';
      setStatus('#mr-status', 'Rule saved ✓ — applies to every future analysis. Use ⟳ Re-match (oppo) or re-run a scrape to update an existing report.', 'ok');
      renderRules();
    };
    $('#mr-import').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.onchange = async () => {
        try { MatchRules.import(JSON.parse(await input.files[0].text())); renderRules(); setStatus('#mr-status', 'Rules imported ✓', 'ok'); }
        catch (e) { setStatus('#mr-status', e.message, 'err'); }
      };
      input.click();
    };

    const render = (msg, cls) => {
      $('#set-state').innerHTML = connected ? `
        <div class="notice" style="margin-top:0"><b>Token saved in this browser.</b> ${msg || ''}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="set-test">Test Connection</button>
          <button class="btn ghost" id="set-replace">Replace Token</button>
          <button class="btn ghost" id="set-clear" style="color:var(--sev-major);border-color:var(--sev-major)">Remove Token</button>
        </div>
        <div class="status ${cls || ''}" id="set-status"></div>`
        : `<div class="notice" style="margin-top:0">Not connected. Cloud scrapes will prompt you once, then remember it.</div>
           <div style="margin-top:12px"><button class="btn gold" id="set-connect">Connect GitHub</button></div>`;
      wire();
    };

    const wire = () => {
      const test = $('#set-test');
      if (test) test.onclick = async () => {
        setStatus('#set-status', 'Checking…');
        const res = await GH.verify();
        if (res.ok) {
          const exp = res.expiry ? ` Token expires ${fmtDate(res.expiry)}.` : ' This token has no expiration date.';
          setStatus('#set-status', `Connected ✓ — can trigger ${res.workflows.length} workflow${res.workflows.length === 1 ? '' : 's'}.${exp}`, 'ok');
        } else {
          setStatus('#set-status', res.reason, 'err');
        }
      };
      const rep = $('#set-replace');
      if (rep) rep.onclick = () => this.promptForToken(() => this.settings());
      const clr = $('#set-clear');
      if (clr) clr.onclick = () => {
        showModal('Remove Token', `
          <p>Remove the saved GitHub token from this browser? Cloud scrapes will prompt for one again. This does not revoke the token on GitHub — do that at
            <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">your token settings</a>.</p>
          <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn danger" onclick="GH.setToken('');closeModal();App.settings()">Remove</button>
            <button class="btn ghost" onclick="closeModal()">Cancel</button>
          </div>`);
      };
      const con = $('#set-connect');
      if (con) con.onclick = () => this.promptForToken(() => this.settings());
    };

    // ── Universe sheet controls ──
    $('#uni-test').onclick = async () => {
      const val = $('#uni-sheet').value.trim();
      const skip = Math.max(0, parseInt($('#uni-skip').value, 10) || 0);
      if (!val) return setStatus('#uni-status', 'Paste a sheet link first, or use the bundled list.', 'err');
      setStatus('#uni-status', 'Fetching sheet…');
      $('#uni-preview').innerHTML = '';
      try {
        const names = await fetchSheetNames(val, CONFIG.UNIVERSE_SHEET_GID, skip);
        setUniverseSheet(val, skip);
        setStatus('#uni-status', `Loaded ${names.length} universes ✓ — saved and now in use for oppo, document and news matching.`, 'ok');
        $('#uni-preview').innerHTML = `
          <p style="font-size:12.5px;color:var(--bark);margin-top:10px">First entries — confirm these are real universes, not header text:</p>
          <div class="chipgrid">${names.slice(0, 30).map(n => `<span class="chip">${esc(n)}</span>`).join('')}
          ${names.length > 30 ? `<span class="chip" style="border-style:dashed">+${names.length - 30} more</span>` : ''}</div>`;
      } catch (e) {
        setStatus('#uni-status', `Not saved — ${e.message} The bundled ${POSEIDON_UNIVERSES.length}-universe list stays in use.`, 'err');
      }
    };
    $('#uni-clear').onclick = () => {
      setUniverseSheet('');
      $('#uni-sheet').value = '';
      $('#uni-skip').value = '0';
      $('#uni-preview').innerHTML = '';
      setStatus('#uni-status', `Using the bundled ${POSEIDON_UNIVERSES.length}-universe list.`, 'ok');
    };

    render();
    // Auto-verify a stored token so the page reflects reality without a click
    if (connected) {
      const res = await GH.verify();
      if (res.ok) {
        const exp = res.expiry ? `Expires ${fmtDate(res.expiry)}.` : 'No expiration set.';
        setStatus('#set-status', `Verified ✓ — ${exp}`, 'ok');
      } else {
        setStatus('#set-status', res.reason, 'err');
      }
    }
  },

  async rerunScrape(projectId) {
    const meta = Store.getMeta(projectId) || (await Store.repoProjects()).find(p => p.id === projectId);
    if (!meta) return;
    // Relaunch with same params if we stored them; otherwise send user to setup
    location.hash = meta.type === 'web-scrape' ? '#/setup/web' : '#/setup/news';
  },

  /* ── Open reports (route by project type) ───────────────────────────── */
  async openReport(id) {
    const meta = Store.getMeta(id) || (await Store.repoProjects()).find(p => p.id === id);
    if (!meta) return this.notFound();
    if (meta.type === 'news-scrape' || meta.type === 'web-scrape') return this.openNews(id);

    let payload = Store.getPayload(id);
    // Cloud federal-vote runs land in data/federal/{id}.json
    if (!payload && meta.type === 'federal-votes') {
      const cloud = await Votes.fetchCloudVotes(id);
      if (cloud) {
        meta.status = 'complete';
        meta.summary = `${cloud.votes.length} votes · cloud run`;
        Store.saveProject(meta, cloud);
        payload = cloud;
      } else if (meta.status === 'running') return this.pendingCloudVotes(meta);
    }
    if (!payload) return this.notFound('This project\'s data is not in this browser. Import its .artemishera.json export from the Projects page.');
    if (meta.type === 'oppo-book') return Report.renderOppo(meta, payload);
    if (meta.type === 'federal-votes' || meta.type === 'state-votes') return Report.renderVotes(meta, payload);
    if (meta.type === 'documents') return Report.renderDoc(meta, payload);
    this.notFound();
  },

  pendingCloudVotes(meta) {
    $('#view').innerHTML = `
      ${Report.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.name)}</h1>
      <div class="page-sub"><span class="status-dot running"></span>&nbsp; Cloud vote lookup in progress — GitHub Actions is downloading and analyzing the roll-call files.</div>
      <div class="empty card"><div class="glyph">⟳</div>
        <p>This page refreshes automatically. Typical run: 2–5 minutes.</p>
        <p style="margin-top:12px"><a href="https://github.com/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions" target="_blank" rel="noopener" class="btn ghost sm">View run status on GitHub</a></p>
      </div>`;
    clearTimeout(this._votePoll);
    this._votePoll = setTimeout(() => { if (location.hash === '#/report/' + meta.id) this.openReport(meta.id); }, 25000);
  },

  async openNews(id) {
    let meta = Store.getMeta(id) || (await Store.repoProjects()).find(p => p.id === id);
    if (!meta) meta = { id, name: 'News Scrape', type: 'news-scrape', status: 'running' };
    const data = await News.fetchResults(id);
    if (data) {
      if (meta.status !== 'complete' && meta.origin === 'local') { meta.status = 'complete'; Store.saveProject(meta); }
      // cache keywords locally so Hera can use them
      if (meta.origin !== 'repo') Store.saveProject(meta, { keywords: data.keywords || [], articleCount: (data.articles || []).length });
      return Report.renderNews(meta, data);
    }
    // still running
    await News.refreshRunStatus();
    const fresh = Store.getMeta(id) || meta;
    $('#view').innerHTML = `
      ${Report.crumbs(fresh.name)}
      <h1 class="page-title">${esc(fresh.name)}</h1>
      <div class="page-sub"><span class="status-dot ${fresh.status}"></span>&nbsp; ${fresh.status === 'failed' ? 'The scrape run failed — check the Actions log on GitHub.' : 'Scrape in progress — the cloud workflow is running. This page refreshes automatically.'}</div>
      <div class="empty card">
        <div class="glyph">⟳</div>
        <p>${fresh.status === 'failed'
          ? `Run failed. <a href="https://github.com/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions" target="_blank" rel="noopener">Open the Actions log</a> to see why, then relaunch.`
          : 'Results will appear here as soon as the workflow commits them (typically 3–25 minutes depending on the site list).'}</p>
        <p style="margin-top:12px"><a href="https://github.com/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions" target="_blank" rel="noopener" class="btn ghost sm">View run status on GitHub</a></p>
      </div>`;
    if (fresh.status !== 'failed') {
      clearTimeout(this._newsPoll);
      this._newsPoll = setTimeout(() => { if (location.hash === '#/news/' + id) this.openNews(id); }, 30000);
    }
  },

  /* ── Projects library ───────────────────────────────────────────────── */
  async projects() {
    $('#view').innerHTML = `
      <h1 class="page-title">Projects</h1>
      <div class="page-sub">Every scrape, upload and analysis — ongoing and past. Click a project to open its report.
        &nbsp;<button class="btn ghost sm" onclick="App.importFlow()">Import Project File</button></div>
      <div id="pr-list"><div class="empty"><div class="glyph">◌</div>Loading…</div></div>`;
    await News.refreshRunStatus();
    const projects = await Store.allProjects();
    const typeCls = { 'federal-votes': 'votes', 'state-votes': 'votes', 'oppo-book': 'oppo', 'documents': 'docs', 'news-scrape': 'news', 'web-scrape': 'web' };
    const typeName = { 'federal-votes': 'Federal Votes', 'state-votes': 'State Votes', 'oppo-book': 'Oppo Book', 'documents': 'Documents', 'news-scrape': 'News Scrape', 'web-scrape': 'Web Scrape' };
    $('#pr-list').innerHTML = projects.length ? `<div class="proj-grid">${projects.map(p => `
      <div class="card proj-card" onclick="location.hash='#/report/${p.id}'">
        <div class="top">
          <span class="type-tag ${typeCls[p.type] || 'docs'}">${typeName[p.type] || p.type}</span>
          <span class="status-dot ${p.status || 'complete'}" title="${p.status}"></span>
          <span style="flex:1"></span>
          <span style="font-size:11px;color:var(--tan)">${p.origin === 'repo' ? 'cloud' : 'local'}</span>
        </div>
        <h3>${esc(p.name)}</h3>
        <div class="desc">${esc(p.summary || p.subject || '')}</div>
        <div class="foot">
          <span>${fmtDate(p.updated)}</span><span style="flex:1"></span>
          ${p.origin !== 'repo' ? `<a href="javascript:void(0)" onclick="event.stopPropagation();Store.exportProject('${p.id}')" title="Export">⬇</a>
          <a href="javascript:void(0)" onclick="event.stopPropagation();App.deleteFlow('${p.id}')" title="Delete" style="color:var(--sev-major)">✕</a>` : ''}
        </div>
      </div>`).join('')}</div>`
      : `<div class="empty card"><div class="glyph">◌</div><p>No projects yet.</p><p style="margin-top:14px"><a class="btn" href="#/">Start your first project</a></p></div>`;
  },

  deleteFlow(id) {
    const meta = Store.getMeta(id);
    showModal('Delete Project', `
      <p>Delete “<b>${esc(meta?.name || id)}</b>” from this browser? Its report data will be removed (export it first if you want to keep it).</p>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button class="btn danger" onclick="Store.deleteProject('${id}');closeModal();App.projects()">Delete</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>`);
  },

  importFlow() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      try {
        const meta = Store.importProject(JSON.parse(await input.files[0].text()));
        location.hash = '#/report/' + meta.id;
      } catch (e) { showModal('Import Failed', `<p>${esc(e.message)}</p>`); }
    };
    input.click();
  },

  notFound(msg) {
    $('#view').innerHTML = `<div class="empty card"><div class="glyph">◌</div>
      <p>${esc(msg || 'Project not found.')}</p>
      <p style="margin-top:14px"><a class="btn ghost" href="#/projects">Back to Projects</a></p></div>`;
  },
};

window.addEventListener('hashchange', () => App.route());
window.addEventListener('DOMContentLoaded', () => App.route());
