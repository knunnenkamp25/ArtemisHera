/* =========================================================================
   Hera — messaging campaign generator
   Takes any completed project (oppo, votes, documents, news) and generates a
   full messaging campaign: phased timeline across channels, sample emails /
   tweets / texts / posts, press releases, and ad concepts. Everything is
   editable groundwork for a strategist, not final copy.
   ========================================================================= */

const Hera = {
  state: { campaign: null, meta: null, tab: 'timeline' },

  /* ── Derive "hits" (message-ready attack lines) from any project type ── */
  deriveHits(meta, payload) {
    const hits = [];
    if (!payload) return hits;

    if (meta.type === 'oppo-book' && payload.attacks) {
      const rank = { Major: 0, Moderate: 1, Minor: 2, Niche: 3 };
      [...payload.attacks].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 12).forEach(a => hits.push({
        line: a.attack, detail: a.key_detail, severity: a.severity,
        universes: [a.best_universe, a.secondary_universe, a.tertiary_universe].filter(Boolean),
        category: a.category,
      }));
    }

    if ((meta.type === 'federal-votes' || meta.type === 'state-votes') && payload.topics) {
      const name = payload.member?.name || meta.subject || 'The incumbent';
      payload.topics.slice(0, 10).forEach(t => {
        const lean = t.no > t.yes ? 'voted NO' : 'voted YES';
        const n = Math.max(t.yes, t.no);
        hits.push({
          line: `${name} ${lean} on ${n} of ${t.total} votes touching ${t.model}`,
          detail: `Across the loaded record: ${t.yes} Yes / ${t.no} No / ${t.other} other on votes matching keywords: ${t.matchedKeywords.slice(0, 6).join(', ')}.`,
          severity: t.total >= 15 ? 'Major' : t.total >= 6 ? 'Moderate' : 'Minor',
          universes: [t.model], category: 'Voting Record',
        });
      });
    }

    if ((meta.type === 'documents') && payload.keywords) {
      payload.keywords.filter(k => k.universe_match).slice(0, 8).forEach(k => hits.push({
        line: `Document intelligence: "${k.word}" appears ${k.count}× — a live issue for the ${k.universe_match} universe`,
        detail: `Keyword "${k.word}" surfaced ${k.count} times in ${meta.name}. Strongest audience: ${k.universe_match}.`,
        severity: k.count >= 10 ? 'Moderate' : 'Minor',
        universes: [k.universe_match], category: 'Document Intelligence',
      }));
    }

    if ((meta.type === 'news-scrape' || meta.type === 'web-scrape') && payload.keywords) {
      payload.keywords.filter(k => k.universe_match).slice(0, 8).forEach(k => hits.push({
        line: `News cycle: "${k.word}" is trending (${k.count} mentions) with the ${k.universe_match} universe`,
        detail: `Coverage scan found ${k.count} mentions of "${k.word}" across tracked sources. Ride or counter the cycle with ${k.universe_match}.`,
        severity: k.count >= 15 ? 'Moderate' : 'Minor',
        universes: [k.universe_match], category: 'Earned Media',
      }));
    }
    return hits;
  },

  /* ── Campaign generation ─────────────────────────────────────────────── */
  generate(meta, payload, opts) {
    const subject = opts.subject || meta.subject || meta.name;
    const sponsor = opts.sponsor || 'Paid for by [Committee Name]';
    const weeks = Math.min(12, Math.max(2, opts.weeks || 6));
    const hits = this.deriveHits(meta, payload);
    if (!hits.length) throw new Error('This project has no message-ready findings yet.');

    const phaseOf = w => {
      const t = w / weeks;
      return t < 0.34 ? 0 : t < 0.75 ? 1 : 2;
    };
    const topHits = hits.slice(0, 6);
    const allU = [...new Set(hits.flatMap(h => h.universes))];

    // Timeline: channel × week grid
    const timeline = [];
    for (let w = 1; w <= weeks; w++) {
      const ph = phaseOf(w);
      const hit = hits[(w - 1) % hits.length];
      const alt = hits[w % hits.length];
      timeline.push(
        { week: w, phase: ph, channel: 'email', label: ph === 0 ? 'Intro narrative email' : ph === 1 ? 'Issue hit email' : 'Contrast + GOTV email', hit },
        { week: w, phase: ph, channel: 'social', label: ph === 0 ? 'Framing thread + graphic' : 'Hit rotation (3 posts)', hit: alt },
        { week: w, phase: ph, channel: 'ads', label: ph === 0 ? 'Awareness flight' : ph === 1 ? 'Universe-targeted flight' : 'High-frequency closing flight', hit },
      );
      if (w % 2 === 0) timeline.push({ week: w, phase: ph, channel: 'sms', label: ph === 2 ? 'GOTV text blast' : 'Persuasion text', hit: alt });
      if (ph !== 0 && w % 2 === 1) timeline.push({ week: w, phase: ph, channel: 'press', label: 'Press release / pitch', hit });
    }

    const campaign = {
      subject, sponsor, weeks, generated: new Date().toISOString(),
      sourceProject: meta.id, sourceName: meta.name, universes: allU, hits,
      timeline,
      emails: topHits.slice(0, 3).map((h, i) => this.emailTemplate(subject, h, i, sponsor)),
      tweets: topHits.slice(0, 4).map((h, i) => this.tweetTemplate(subject, h, i)),
      sms: topHits.slice(0, 3).map((h, i) => this.smsTemplate(subject, h, i)),
      posts: topHits.slice(0, 2).map((h, i) => this.postTemplate(subject, h, i)),
      press: topHits.slice(0, 2).map((h, i) => this.pressTemplate(subject, h, i)),
      ads: topHits.slice(0, 4).map((h, i) => this.adConcept(subject, h, i)),
    };
    return campaign;
  },

  /* ── Content templates ───────────────────────────────────────────────── */
  emailTemplate(subject, h, i, sponsor) {
    const subj = [
      `The truth about ${subject}`,
      `${subject} thinks you won't notice`,
      `This is what ${subject} doesn't want you to see`,
    ][i] || `About ${subject}`;
    return {
      audience: h.universes[0] || 'Persuasion universe',
      subject_line: subj,
      preview: h.line.slice(0, 90),
      body:
`Friend,

${h.line}.

${h.detail}

That's not what our community deserves — and it's not something ${subject} can spin away. The record is the record.

We're making sure every voter knows before they cast a ballot. Can you chip in to help us reach them?

[ CONTRIBUTE ] [ SHARE THE FACTS ]

Thank you,
[Campaign Signer]

${sponsor}`,
    };
  },

  tweetTemplate(subject, h, i) {
    const open = ['🚨 FACT:', 'The record doesn\'t lie:', 'While you weren\'t looking —', 'Remember this in November:'][i] || 'FACT:';
    let txt = `${open} ${h.line}.`;
    if (txt.length < 200 && h.universes[0]) txt += `\n\n${'#' + h.universes[0].replace(/[^A-Za-z0-9]/g, '')}`;
    return { audience: h.universes[0] || 'Broad', text: txt.slice(0, 275) };
  },

  smsTemplate(subject, h, i) {
    return {
      audience: h.universes[0] || 'Persuasion',
      text: `${h.line.slice(0, 120)}. Voters deserve the truth about ${subject}. See the record: [link]  Reply STOP to opt out`,
    };
  },

  postTemplate(subject, h, i) {
    return {
      audience: h.universes[0] || 'Broad',
      platform: i === 0 ? 'Facebook' : 'Instagram',
      text:
`${h.line}.

${h.detail}

Our neighbors deserve better. Share this so every voter sees the record before Election Day. ➡️`,
    };
  },

  pressTemplate(subject, h, i) {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return {
      headline: `NEW: ${h.line}`,
      subhead: `Records reveal what ${subject} hoped voters would never find`,
      body:
`FOR IMMEDIATE RELEASE — ${today}

[CITY, STATE] — ${h.line}, according to a review of public records released today.

${h.detail}

"Voters deserve to know exactly who ${subject} works for — and it isn't them," said [Spokesperson Name], [Title]. "The record speaks for itself, and no amount of election-year spin can rewrite it."

The finding is part of a broader review of ${subject}'s record. Additional materials, documentation, and citations are available to press on request.

###

CONTACT: [Press Contact] · [email] · [phone]`,
    };
  },

  adConcept(subject, h, i) {
    const palettes = [
      { bg: '#272D25', fg: '#E8E2D4', accent: '#CC9758' },
      { bg: '#8C3A2B', fg: '#F7E4BA', accent: '#F2C686' },
      { bg: '#2E4939', fg: '#E8E2D4', accent: '#F2C686' },
      { bg: '#E8E2D4', fg: '#272D25', accent: '#B57E35' },
    ];
    const fmt = i % 2 === 0 ? 'square' : 'banner';
    return {
      format: fmt === 'square' ? 'Textable / social graphic (1080×1080)' : 'Digital static banner (970×250 / 300×250 set)',
      shape: fmt,
      audience: h.universes[0] || 'Broad',
      kicker: (h.category || 'The Record').toUpperCase(),
      headline: h.line.length > 90 ? h.line.slice(0, 87) + '…' : h.line,
      cta: 'SEE THE RECORD',
      palette: palettes[i % palettes.length],
      notes: `Target: ${h.universes.join(', ') || 'broad persuasion'}. Severity: ${h.severity}. Pair with landing page carrying full citation.`,
    };
  },

  /* ── UI ──────────────────────────────────────────────────────────────── */
  async renderPicker(preselect) {
    const projects = await Store.allProjects();
    const eligible = projects.filter(p => p.status !== 'failed');
    $('#view').innerHTML = `
      <div class="hera-hero">
        <h2>HERA — Messaging Campaign Studio</h2>
        <p>Select a completed or ongoing project and Hera will draft a full campaign: a phased channel timeline, sample emails, tweets, texts and posts, press releases for your hits, and ad concepts — all matched to the voter universes your research surfaced.</p>
      </div>
      ${eligible.length ? `
      <div class="card panel">
        <div class="row">
          <div class="grow">
            <label class="fld">Source Project</label>
            <select id="hera-proj">${eligible.map(p => `<option value="${p.id}" ${p.id === preselect ? 'selected' : ''}>${esc(p.name)} — ${esc(p.type)}</option>`).join('')}</select>
          </div>
          <div style="width:170px">
            <label class="fld">Campaign Length</label>
            <select id="hera-weeks"><option value="4">4 weeks</option><option value="6" selected>6 weeks</option><option value="8">8 weeks</option><option value="12">12 weeks</option></select>
          </div>
          <button class="btn gold" id="hera-gen">Generate Campaign</button>
        </div>
        <div class="row" style="margin-top:4px">
          <div class="grow">
            <label class="fld">Target / Subject Name (optional override)</label>
            <input type="text" id="hera-subject" placeholder="e.g. Jane Smith">
          </div>
          <div class="grow">
            <label class="fld">Disclaimer / Sponsor Line</label>
            <input type="text" id="hera-sponsor" placeholder="Paid for by [Committee Name]">
          </div>
        </div>
        <div class="status" id="hera-status"></div>
      </div>` : `
      <div class="empty card"><div class="glyph">◍</div>
        <p>No projects yet. Run a vote scrape, upload an oppo book, or launch a news scrape first —<br>then come back to Hera to turn the findings into a campaign.</p>
        <p style="margin-top:14px"><a class="btn" href="#/">Start a Project</a></p>
      </div>`}
      <div id="hera-out"></div>`;

    const btn = $('#hera-gen');
    if (btn) btn.onclick = () => {
      const id = $('#hera-proj').value;
      const meta = Store.getMeta(id) || eligible.find(p => p.id === id);
      const payload = Store.getPayload(id);
      try {
        const campaign = this.generate(meta, payload, {
          weeks: +$('#hera-weeks').value,
          subject: $('#hera-subject').value.trim(),
          sponsor: $('#hera-sponsor').value.trim() || 'Paid for by [Committee Name]',
        });
        this.state = { campaign, meta, tab: 'timeline' };
        // persist with project
        if (payload) { payload.hera = campaign; Store.saveProject(meta, payload); }
        this.renderCampaign();
      } catch (e) {
        if (meta && meta.origin === 'repo' && !payload) {
          // repo news project: load its JSON then retry
          setStatus('#hera-status', 'Loading project results…');
          News.fetchResults(id).then(data => {
            if (!data) return setStatus('#hera-status', 'Could not load results for this project yet.', 'err');
            const pl = { keywords: data.keywords || [] };
            Store.saveProject({ ...meta }, pl);
            btn.onclick();
          });
          return;
        }
        setStatus('#hera-status', e.message, 'err');
      }
    };
    if (preselect && btn) btn.onclick();
  },

  renderCampaign() {
    const c = this.state.campaign;
    $('#hera-out').innerHTML = `
      <div class="section-h"><h2>Campaign: ${esc(c.subject)}</h2>
        <span class="hint">${c.weeks}-week plan · ${c.hits.length} hits · ${c.universes.length} universes · from “${esc(c.sourceName)}”</span>
        <span class="spacer"></span>
        <button class="btn ghost sm" onclick="Hera.exportJSON()">Export JSON</button>
        <button class="btn ghost sm" onclick="window.print()">Print</button>
      </div>
      <div class="hera-tabs">
        ${[['timeline', 'Timeline'], ['email', 'Emails'], ['social', 'Social'], ['sms', 'Texts'], ['press', 'Press'], ['ads', 'Ad Concepts']].map(([id, name]) =>
          `<button class="${this.state.tab === id ? 'active' : ''}" onclick="Hera.state.tab='${id}';Hera.renderCampaign()">${name}</button>`).join('')}
      </div>
      <div id="hera-tabbody">${this.renderTab()}</div>`;
    $('#hera-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  renderTab() {
    const c = this.state.campaign;
    switch (this.state.tab) {
      case 'timeline': return this.tabTimeline(c);
      case 'email': return this.tabEmails(c);
      case 'social': return this.tabSocial(c);
      case 'sms': return this.tabSMS(c);
      case 'press': return this.tabPress(c);
      case 'ads': return this.tabAds(c);
    }
    return '';
  },

  tabTimeline(c) {
    const cols = `180px repeat(${c.weeks}, 1fr)`;
    let html = HERA_PHASES.map((p, i) => `<div class="notice" style="margin:6px 0"><b>${p.name}.</b> ${p.desc}</div>`).join('');
    html += `<div class="timeline" style="overflow-x:auto"><div class="tl-grid" style="grid-template-columns:${cols};min-width:${180 + c.weeks * 110}px">`;
    html += `<div class="tl-head">Channel</div>`;
    for (let w = 1; w <= c.weeks; w++) {
      const ph = c.timeline.find(t => t.week === w)?.phase ?? 0;
      html += `<div class="tl-head" style="border-left:1px solid rgba(232,226,212,.15)">Wk ${w} <span style="color:var(--gold)">· P${ph + 1}</span></div>`;
    }
    for (const ch of HERA_CHANNELS) {
      html += `<div class="tl-chan"><span>${ch.icon}</span> ${ch.name}</div>`;
      for (let w = 1; w <= c.weeks; w++) {
        const items = c.timeline.filter(t => t.channel === ch.id && t.week === w);
        html += `<div class="tl-cell">${items.map(t =>
          `<div class="tl-item ${t.phase === 2 ? 'gold' : ''}" onclick="Hera.showItem(${c.timeline.indexOf(t)})">${esc(t.label)}</div>`).join('')}</div>`;
      }
    }
    html += `</div></div>`;
    return html;
  },

  showItem(idx) {
    const t = this.state.campaign.timeline[idx];
    if (!t) return;
    showModal(`Week ${t.week} — ${esc(t.label)}`, `
      <p><b>Phase:</b> ${HERA_PHASES[t.phase].name}</p>
      <p style="margin-top:8px"><b>Featured hit:</b> ${esc(t.hit.line)}</p>
      <p style="margin-top:8px;color:var(--bark)">${esc(t.hit.detail || '')}</p>
      <p style="margin-top:8px"><b>Target universes:</b> ${t.hit.universes.map(u => `<span class="pill">${esc(u)}</span>`).join(' ') || '—'}</p>
      <p style="margin-top:14px"><button class="btn sm" onclick="closeModal();Hera.state.tab='${t.channel === 'social' ? 'social' : t.channel === 'ads' ? 'ads' : t.channel === 'press' ? 'press' : t.channel === 'sms' ? 'sms' : 'email'}';Hera.renderCampaign()">View sample content →</button></p>`);
  },

  tabEmails(c) {
    return `<div class="sample-grid">${c.emails.map(e => `
      <div class="card sample">
        <div class="s-head"><span>Email</span><span class="aud">→ ${esc(e.audience)}</span></div>
        <div class="s-body"><div class="subj">Subject: ${esc(e.subject_line)}</div><div style="color:var(--bark);font-size:12px;margin-bottom:10px">Preview: ${esc(e.preview)}…</div>${esc(e.body)}</div>
        <div class="s-foot"><button class="btn ghost sm" onclick="Hera.copy(this, ${JSON.stringify(e.subject_line + '\n\n' + e.body).replace(/"/g, '&quot;')})">Copy</button></div>
      </div>`).join('')}</div>`;
  },

  tabSocial(c) {
    return `
      <div class="section-h"><h2 style="font-size:16px">Sample Tweets / X Posts</h2></div>
      <div class="sample-grid">${c.tweets.map(t => `
        <div class="tweet">
          <div class="who"><div class="pfp">P</div><div><div class="nm">[Campaign Account]</div><div class="hd">@handle · targeting ${esc(t.audience)}</div></div></div>
          <div class="txt">${esc(t.text)}</div>
        </div>`).join('')}</div>
      <div class="section-h"><h2 style="font-size:16px">Long-form Posts</h2></div>
      <div class="sample-grid">${c.posts.map(p => `
        <div class="card sample">
          <div class="s-head"><span>${esc(p.platform)}</span><span class="aud">→ ${esc(p.audience)}</span></div>
          <div class="s-body">${esc(p.text)}</div>
        </div>`).join('')}</div>`;
  },

  tabSMS(c) {
    return `<div class="sample-grid">${c.sms.map(s => `
      <div class="phone">
        <div style="font-size:11px;color:var(--tan);margin-bottom:8px;text-transform:uppercase;letter-spacing:.1em">P2P Text → ${esc(s.audience)}</div>
        <div class="bubble">${esc(s.text)}</div>
      </div>`).join('')}</div>
      <div class="notice" style="margin-top:16px"><b>Compliance:</b> P2P texts require opt-out language and sponsor disclosure per state law — confirm disclaimer requirements for your jurisdiction before sending.</div>`;
  },

  tabPress(c) {
    return c.press.map(p => `
      <div class="presswrap" style="margin-bottom:22px">
        <div class="ltrhead"><span class="fir">FOR IMMEDIATE RELEASE</span><span class="fir" style="color:var(--amber)">[CAMPAIGN LOGO]</span></div>
        <h3>${esc(p.headline)}</h3>
        <div class="subhead">${esc(p.subhead)}</div>
        ${p.body.split('\n\n').map(par => `<p>${esc(par)}</p>`).join('')}
      </div>`).join('');
  },

  tabAds(c) {
    return `<div class="ad-grid">${c.ads.map(a => `
      <div class="ad-mock">
        <div class="ad-canvas ${a.shape === 'banner' ? 'banner' : ''}" style="background:${a.palette.bg};color:${a.palette.fg}">
          <div class="kicker" style="color:${a.palette.accent}">${esc(a.kicker)}</div>
          <div class="headline">${esc(a.headline)}</div>
          <div class="cta" style="background:${a.palette.accent};color:${a.palette.bg}">${esc(a.cta)}</div>
        </div>
        <div class="ad-meta"><b>${esc(a.format)}</b><br>${esc(a.notes)}</div>
      </div>`).join('')}</div>`;
  },

  copy(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied ✓';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
  },

  exportJSON() {
    const c = this.state.campaign;
    downloadFile((c.subject || 'campaign').replace(/[^\w-]+/g, '_') + '_hera_campaign.json', JSON.stringify(c, null, 2), 'application/json');
  },
};
