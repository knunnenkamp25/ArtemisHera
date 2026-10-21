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
  // Stance flips the frame: opposing = attack extraction; supporting = the
  // same hits presented as a vulnerability audit (what we must inoculate
  // against before the other side finds it).
  renderOppo(meta, payload) {
    const attacks = payload.attacks || [];
    this.state = { attacks, filtered: [...attacks], sortCol: 'number', sortAsc: true, page: 1, activeUniverse: '', meta };
    const support = meta.stance === 'support';

    const total = attacks.length;
    const sev = s => attacks.filter(a => a.severity === s).length;
    const categories = [...new Set(attacks.map(a => a.category))].sort();
    const universes = [...new Set(attacks.flatMap(a => [a.best_universe, a.secondary_universe, a.tertiary_universe]).filter(Boolean))].sort();
    this.state.universes = universes;

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.subject || meta.name)} — ${support ? 'Vulnerability Audit' : 'Attack Extraction'}</h1>
      <div class="page-sub"><span class="stance-tag ${support ? 'support' : 'oppose'}">${support ? '▲ Supporting' : '▼ Opposing'}</span>
        &nbsp;${esc(meta.summary || '')} · Generated ${fmtDate(meta.updated)}</div>
      ${support ? `<div class="notice"><b>Reading this as their playbook:</b> every line below is an attack the other side can run against ${esc(meta.subject || 'your candidate')}. Severity = exposure. Universes = the audiences that attack would move — your inoculation targets.</div>` : ''}

      <div class="stats">
        <div class="stat"><div class="lbl">${support ? 'Vulnerabilities' : 'Total Attacks'}</div><div class="val gold">${total}</div></div>
        <div class="stat"><div class="lbl">${support ? 'Critical Exposure' : 'Major'}</div><div class="val major">${sev('Major')}</div></div>
        <div class="stat"><div class="lbl">Moderate</div><div class="val moderate">${sev('Moderate')}</div></div>
        <div class="stat"><div class="lbl">Minor</div><div class="val minor">${sev('Minor')}</div></div>
        <div class="stat"><div class="lbl">Niche</div><div class="val niche">${sev('Niche')}</div></div>
      </div>

      <div class="filterbar">
        <input type="search" id="rp-search" placeholder="Search attacks…">
        <select id="rp-cat"><option value="">All Categories</option>${categories.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <select id="rp-sev"><option value="">All Severities</option>${SEVERITY_ORDER.map(s => `<option>${s}</option>`).join('')}</select>
        <select id="rp-uni"><option value="">All Universes</option>${universes.map(u => `<option>${esc(u)}</option>`).join('')}</select>
        <span class="count" id="rp-count"></span><span class="count" id="rp-rematch-note" style="margin-left:0"></span>
        <button class="btn ghost sm" onclick="Report.rematchOppo()" title="Recompute universe matches for auto-extracted attacks using the current matching rules">⟳ Re-match Universes</button>
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

      <div class="section-h"><h2>${support ? 'Audiences at Risk' : 'Universe Coverage'}</h2>
        <span class="hint">${universes.length} universes ${support ? 'exposed' : 'matched'} — click to filter</span></div>
      <div class="chipgrid" id="rp-unigrid"></div>`;

    // wire controls
    ['rp-search', 'rp-cat', 'rp-sev', 'rp-uni'].forEach(id => {
      const handler = () => {
        if (id === 'rp-uni') {
          this.state.activeUniverse = $('#rp-uni').value;
          this.renderUniverseGrid();     // keep the chip highlight in step
        }
        this.applyOppoFilters();
      };
      $('#' + id).addEventListener(id === 'rp-search' ? 'input' : 'change',
        id === 'rp-search' ? debounce(handler, 200) : handler);
    });
    // Delegated expand handler (keeps attack data out of inline handlers)
    $('#rp-body').addEventListener('click', e => {
      const btn = e.target.closest('.expand-btn[data-row]');
      if (btn) $(`#rp-body [data-detail="${btn.dataset.row}"]`)?.classList.toggle('open');
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
    // Row indices drive expansion via a delegated handler — never interpolate
    // attack fields into an onclick, and never trust severity to be a string:
    // both can come from an imported attacks.json or .artemishera.json.
    $('#rp-body').innerHTML = rows.map((a, i) => {
      const sev = String(a.severity || 'Minor');
      const sevCls = SEVERITY_ORDER.includes(sev) ? sev.toLowerCase() : 'niche';
      return `
      <tr class="${i % 2 ? 'alt' : ''}">
        <td class="expand-btn" data-row="${i}">▸</td>
        <td>${esc(a.number)}</td>
        <td>${esc(a.category)}</td>
        <td>${esc(a.attack)}</td>
        <td><span class="badge ${sevCls}">${esc(sev)}</span></td>
        <td>${this.pills(a)}</td>
      </tr>
      <tr class="detail-row" data-detail="${i}"><td colspan="6" class="detail-cell">
        <h4>Key Detail</h4><p>${esc(a.key_detail || 'No additional detail.')}</p>
        ${a.notes ? `<h4>Notes</h4><p>${esc(a.notes)}</p>` : ''}
      </td></tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--bark)">No attacks match the current filters.</td></tr>';

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

  // Re-run universe matching over auto-extracted attacks with current rules.
  // Imported Poseidon attacks keep their hand-assigned universes untouched.
  async rematchOppo() {
    const meta = this.state.meta;
    const payload = Store.getPayload(meta.id);
    if (!payload || !payload.attacks) return;
    const universes = await loadUniverses();
    const index = buildUniverseIndex(universes);
    let changed = 0;
    for (const a of payload.attacks) {
      if (!(a.notes || '').startsWith('Auto-extracted')) continue;
      const u = matchTextToUniverses(a.key_detail || a.attack, index, 3);
      if (u[0] !== a.best_universe || u[1] !== a.secondary_universe || u[2] !== a.tertiary_universe) changed++;
      a.best_universe = u[0] || '';
      a.secondary_universe = u[1] || '';
      a.tertiary_universe = u[2] || '';
    }
    Store.saveProject(meta, payload);
    this.renderOppo(meta, payload);
    // Not setStatus: that strips the .count class and overwrites the
    // "X of Y attacks" text that renderOppoTable just set.
    const note = $('#rp-rematch-note');
    if (note) note.textContent = changed ? `${changed} re-matched` : 'already current';
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
    // Open States bulk archives carry vote records but no party/district, so
    // party is often unknown. Render nothing rather than an empty or
    // misleadingly-styled tag.
    const p = (member.party || '').trim();
    const partyCls = /^dem/i.test(p) ? 'dem' : /^rep/i.test(p) ? 'rep' : 'ind';
    const partyTag = p ? `<span class="tag ${partyCls}">${esc(p)}</span>` : '';

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(member.name)}</h1>
      <div class="page-sub">
        ${partyTag}
        <span class="stance-tag ${meta.stance === 'support' ? 'support' : 'oppose'}">${meta.stance === 'support' ? '▲ Supporting' : '▼ Opposing'}</span>
        &nbsp;${esc(member.state || member.district || '')} · ${esc(meta.summary || '')} · Generated ${fmtDate(meta.updated)}
      </div>
      ${meta.stance === 'support'
        ? '<div class="notice"><b>Support read:</b> universes below are where this record is an asset to tout — or a liability to inoculate. High-Yes rows on popular issues are persuasion gold; check Weak/Mixed rows before leaning on them.</div>'
        : ''}

      <div class="stats">
        <div class="stat"><div class="lbl">Votes Loaded</div><div class="val gold">${votes.length}</div></div>
        <div class="stat"><div class="lbl">Yes</div><div class="val pine">${yes}</div></div>
        <div class="stat"><div class="lbl">No</div><div class="val major">${no}</div></div>
        <div class="stat"><div class="lbl">Other / Absent</div><div class="val niche">${votes.length - yes - no}</div></div>
        <div class="stat"><div class="lbl">Universes Hit</div><div class="val pine">${topics.length}</div></div>
      </div>

      <div class="section-h"><h2>Universe Topic Analysis</h2><span class="hint">votes matched to targeting universes</span>
        <span class="spacer"></span>
        <button class="btn ghost sm" onclick="Report.exportTopicsCSV()">Export CSV</button>
        <button class="btn ghost sm" onclick="Store.exportProject('${meta.id}')">Export Project</button>
        <button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button>
      </div>
      <div class="notice" style="margin-top:0">A match needs <b>one strong signal</b> (phrase, anchor word, or a keyword you pinned) or <b>two independent weak ones</b>.
        Click <b>×</b> on any keyword below to ban that keyword→universe pairing — the table recomputes instantly and the rule applies to every future run. Manage rules in <a href="#/settings">Settings</a>.</div>
      <div class="tablewrap"><table>
        <thead><tr><th>Universe</th><th>Votes</th><th>Yes</th><th>No</th><th>Other</th><th>Confidence</th><th>Matched Keywords</th></tr></thead>
        <tbody id="tp-body">${topics.map((t, i) => this.topicRow(t, i)).join('')}</tbody>
      </table></div>

      <div class="section-h"><h2>Keyword Vote Analysis</h2><span class="hint">aggregated across all loaded votes</span>
        <span class="spacer"></span><button class="btn ghost sm" onclick="Report.exportKeywordsCSV()">Export CSV</button></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Keyword</th><th>Total</th><th>Yes</th><th>No</th><th>Yes %</th><th>Universe Matches</th></tr></thead>
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

    $('#vt-search').addEventListener('input', debounce(() => this.applyVoteFilters(), 200));
    $('#vt-type').addEventListener('change', () => this.applyVoteFilters());
    // Delegated handler for the ban-keyword × buttons in the topic table
    $('#tp-body').addEventListener('click', e => {
      const btn = e.target.closest('.kw-ban');
      if (btn) this.banKeyword(btn.dataset.m, btn.dataset.k);
    });
    this.applyVoteFilters();
  },

  topicRow(t, i) {
    const conf = t.strongPct == null ? ''
      : t.strongPct >= 70 ? `<span class="badge yes" title="${t.strongPct}% of matches came from strong signals">Strong</span>`
      : t.strongPct >= 30 ? `<span class="badge other" title="${t.strongPct}% strong signals">Mixed</span>`
      : `<span class="badge no" title="Only ${t.strongPct}% strong signals — matched mostly on pairs of weak words">Weak</span>`;
    return `<tr class="${i % 2 ? 'alt' : ''}">
      <td><b>${esc(t.model)}</b></td><td>${t.total}</td>
      <td><span class="badge yes">${t.yes}</span></td><td><span class="badge no">${t.no}</span></td>
      <td><span class="badge other">${t.other}</span></td>
      <td>${conf}</td>
      <td>${t.matchedKeywords.slice(0, 8).map(k =>
        `<span class="pill tertiary kwpill">${esc(k)}<span class="kw-ban" data-m="${esc(t.model)}" data-k="${esc(k)}" title="Ban '${esc(k)}' → ${esc(t.model)} everywhere (undo in Settings)">×</span></span>`).join('')}</td>
    </tr>`;
  },

  async banKeyword(universe, kw) {
    MatchRules.ban(kw, universe);
    const meta = this.state.meta;
    const payload = Store.getPayload(meta.id);
    if (!payload || !payload.votes) return;
    const universes = await loadUniverses();
    payload.topics = Votes.matchVotesToTopics(payload.votes, universes);
    payload.keywords = Votes.analyzeKeywords(payload.votes, universes);
    Store.saveProject(meta, payload);
    this.renderVotes(meta, payload);
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
    downloadFile('universe_topic_analysis.csv', toCSV(this.state.topics.map(t => ({ ...t, matchedKeywords: t.matchedKeywords.join('; ') })),
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

  /* ══════════════════ TOPIC SEARCH REPORT ══════════════════ */
  // Bill-centric: which bills matched, then expand any bill into its roll
  // calls with party splits and every legislator's vote. The side panel ranks
  // the players — legislators with the most floor votes on the topic.
  renderTopic(meta, data) {
    const bills = data.bills || [];
    const legislators = data.legislators || [];
    const m = data.meta || {};
    this.state = { meta, data, bills, filtered: [...bills], tq: '', tState: '', tChamber: '', tResult: '',
                   floorOnly: true, activeLegislator: '', tPage: 1 };
    const stance = meta.stance === 'support';
    const states = [...new Set(bills.map(b => b.state))].sort();
    const chambers = [...new Set(bills.flatMap(b => b.chambers || []))].sort();
    const partyCounts = {};
    legislators.forEach(L => { partyCounts[L.party] = (partyCounts[L.party] || 0) + 1; });

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.name)}</h1>
      <div class="page-sub"><span class="stance-tag ${stance ? 'support' : 'oppose'}">${stance ? '▲ Supporting' : '▼ Opposing'}</span>
        &nbsp;Topic search · ${(m.phrases || []).map(p => `<b>${esc(p)}</b>`).join(', ')} · ${m.states?.length ? esc(m.states.join(', ')) : 'all states'} · ${esc(String(m.from_year || ''))}${m.to_year ? '–' + esc(String(m.to_year)) : '+'}
        · Generated ${fmtDate(m.generated_at || meta.updated)}
        &nbsp;<button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button></div>
      ${m.truncated ? `<div class="notice"><b>Capped:</b> more than ${bills.length} bills matched — narrow the states or years, or use more specific phrases.</div>` : ''}
      ${m.errors?.length ? `<div class="notice">${m.errors.length} session file${m.errors.length === 1 ? '' : 's'} could not be read and were skipped.</div>` : ''}

      <div class="stats">
        <div class="stat"><div class="lbl">Bills</div><div class="val gold">${bills.length}</div></div>
        <div class="stat"><div class="lbl">States</div><div class="val pine">${states.length}</div></div>
        <div class="stat"><div class="lbl">Floor Roll Calls</div><div class="val pine">${m.floor_rollcalls ?? bills.reduce((n, b) => n + (b.floor_rollcalls || 0), 0)}</div></div>
        <div class="stat"><div class="lbl">Legislators on Record</div><div class="val pine">${legislators.length}</div></div>
        <div class="stat"><div class="lbl">Sessions Scanned</div><div class="val niche">${m.sessions_scanned ?? '—'}</div></div>
      </div>

      ${(data.topics || []).length ? `
      <div class="section-h"><h2>Universes This Topic Touches</h2><span class="hint">bills matched to targeting universes · gold = strong evidence</span></div>
      <div class="chipgrid">${data.topics.slice(0, 24).map(t =>
        `<span class="chip kw ${t.strongPct >= 70 ? 'hot' : ''}" title="${esc((t.matchedKeywords || []).join(', '))}">${esc(t.model)}<span class="n">${t.bills}</span></span>`).join('')}</div>` : ''}

      <div class="news-layout" style="margin-top:22px">
        <div class="news-side">
          <div class="card side-panel">
            <h4>The Players</h4>
            <div style="font-size:11.5px;color:var(--bark);margin-bottom:8px">Floor votes on matched bills${Object.keys(partyCounts).length ? ' · ' + Object.entries(partyCounts).map(([p, n]) => `${esc(p.slice(0, 3))} ${n}`).join(' · ') : ''}</div>
            <div id="tp-players"></div>
          </div>
        </div>
        <div>
          <div class="filterbar" style="margin-top:0">
            <input type="search" id="tp-search" placeholder="Search bills…">
            <select id="tp-state"><option value="">All states</option>${states.map(s => `<option>${esc(s)}</option>`).join('')}</select>
            <select id="tp-chamber"><option value="">Both chambers</option>${chambers.map(c => `<option>${esc(c)}</option>`).join('')}</select>
            <select id="tp-result"><option value="">Any result</option><option value="pass">Passed</option><option value="fail">Failed</option></select>
            <label style="font-size:12.5px;color:var(--bark);display:flex;align-items:center;gap:5px;text-transform:none;letter-spacing:0;margin:0"><input type="checkbox" id="tp-floor" checked style="width:auto;margin:0"> floor votes only</label>
            <span class="count" id="tp-count"></span>
            <button class="btn ghost sm" onclick="Report.exportTopicBillsCSV()">Export Bills CSV</button>
            <button class="btn ghost sm" onclick="Report.exportTopicVotesCSV()">Export Votes CSV</button>
          </div>
          <div class="tablewrap"><table>
            <thead><tr><th style="width:30px"></th><th>State</th><th>Bill</th><th>Title</th><th>First Vote</th><th>Roll Calls</th><th>Last Result</th></tr></thead>
            <tbody id="tp-body"></tbody>
          </table></div>
          <div class="filterbar" id="tp-pager"></div>
        </div>
      </div>`;

    $('#tp-search').addEventListener('input', debounce(e => { this.state.tq = e.target.value.toLowerCase(); this.applyTopicFilters(); }, 200));
    $('#tp-state').onchange = e => { this.state.tState = e.target.value; this.applyTopicFilters(); };
    $('#tp-chamber').onchange = e => { this.state.tChamber = e.target.value; this.applyTopicFilters(); };
    $('#tp-result').onchange = e => { this.state.tResult = e.target.value; this.applyTopicFilters(); };
    $('#tp-floor').onchange = e => { this.state.floorOnly = e.target.checked; this.renderTopicTable(); };
    // Delegated: the panel re-renders when the state filter changes
    $('#tp-players').addEventListener('click', e => {
      const el = e.target.closest('.src-item[data-leg]');
      if (!el) return;
      this.state.activeLegislator = el.dataset.leg;
      $$('#tp-players .src-item[data-leg]').forEach(x => x.classList.toggle('active', x === el));
      this.applyTopicFilters();
    });
    $('#tp-body').addEventListener('click', e => {
      const btn = e.target.closest('.expand-btn[data-row]');
      if (btn) $(`#tp-body [data-detail="${btn.dataset.row}"]`)?.classList.toggle('open');
    });
    this.applyTopicFilters();
  },

  // The players panel follows the state filter: a nationwide search would
  // otherwise show forty members of whichever chamber voted most often.
  renderTopicPlayers() {
    const st = this.state;
    const all = st.data.legislators || [];
    const pool = st.tState ? all.filter(L => L.state === st.tState) : all;
    $('#tp-players').innerHTML = `
      <div class="src-item ${!st.activeLegislator ? 'active' : ''}" data-leg="">All legislators${st.tState ? ' in ' + esc(st.tState) : ''} <span class="n">${pool.length}</span></div>
      ${pool.slice(0, 40).map(L => `
        <div class="src-item ${st.activeLegislator === L.state + ':' + L.people_id ? 'active' : ''}" data-leg="${esc(L.state + ':' + L.people_id)}" title="${esc(L.bills.join(', '))}">
          <span>${esc(L.name)} <span style="color:var(--tan);font-size:11px">${esc((L.party || '?')[0])}-${esc(L.state)}${L.district ? ' ' + esc(String(L.district)) : ''}</span></span>
          <span class="n" title="Yes / No"><span style="color:var(--pine)">${L.yes}</span>/<span style="color:var(--sev-major)">${L.no}</span></span>
        </div>`).join('')}
      ${pool.length > 40 ? `<div style="font-size:11.5px;color:var(--tan);padding:6px 8px">+${pool.length - 40} more — filter by state, or see the votes CSV</div>` : ''}`;
  },

  applyTopicFilters() {
    const st = this.state;
    const [legState, legId] = (st.activeLegislator || '').split(':');
    // A legislator from another state is meaningless once the state changes
    if (legState && st.tState && legState !== st.tState) st.activeLegislator = '';
    this.renderTopicPlayers();
    st.filtered = st.bills.filter(b => {
      if (st.tState && b.state !== st.tState) return false;
      if (st.tChamber && !(b.chambers || []).includes(st.tChamber)) return false;
      if (st.tResult === 'pass' && !/^pass/i.test(b.last_result || '')) return false;
      if (st.tResult === 'fail' && /^pass/i.test(b.last_result || '')) return false;
      if (legId && !(b.state === legState && b.rollcalls.some(rc => !rc.committee && rc.votes.some(v => v.people_id === legId)))) return false;
      if (st.tq && !((b.bill + ' ' + b.title + ' ' + b.state).toLowerCase().includes(st.tq))) return false;
      return true;
    });
    st.tPage = 1;
    this.renderTopicTable();
  },

  renderTopicTable() {
    const st = this.state, PER = 25;
    const start = (st.tPage - 1) * PER;
    const rows = st.filtered.slice(start, start + PER);
    const [, legId] = (st.activeLegislator || '').split(':');
    const partyLine = rc => Object.entries(rc.by_party || {}).map(([p, c]) =>
      `<span class="pill tertiary">${esc(p)}: <b style="color:var(--pine)">${c.Yes || 0}</b>–<b style="color:var(--sev-major)">${c.No || 0}</b></span>`).join(' ');
    const voteList = (rc, which) => rc.votes.filter(v => v.vote === which).map(v =>
      `<span class="pill ${which === 'Yes' ? '' : 'secondary'} ${v.people_id === legId ? 'kwpill' : ''}" style="${v.people_id === legId ? 'outline:2px solid var(--amber)' : ''}">${esc(v.name)} <span style="opacity:.7">${esc((v.party || '?')[0])}${v.district ? '-' + esc(String(v.district)) : ''}</span></span>`).join('');
    $('#tp-body').innerHTML = rows.map((b, i) => {
      const rcs = b.rollcalls.filter(rc => !st.floorOnly || !rc.committee);
      const passed = /^pass/i.test(b.last_result || '');
      return `
      <tr class="${i % 2 ? 'alt' : ''}">
        <td class="expand-btn" data-row="${i}">▸</td>
        <td><b>${esc(b.state)}</b></td>
        <td style="white-space:nowrap"><b>${esc(b.bill)}</b><div style="font-size:11px;color:var(--tan)">${esc(b.session)}</div></td>
        <td>${esc(b.title)}<div style="font-size:11px;color:var(--tan)">matched: ${esc((b.phrases || []).join(', '))}</div></td>
        <td style="white-space:nowrap">${esc(b.first_date || '')}</td>
        <td>${b.floor_rollcalls || 0} floor${b.rollcalls.length > (b.floor_rollcalls || 0) ? ` <span style="color:var(--tan)">+${b.rollcalls.length - (b.floor_rollcalls || 0)} cmte</span>` : ''}</td>
        <td><span class="badge ${passed ? 'yes' : 'no'}">${esc(b.last_result || '—')}</span></td>
      </tr>
      <tr class="detail-row" data-detail="${i}"><td colspan="7" class="detail-cell">
        ${rcs.length ? rcs.map(rc => `
          <div style="margin:10px 0 14px">
            <h4 style="margin-bottom:4px">${esc(rc.date)} · ${esc(rc.chamber || '?')} · ${esc(rc.question || 'Vote')} · <span class="badge ${/^pass/i.test(rc.result || '') ? 'yes' : 'no'}">${esc(rc.result || '—')}</span>${rc.committee ? ' <span class="badge other">committee</span>' : ''}</h4>
            <div style="font-size:12.5px;margin:4px 0">Yes <b style="color:var(--pine)">${rc.tally?.Yes || 0}</b> · No <b style="color:var(--sev-major)">${rc.tally?.No || 0}</b> · Other ${(rc.tally?.Present || 0) + (rc.tally?.['Not Voting'] || 0)} &nbsp; ${partyLine(rc)}</div>
            <details style="margin-top:4px"><summary style="cursor:pointer;font-size:12.5px;color:var(--bark)">Show every vote (${rc.votes.length})</summary>
              <div style="margin-top:6px"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--pine);margin:6px 0 3px">Yes</div>${voteList(rc, 'Yes') || '<span style="color:var(--tan)">none</span>'}
              <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--sev-major);margin:8px 0 3px">No</div>${voteList(rc, 'No') || '<span style="color:var(--tan)">none</span>'}
              ${rc.votes.some(v => v.vote !== 'Yes' && v.vote !== 'No') ? `<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--bark);margin:8px 0 3px">Present / Not voting</div>${rc.votes.filter(v => v.vote !== 'Yes' && v.vote !== 'No').map(v => `<span class="pill tertiary">${esc(v.name)}</span>`).join('')}` : ''}</div>
            </details>
          </div>`).join('') : '<p style="color:var(--bark);font-size:13px">Only committee votes recorded for this bill — untick "floor votes only" to see them.</p>'}
      </td></tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--bark)">No bills match the current filters.</td></tr>';
    $('#tp-count').textContent = `${st.filtered.length} of ${st.bills.length} bills`;
    const pages = Math.ceil(st.filtered.length / PER);
    $('#tp-pager').innerHTML = pages > 1 ? `
      <button class="btn ghost sm" ${st.tPage === 1 ? 'disabled' : ''} onclick="Report.state.tPage--;Report.renderTopicTable()">‹ Prev</button>
      <span class="count" style="margin:0">Page ${st.tPage} of ${pages}</span>
      <button class="btn ghost sm" ${st.tPage === pages ? 'disabled' : ''} onclick="Report.state.tPage++;Report.renderTopicTable()">Next ›</button>` : '';
  },

  exportTopicBillsCSV() {
    const rows = this.state.filtered.map(b => ({
      state: b.state, session: b.session, bill: b.bill, title: b.title, matched: (b.phrases || []).join('; '),
      first_vote: b.first_date, last_vote: b.last_date, floor_rollcalls: b.floor_rollcalls, last_result: b.last_result,
      chambers: (b.chambers || []).join('; '),
    }));
    downloadFile('topic_bills.csv', toCSV(rows, ['state', 'session', 'bill', 'title', 'matched', 'first_vote', 'last_vote', 'floor_rollcalls', 'last_result', 'chambers']), 'text/csv');
  },

  exportTopicVotesCSV() {
    const rows = [];
    for (const b of this.state.filtered) for (const rc of b.rollcalls) {
      if (this.state.floorOnly && rc.committee) continue;
      for (const v of rc.votes) rows.push({
        state: b.state, bill: b.bill, title: b.title, date: rc.date, chamber: rc.chamber, question: rc.question,
        result: rc.result, committee: rc.committee ? 'yes' : 'no', legislator: v.name, party: v.party, district: v.district, vote: v.vote,
      });
    }
    downloadFile('topic_votes.csv', toCSV(rows, ['state', 'bill', 'title', 'date', 'chamber', 'question', 'result', 'committee', 'legislator', 'party', 'district', 'vote']), 'text/csv');
  },

  /* ══════════════════ NEWS LANDING PAGE ══════════════════ */
  renderNews(meta, data) {
    const articles = data.articles || [];
    const keywords = data.keywords || [];
    const sources = data.sources || {};
    const outlets = data.meta?.outlets;
    this.state = { meta, articles, filtered: [...articles], activeSource: '', newsQ: '' };

    $('#view').innerHTML = `
      ${this.crumbs(meta.name)}
      <h1 class="page-title">${esc(meta.name)}</h1>
      <div class="page-sub">News intelligence · Last updated ${fmtDate(data.meta?.generated_at || meta.updated)}
        &nbsp;<button class="btn ghost sm" onclick="App.rerunScrape('${meta.id}')">⟳ Re-run Scrape</button>
        &nbsp;<button class="btn gold sm" onclick="location.hash='#/hera?project=${meta.id}'">Build Campaign →</button></div>

      <div class="stats">
        <div class="stat"><div class="lbl">Articles</div><div class="val gold">${articles.length}</div></div>
        <div class="stat"><div class="lbl">${outlets ? 'Outlets Producing' : 'Sources'}</div>
          <div class="val pine">${outlets ? `${outlets.produced}<span style="font-size:16px;color:var(--bark)"> / ${outlets.tried}</span>` : Object.keys(sources).length}</div></div>
        <div class="stat"><div class="lbl">Keywords Tracked</div><div class="val pine">${keywords.length}</div></div>
      </div>
      ${this.outletCoverage(data.meta)}

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

  // Why a scrape came back thin: the cloud scraper reports every outlet it
  // tried and how it ended (meta.sites). Older result files have no such
  // block and render nothing here.
  OUTLET_STATUS: {
    ok:           ['Produced articles', 'yes'],
    no_recent:    ['Reachable — nothing new in the date window', 'other'],
    no_feed:      ['Reachable — no feed, API or recognisable article links', 'other'],
    no_articles:  ['Reachable — nothing extractable', 'other'],
    blocked:      ['Blocked the cloud runner (WAF / bot protection)', 'no'],
    rate_limited: ['Rate-limited every request', 'no'],
    unreachable:  ['Unreachable (DNS / TLS / connection)', 'no'],
    crashed:      ['Scraper error', 'no'],
    skipped:      ['Not attempted — run hit its time budget', 'other'],
  },

  outletCoverage(meta) {
    const sites = meta?.sites;
    if (!Array.isArray(sites) || !sites.length) return '';
    const by = meta.outlets?.by_status || {};
    const run = meta.run || {};
    const order = Object.keys(this.OUTLET_STATUS);
    const chips = order.filter(k => by[k]).map(k =>
      `<span class="badge ${this.OUTLET_STATUS[k][1]}" title="${esc(this.OUTLET_STATUS[k][0])}">${esc(k.replace('_', ' '))} ${by[k]}</span>`).join(' ');
    const quiet = sites.filter(s => s.status !== 'ok')
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    const mins = run.elapsed_seconds ? (run.elapsed_seconds / 60).toFixed(1) + ' min' : '';
    return `
      <div class="card panel" style="margin-top:4px">
        <div class="section-h" style="margin-top:0"><h2 style="font-size:16px">Outlet Coverage</h2>
          <span class="hint">${esc(mins)}${run.workers > 1 ? ` · ${run.workers} parallel workers` : ''}${run.budget_hit ? ' · <b style="color:var(--sev-major)">time budget hit</b>' : ''}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px">${chips}</div>
        ${quiet.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:13px;color:var(--bark)">${quiet.length} outlet${quiet.length > 1 ? 's' : ''} produced nothing — show why</summary>
          <div style="overflow-x:auto"><table class="tbl" style="margin-top:8px;font-size:12.5px;width:100%">
            <tr><th style="text-align:left">Outlet</th><th style="text-align:left">Outcome</th><th style="text-align:left">Detail</th></tr>
            ${quiet.map(s => `<tr><td><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.domain || s.url)}</a></td>
              <td>${esc((this.OUTLET_STATUS[s.status] || [s.status])[0])}</td>
              <td style="color:var(--bark)">${esc(s.note || '')}${s.found ? ` (${s.found} found)` : ''}</td></tr>`).join('')}
          </table></div></details>` : ''}
      </div>`;
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
        <h3><a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
        <div class="meta">${esc(a.source_site)}${a.date_published ? ' · ' + esc(a.date_published) : ''}${a.author ? ' · ' + esc(a.author) : ''}</div>
        <div class="body">${esc((a.body || '').slice(0, 300))}${(a.body || '').length > 300 ? '…' : ''}</div>
      </div>`).join('') || '<div class="empty"><div class="glyph">◌</div>No articles match.</div>';
  },
};
