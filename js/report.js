/* =========================================================================
   ArtemisHera — report renderers
   Oppo/document reports follow the Poseidon dashboard structure (stats bar,
   filters, sortable expandable table, universe sidebar) restyled to the
   Pantheon Insight brand. Vote reports follow the congress-votes structure.
   News projects get a landing page like the news-dashboard.
   ========================================================================= */

const Report = {
  state: {},

  crumbs(name) {
    return `<div class="crumbs"><a href="#/">New Project</a><span class="sep">/</span><a href="#/projects">Projects</a><span class="sep">/</span>${esc(name)}</div>`;
  },

  /* ══════════════════ OPPO / ATTACK REPORT ══════════════════ */
  renderOppo(meta, payload) {
    const attacks = payload.attacks || [];
    this.state = { attacks, filtered: [...attacks], sortCol: 'number', sortAsc: true, page: 1, activeUniverse: '', meta };

    const total = attacks.length;
    const sev = s => attacks.filter(a => a.severity === s).length;
    const categories = [...new Set(attacks.map(a => a.category))].sort();
    const universes = [...new Set(attacks.flatMap(a => [a.best_universe, a.secondary_universe, a.tertiary_universe]).filter(Boolean))].sort();
    this.state.universes = universes;

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.subject || meta.name)} — Attack Extraction</h1>
      <div class="page-sub">${esc(meta.summary || '')} · Generated ${fmtDate(meta.updated)}</div>

      <div class="stats">
        <div class="stat"><div class="lbl">Total Attacks</div><div class="val gold">${total}</div></div>
        <div class="stat"><div class="lbl">Major</div><div class="val major">${sev('Major')}</div></div>
        <div class="stat"><div class="lbl">Moderate</div><div class="val moderate">${sev('Moderate')}</div></div>
        <div class="stat"><div class="lbl">Minor</div><div class="val minor">${sev('Minor')}</div></div>
        <div class="stat"><div class="lbl">Niche</div><div class="val niche">${sev('Niche')}</div></div>
      </div>

      <div class="filterbar">
        <input type="search" id="rp-search" placeholder="Search attacks…">
        <select id="rp-cat"><option value="">All Categories</option>${categories.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <select id="rp-sev"><option value="">All Severities</option>${SEVERITY_ORDER.map(s => `<option>${s}</option>`).join('')}</select>
        <select id="rp-uni"><option value="">All Universes</option>${universes.map(u => `<option>${esc(u)}</option>`).join('')}</select>
        <span class="count" id="rp-count"></span>
        <button class="btn ghost sm" onclick="Report.exportOppoCSV()">Export CSV</button>
        <button class="btn ghost sm" onclick="Store.exportProject('${meta.id}')">Export Project</button>
        <button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button>
      </div>

      <div class="tablewrap">
        <table>
          <thead><tr>
            <th style="width:30px"></th>
            <th data-sort="number" style="width:44px">#</th>
            <th data-sort="category">Category</th>
            <th data-sort="attack">Attack</th>
            <th data-sort="severity" style="width:110px">Severity</th>
            <th>Universes</th>
          </tr></thead>
          <tbody id="rp-body"></tbody>
        </table>
      </div>
      <div class="filterbar" id="rp-pager"></div>

      <div class="section-h"><h2>Universe Coverage</h2><span class="hint">${universes.length} universes matched — click to filter</span></div>
      <div class="chipgrid" id="rp-unigrid"></div>`;

    // wire controls
    ['rp-search', 'rp-cat', 'rp-sev', 'rp-uni'].forEach(id => {
      $('#' + id).addEventListener(id === 'rp-search' ? 'input' : 'change', () => {
        if (id === 'rp-uni') this.state.activeUniverse = $('#rp-uni').value;
        this.applyOppoFilters();
      });
    });
    $$('#view th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (this.state.sortCol === col) this.state.sortAsc = !this.state.sortAsc;
        else { this.state.sortCol = col; this.state.sortAsc = true; }
        $$('#view th').forEach(t => t.classList.remove('sorted'));
        th.classList.add('sorted');
        this.applyOppoFilters();
      };
    });
    this.renderUniverseGrid();
    this.applyOppoFilters();
  },

  applyOppoFilters() {
    const st = this.state;
    const q = ($('#rp-search')?.value || '').toLowerCase();
    const cat = $('#rp-cat')?.value || '';
    const sevF = $('#rp-sev')?.value || '';
    const uni = st.activeUniverse;
    st.filtered = st.attacks.filter(a => {
      if (cat && a.category !== cat) return false;
      if (sevF && a.severity !== sevF) return false;
      if (uni && a.best_universe !== uni && a.secondary_universe !== uni && a.tertiary_universe !== uni) return false;
      if (q) {
        const hay = (a.attack + ' ' + a.key_detail + ' ' + a.category + ' ' + (a.notes || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const { sortCol, sortAsc } = st;
    const sevRank = { Major: 0, Moderate: 1, Minor: 2, Niche: 3 };
    st.filtered.sort((a, b) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
      if (sortCol === 'severity') { va = sevRank[va] ?? 9; vb = sevRank[vb] ?? 9; }
      if (typeof va === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    st.page = 1;
    this.renderOppoTable();
  },

  renderOppoTable() {
    const st = this.state, PER = 25;
    const start = (st.page - 1) * PER;
    const rows = st.filtered.slice(start, start + PER);
    $('#rp-body').innerHTML = rows.map((a, i) => `
      <tr class="${i % 2 ? 'alt' : ''}">
        <td class="expand-btn" onclick="document.getElementById('det-${a.number}').classList.toggle('open')">▸</td>
        <td>${a.number}</td>
        <td>${esc(a.category)}</td>
        <td>${esc(a.attack)}</td>
        <td><span class="badge ${a.severity.toLowerCase()}">${a.severity}</span></td>
        <td>${this.pills(a)}</td>
      </tr>
      <tr class="detail-row" id="det-${a.number}"><td colspan="6" class="detail-cell">
        <h4>Key Detail</h4><p>${esc(a.key_detail || 'No additional detail.')}</p>
        ${a.notes ? `<h4>Notes</h4><p>${esc(a.notes)}</p>` : ''}
      </td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--bark)">No attacks match the current filters.</td></tr>';

    $('#rp-count').textContent = `${st.filtered.length} of ${st.attacks.length} attacks`;
    const pages = Math.ceil(st.filtered.length / PER);
    $('#rp-pager').innerHTML = pages > 1 ? `
      <button class="btn ghost sm" ${st.page === 1 ? 'disabled' : ''} onclick="Report.state.page--;Report.renderOppoTable()">‹ Prev</button>
      <span class="count" style="margin:0">Page ${st.page} of ${pages}</span>
      <button class="btn ghost sm" ${st.page === pages ? 'disabled' : ''} onclick="Report.state.page++;Report.renderOppoTable()">Next ›</button>` : '';
  },

  pills(a) {
    let h = '';
    if (a.best_universe) h += `<span class="pill">${esc(a.best_universe)}</span>`;
    if (a.secondary_universe) h += `<span class="pill secondary">${esc(a.secondary_universe)}</span>`;
    if (a.tertiary_universe) h += `<span class="pill tertiary">${esc(a.tertiary_universe)}</span>`;
    return h || '<span style="color:var(--tan)">—</span>';
  },

  renderUniverseGrid() {
    const st = this.state;
    const counts = {};
    st.attacks.forEach(a => [a.best_universe, a.secondary_universe, a.tertiary_universe].forEach(u => { if (u) counts[u] = (counts[u] || 0) + 1; }));
    $('#rp-unigrid').innerHTML = st.universes.map(u => `
      <span class="chip ${st.activeUniverse === u ? 'active' : ''}" data-u="${esc(u)}">${esc(u)}<span class="n">${counts[u] || 0}</span></span>`).join('');
    $$('#rp-unigrid .chip').forEach(ch => ch.onclick = () => {
      const u = ch.dataset.u;
      this.state.activeUniverse = this.state.activeUniverse === u ? '' : u;
      $('#rp-uni').value = this.state.activeUniverse;
      this.renderUniverseGrid();
      this.applyOppoFilters();
    });
  },

  exportOppoCSV() {
    const headers = ['number', 'category', 'attack', 'key_detail', 'severity', 'best_universe', 'secondary_universe', 'tertiary_universe', 'notes'];
    downloadFile((this.state.meta.subject || 'attacks').replace(/[^\w-]+/g, '_') + '_attacks.csv',
      toCSV(this.state.filtered, headers), 'text/csv');
  },

  /* ══════════════════ VOTE REPORT ══════════════════ */
  renderVotes(meta, payload) {
    const { member, votes, topics, keywords } = payload;
    this.state = { meta, votes, topics, keywords, vFiltered: [...votes], vPage: 1 };
    const yes = votes.filter(v => v.member_vote === 'Yes').length;
    const no = votes.filter(v => v.member_vote === 'No').length;
    const partyCls = (member.party || '').startsWith('Dem') ? 'dem' : (member.party || '').startsWith('Rep') ? 'rep' : 'ind';

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(member.name)}</h1>
      <div class="page-sub">
        <span class="tag ${partyCls}">${esc(member.party || '')}</span>
        &nbsp;${esc(member.state || member.district || '')} · ${esc(meta.summary || '')} · Generated ${fmtDate(meta.updated)}
      </div>

      <div class="stats">
        <div class="stat"><div class="lbl">Votes Loaded</div><div class="val gold">${votes.length}</div></div>
        <div class="stat"><div class="lbl">Yes</div><div class="val pine">${yes}</div></div>
        <div class="stat"><div class="lbl">No</div><div class="val major">${no}</div></div>
        <div class="stat"><div class="lbl">Other / Absent</div><div class="val niche">${votes.length - yes - no}</div></div>
        <div class="stat"><div class="lbl">OTS Models Hit</div><div class="val pine">${topics.length}</div></div>
      </div>

      <div class="section-h"><h2>OTS Model Topic Analysis</h2><span class="hint">votes matched to targeting models</span>
        <span class="spacer"></span>
        <button class="btn ghost sm" onclick="Report.exportTopicsCSV()">Export CSV</button>
        <button class="btn ghost sm" onclick="Store.exportProject('${meta.id}')">Export Project</button>
        <button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>OTS Model</th><th>Votes</th><th>Yes</th><th>No</th><th>Other</th><th>Matched Keywords</th></tr></thead>
        <tbody>${topics.map((t, i) => `<tr class="${i % 2 ? 'alt' : ''}">
          <td><b>${esc(t.model)}</b></td><td>${t.total}</td>
          <td><span class="badge yes">${t.yes}</span></td><td><span class="badge no">${t.no}</span></td>
          <td><span class="badge other">${t.other}</span></td>
          <td>${t.matchedKeywords.slice(0, 8).map(k => `<span class="pill tertiary">${esc(k)}</span>`).join('')}</td>
        </tr>`).join('')}</tbody>
      </table></div>

      <div class="section-h"><h2>Keyword Vote Analysis</h2><span class="hint">aggregated across all loaded votes</span>
        <span class="spacer"></span><button class="btn ghost sm" onclick="Report.exportKeywordsCSV()">Export CSV</button></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Keyword</th><th>Total</th><th>Yes</th><th>No</th><th>Yes %</th><th>OTS Model Matches</th></tr></thead>
        <tbody>${keywords.slice(0, 150).map((k, i) => `<tr class="${i % 2 ? 'alt' : ''}">
          <td><b>${esc(k.keyword)}</b></td><td>${k.total}</td><td>${k.yes}</td><td>${k.no}</td>
          <td>${k.percentage}%</td>
          <td>${(k.tieredModels || []).map(m => `<span class="pill ${m.tier === 'primary' ? '' : m.tier}">${esc(m.model)}</span>`).join('') || '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>

      <div class="section-h"><h2>Vote Record</h2><span class="hint">most recent first</span>
        <span class="spacer"></span><button class="btn ghost sm" onclick="Report.exportVotesCSV()">Export CSV</button></div>
      <div class="filterbar">
        <input type="search" id="vt-search" placeholder="Search votes…">
        <select id="vt-type"><option value="">All Votes</option><option>Yes</option><option>No</option><option>Present</option><option>Not Voting</option></select>
        <span class="count" id="vt-count"></span>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Date</th><th>Bill</th><th>Description</th><th>Question</th><th>Result</th><th>Vote</th></tr></thead>
        <tbody id="vt-body"></tbody>
      </table></div>
      <div class="filterbar" id="vt-pager"></div>`;

    $('#vt-search').addEventListener('input', () => this.applyVoteFilters());
    $('#vt-type').addEventListener('change', () => this.applyVoteFilters());
    this.applyVoteFilters();
  },

  applyVoteFilters() {
    const st = this.state;
    const q = ($('#vt-search')?.value || '').toLowerCase();
    const type = $('#vt-type')?.value || '';
    st.vFiltered = st.votes.filter(v => {
      if (type && v.member_vote !== type) return false;
      if (q && !((v.bill_number + ' ' + v.description + ' ' + v.question).toLowerCase().includes(q))) return false;
      return true;
    });
    st.vPage = 1;
    this.renderVoteTable();
  },

  renderVoteTable() {
    const st = this.state, PER = 50;
    const start = (st.vPage - 1) * PER;
    const rows = st.vFiltered.slice(start, start + PER);
    const voteCls = v => v === 'Yes' ? 'yes' : v === 'No' ? 'no' : 'other';
    $('#vt-body').innerHTML = rows.map((v, i) => `<tr class="${i % 2 ? 'alt' : ''}">
      <td style="white-space:nowrap">${esc(v.date)}</td>
      <td style="white-space:nowrap"><b>${esc(v.bill_number)}</b></td>
      <td>${esc((v.description || '').slice(0, 180))}</td>
      <td>${esc((v.question || '').slice(0, 60))}</td>
      <td>${esc((v.result || '').slice(0, 40))}</td>
      <td><span class="badge ${voteCls(v.member_vote)}">${esc(v.member_vote)}</span></td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--bark)">No votes match.</td></tr>';
    $('#vt-count').textContent = `${st.vFiltered.length} of ${st.votes.length} votes`;
    const pages = Math.ceil(st.vFiltered.length / PER);
    $('#vt-pager').innerHTML = pages > 1 ? `
      <button class="btn ghost sm" ${st.vPage === 1 ? 'disabled' : ''} onclick="Report.state.vPage--;Report.renderVoteTable()">‹ Prev</button>
      <span class="count" style="margin:0">Page ${st.vPage} of ${pages}</span>
      <button class="btn ghost sm" ${st.vPage === pages ? 'disabled' : ''} onclick="Report.state.vPage++;Report.renderVoteTable()">Next ›</button>` : '';
  },

  exportVotesCSV() {
    downloadFile('votes.csv', toCSV(this.state.vFiltered.map(v => ({ ...v, keywords: (v.keywords || []).join('; ') })),
      ['date', 'congress', 'chamber', 'bill_number', 'description', 'question', 'result', 'member_vote', 'keywords']), 'text/csv');
  },
  exportTopicsCSV() {
    downloadFile('ots_topic_analysis.csv', toCSV(this.state.topics.map(t => ({ ...t, matchedKeywords: t.matchedKeywords.join('; ') })),
      ['model', 'total', 'yes', 'no', 'other', 'matchedKeywords']), 'text/csv');
  },
  exportKeywordsCSV() {
    downloadFile('keyword_analysis.csv', toCSV(this.state.keywords.map(k => ({ ...k, models: (k.tieredModels || []).map(m => `${m.model} (${m.tier})`).join('; ') })),
      ['keyword', 'total', 'yes', 'no', 'other', 'percentage', 'models']), 'text/csv');
  },

  /* ══════════════════ DOCUMENT INTELLIGENCE REPORT ══════════════════ */
  renderDoc(meta, payload) {
    const kws = payload.keywords || [];
    const universes = [...new Set(kws.map(k => k.universe_match).filter(Boolean))];
    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.name)}</h1>
      <div class="page-sub">Document intelligence · ${esc(meta.summary || '')} · Generated ${fmtDate(meta.updated)}</div>

      <div class="stats">
        <div class="stat"><div class="lbl">Words Analyzed</div><div class="val gold">${(payload.wordCount || 0).toLocaleString()}</div></div>
        <div class="stat"><div class="lbl">Significant Keywords</div><div class="val pine">${kws.length}</div></div>
        <div class="stat"><div class="lbl">Universes Matched</div><div class="val pine">${universes.length}</div></div>
      </div>

      <div class="section-h"><h2>Keyword Frequency & Universe Matches</h2>
        <span class="spacer"></span>
        <button class="btn ghost sm" onclick="Report.exportDocCSV()">Export CSV</button>
        <button class="btn ghost sm" onclick="Store.exportProject('${meta.id}')">Export Project</button>
        <button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button>
      </div>
      <div class="chipgrid">${kws.slice(0, 40).map(k =>
        `<span class="chip kw ${k.universe_score >= 0.9 ? 'hot' : ''}" title="${esc(k.universe_match || 'no universe match')}">${esc(k.word)}<span class="n">${k.count}</span></span>`).join('')}</div>

      <div class="tablewrap" style="margin-top:18px"><table>
        <thead><tr><th>Keyword</th><th>Count</th><th>Universe Match</th><th>Match Tier</th></tr></thead>
        <tbody>${kws.map((k, i) => `<tr class="${i % 2 ? 'alt' : ''}">
          <td><b>${esc(k.word)}</b></td><td>${k.count}</td>
          <td>${k.universe_match ? `<span class="pill">${esc(k.universe_match)}</span>` : '—'}</td>
          <td>${k.universe_score >= 0.9 ? 'Primary' : k.universe_score >= 0.7 ? 'Secondary' : k.universe_score >= 0.5 ? 'Tertiary' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    this.state = { meta, docKeywords: kws };
  },

  exportDocCSV() {
    downloadFile('document_keywords.csv', toCSV(this.state.docKeywords,
      ['word', 'count', 'universe_match', 'universe_score']), 'text/csv');
  },

  /* ══════════════════ NEWS LANDING PAGE ══════════════════ */
  renderNews(meta, data) {
    const articles = data.articles || [];
    const keywords = data.keywords || [];
    const sources = data.sources || {};
    this.state = { meta, articles, filtered: [...articles], activeSource: '', newsQ: '' };

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.name)}</h1>
      <div class="page-sub">News intelligence · Last updated ${fmtDate(data.meta?.generated_at || meta.updated)}
        &nbsp;<button class="btn ghost sm" onclick="App.rerunScrape('${meta.id}')">⟳ Re-run Scrape</button>
        &nbsp;<button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button></div>

      <div class="stats">
        <div class="stat"><div class="lbl">Articles</div><div class="val gold">${articles.length}</div></div>
        <div class="stat"><div class="lbl">Sources</div><div class="val pine">${Object.keys(sources).length}</div></div>
        <div class="stat"><div class="lbl">Keywords Tracked</div><div class="val pine">${keywords.length}</div></div>
      </div>

      <div class="section-h"><h2>Keyword Cloud</h2><span class="hint">sized by frequency · gold = strong universe match</span></div>
      <div class="chipgrid">${keywords.slice(0, 50).map(k =>
        `<span class="chip kw ${k.universe_score >= 0.9 ? 'hot' : ''}" data-kw="${esc(k.word)}"
           title="${esc(k.universe_match || '')}" style="font-size:${Math.min(17, 11 + Math.sqrt(k.count) * 1.4)}px">
           ${esc(k.word)}<span class="n">${k.count}</span></span>`).join('')}</div>

      <div class="news-layout" style="margin-top:26px">
        <div class="news-side">
          <div class="card side-panel">
            <h4>Sources</h4>
            <div class="src-item ${!this.state.activeSource ? 'active' : ''}" data-src="">All sources <span class="n">${articles.length}</span></div>
            ${Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([s, n]) =>
              `<div class="src-item" data-src="${esc(s)}">${esc(s)} <span class="n">${n}</span></div>`).join('')}
          </div>
        </div>
        <div>
          <div class="filterbar" style="margin-top:0">
            <input type="search" id="nw-search" placeholder="Search articles…">
            <span class="count" id="nw-count"></span>
          </div>
          <div id="nw-list"></div>
        </div>
      </div>`;

    $('#nw-search').addEventListener('input', e => { this.state.newsQ = e.target.value.toLowerCase(); this.renderNewsList(); });
    $$('#view .src-item').forEach(el => el.onclick = () => {
      this.state.activeSource = el.dataset.src;
      $$('#view .src-item').forEach(x => x.classList.toggle('active', x === el));
      this.renderNewsList();
    });
    $$('#view .chip[data-kw]').forEach(ch => ch.onclick = () => {
      $('#nw-search').value = ch.dataset.kw;
      this.state.newsQ = ch.dataset.kw.toLowerCase();
      this.renderNewsList();
    });
    this.renderNewsList();
  },

  renderNewsList() {
    const st = this.state;
    st.filtered = st.articles.filter(a => {
      if (st.activeSource && a.source_site !== st.activeSource) return false;
      if (st.newsQ && !((a.title + ' ' + (a.body || '')).toLowerCase().includes(st.newsQ))) return false;
      return true;
    });
    $('#nw-count').textContent = `${st.filtered.length} of ${st.articles.length} articles`;
    $('#nw-list').innerHTML = st.filtered.slice(0, 200).map(a => `
      <div class="card article-card">
        <h3><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
        <div class="meta">${esc(a.source_site)}${a.date_published ? ' · ' + esc(a.date_published) : ''}${a.author ? ' · ' + esc(a.author) : ''}</div>
        <div class="body">${esc((a.body || '').slice(0, 300))}${(a.body || '').length > 300 ? '…' : ''}</div>
      </div>`).join('') || '<div class="empty"><div class="glyph">◌</div>No articles match.</div>';
  },
};
