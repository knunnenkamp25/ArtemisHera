/* =========================================================================
   Hera — messaging campaign generator
   Stance-aware: a project marked Supporting produces a promote/inoculate
   campaign (tout the record, defend the flanks); Opposing produces the
   hit-driven contrast campaign. Templates, timeline arcs, universe logic and
   ad concepts all branch on stance. Everything is editable groundwork for a
   strategist, not final copy.
   ========================================================================= */

const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

const Hera = {
  state: { campaign: null, meta: null, tab: 'timeline' },

  /* ── Derive message-ready findings from any project type ─────────────── */
  // For oppose: hits = attacks. For support: vote records become
  // accomplishments; oppo attacks become vulnerabilities to inoculate.
  deriveHits(meta, payload, stance) {
    const hits = [];
    if (!payload) return hits;
    const name = payload.member?.name || meta.subject || 'The candidate';

    if (meta.type === 'oppo-book' && payload.attacks) {
      const rank = { Major: 0, Moderate: 1, Minor: 2, Niche: 3 };
      [...payload.attacks].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 12).forEach(a => hits.push({
        kind: stance === 'support' ? 'vulnerability' : 'attack',
        line: a.attack, detail: a.key_detail, severity: a.severity,
        universes: [a.best_universe, a.secondary_universe, a.tertiary_universe].filter(Boolean),
        category: a.category,
      }));
    }

    if ((meta.type === 'federal-votes' || meta.type === 'state-votes') && payload.topics) {
      payload.topics.slice(0, 10).forEach(t => {
        const yesLeaning = t.yes >= t.no;
        if (stance === 'support') {
          hits.push({
            kind: 'record',
            line: `${name} ${yesLeaning ? 'delivered' : 'held the line'} on ${t.model}: ${yesLeaning ? t.yes : t.no} of ${t.total} votes`,
            detail: `Across the loaded record: ${t.yes} Yes / ${t.no} No / ${t.other} other on votes matching: ${t.matchedKeywords.slice(0, 6).join(', ')}.`,
            severity: t.total >= 15 ? 'Major' : t.total >= 6 ? 'Moderate' : 'Minor',
            universes: [t.model], category: 'Voting Record',
          });
        } else {
          const lean = t.no > t.yes ? 'voted NO' : 'voted YES';
          hits.push({
            kind: 'attack',
            line: `${name} ${lean} on ${Math.max(t.yes, t.no)} of ${t.total} votes touching ${t.model}`,
            detail: `Across the loaded record: ${t.yes} Yes / ${t.no} No / ${t.other} other on votes matching keywords: ${t.matchedKeywords.slice(0, 6).join(', ')}.`,
            severity: t.total >= 15 ? 'Major' : t.total >= 6 ? 'Moderate' : 'Minor',
            universes: [t.model], category: 'Voting Record',
          });
        }
      });
    }

    if (meta.type === 'documents' && payload.keywords) {
      payload.keywords.filter(k => k.universe_match).slice(0, 8).forEach(k => hits.push({
        kind: 'theme',
        line: `"${k.word}" is a live theme (${k.count} mentions) for the ${k.universe_match} universe`,
        detail: `Keyword "${k.word}" surfaced ${k.count} times in ${meta.name}. Strongest audience: ${k.universe_match}.`,
        severity: k.count >= 10 ? 'Moderate' : 'Minor',
        universes: [k.universe_match], category: 'Document Intelligence',
      }));
    }

    if ((meta.type === 'news-scrape' || meta.type === 'web-scrape') && payload.keywords) {
      payload.keywords.filter(k => k.universe_match).slice(0, 8).forEach(k => hits.push({
        kind: 'theme',
        line: `News cycle: "${k.word}" is trending (${k.count} mentions) with the ${k.universe_match} universe`,
        detail: `Coverage scan found ${k.count} mentions of "${k.word}" across tracked sources. ${'Ride or counter the cycle with ' + k.universe_match}.`,
        severity: k.count >= 15 ? 'Moderate' : 'Minor',
        universes: [k.universe_match], category: 'Earned Media',
      }));
    }
    return hits;
  },

  /* ── Campaign generation ─────────────────────────────────────────────── */
  generate(meta, payload, opts) {
    const stance = opts.stance || meta.stance || 'oppose';
    const subject = opts.subject || meta.subject || meta.name;
    const sponsor = opts.sponsor || 'Paid for by [Committee Name]';
    const weeks = Math.min(12, Math.max(2, opts.weeks || 6));
    const hits = this.deriveHits(meta, payload, stance);
    if (!hits.length) throw new Error('This project has no message-ready findings yet.');

    const phases = stance === 'support' ? HERA_PHASES_SUPPORT : HERA_PHASES_OPPOSE;
    const phaseOf = w => { const t = w / weeks; return t < 0.34 ? 0 : t < 0.75 ? 1 : 2; };
    const topHits = hits.slice(0, 6);
    const allU = [...new Set(hits.flatMap(h => h.universes))];

    const timeline = [];
    for (let w = 1; w <= weeks; w++) {
      const ph = phaseOf(w);
      const hit = hits[(w - 1) % hits.length];
      const alt = hits[w % hits.length];
      const labels = stance === 'support'
        ? {
            email: ph === 0 ? 'Introduce the record' : ph === 1 ? 'Accomplishment spotlight' : 'Closing argument + GOTV email',
            social: ph === 0 ? 'Bio + record thread' : 'Record rotation (3 posts)',
            ads: ph === 0 ? 'Positive ID flight' : ph === 1 ? 'Record-proof flight' : 'GOTV closing flight',
            sms: ph === 2 ? 'GOTV text blast' : 'Record-proof text',
            press: 'Accomplishment release / local pitch',
          }
        : {
            email: ph === 0 ? 'Intro narrative email' : ph === 1 ? 'Issue hit email' : 'Contrast + GOTV email',
            social: ph === 0 ? 'Framing thread + graphic' : 'Hit rotation (3 posts)',
            ads: ph === 0 ? 'Awareness flight' : ph === 1 ? 'Universe-targeted flight' : 'High-frequency closing flight',
            sms: ph === 2 ? 'GOTV text blast' : 'Persuasion text',
            press: 'Press release / pitch',
          };
      timeline.push(
        { week: w, phase: ph, channel: 'email', label: labels.email, hit },
        { week: w, phase: ph, channel: 'social', label: labels.social, hit: alt },
        { week: w, phase: ph, channel: 'ads', label: labels.ads, hit },
      );
      if (w % 2 === 0) timeline.push({ week: w, phase: ph, channel: 'sms', label: labels.sms, hit: alt });
      if (ph !== 0 && w % 2 === 1) timeline.push({ week: w, phase: ph, channel: 'press', label: labels.press, hit });
    }

    return {
      stance, subject, sponsor, weeks, generated: new Date().toISOString(),
      sourceProject: meta.id, sourceName: meta.name, universes: allU, hits, phases,
      timeline,
      emails: topHits.slice(0, 3).map((h, i) => this.emailTemplate(stance, subject, h, i, sponsor)),
      tweets: topHits.slice(0, 4).map((h, i) => this.tweetTemplate(stance, subject, h, i)),
      sms: topHits.slice(0, 3).map((h, i) => this.smsTemplate(stance, subject, h, i)),
      posts: topHits.slice(0, 2).map((h, i) => this.postTemplate(stance, subject, h, i)),
      press: topHits.slice(0, 2).map((h, i) => this.pressTemplate(stance, subject, h, i)),
      ads: this.buildAds(stance, subject, topHits),
    };
  },

  /* ── Copy templates ──────────────────────────────────────────────────── */
  emailTemplate(stance, subject, h, i, sponsor) {
    if (stance === 'support') {
      const subj = [
        `${subject} delivered — here's the proof`,
        `The record ${subject}'s critics hope you never read`,
        `What ${subject} just got done for you`,
      ][i] || `${subject}'s record`;
      const inoculate = h.kind === 'vulnerability';
      return {
        audience: h.universes[0] || 'Base + persuasion',
        subject_line: inoculate ? `The truth about the attacks on ${subject}` : subj,
        preview: h.line.slice(0, 90),
        body: inoculate
          ? `Friend,\n\nYou may hear our opponents claim: "${h.line}."\n\nHere's the full story they leave out:\n\n${h.detail}\n\nWhen they can't beat the record, they distort it. Help us set the record straight — forward this to a neighbor who deserves the facts.\n\n[ READ THE FULL RECORD ] [ CHIP IN ]\n\nThank you,\n[Campaign Signer]\n\n${sponsor}`
          : `Friend,\n\n${h.line}.\n\n${h.detail}\n\nThat's not talk — that's a record. While others posture, ${subject} delivers, and this community is better for it.\n\nHelp us make sure every voter knows what's been accomplished — and what's at stake.\n\n[ CONTRIBUTE ] [ SHARE THE RECORD ]\n\nThank you,\n[Campaign Signer]\n\n${sponsor}`,
      };
    }
    const subj = [
      `The truth about ${subject}`,
      `${subject} thinks you won't notice`,
      `This is what ${subject} doesn't want you to see`,
    ][i] || `About ${subject}`;
    return {
      audience: h.universes[0] || 'Persuasion universe',
      subject_line: subj,
      preview: h.line.slice(0, 90),
      body: `Friend,\n\n${h.line}.\n\n${h.detail}\n\nThat's not what our community deserves — and it's not something ${subject} can spin away. The record is the record.\n\nWe're making sure every voter knows before they cast a ballot. Can you chip in to help us reach them?\n\n[ CONTRIBUTE ] [ SHARE THE FACTS ]\n\nThank you,\n[Campaign Signer]\n\n${sponsor}`,
    };
  },

  tweetTemplate(stance, subject, h, i) {
    let txt;
    if (stance === 'support') {
      const open = ['✅ DELIVERED:', 'Promises made, promises kept:', 'The record speaks:', 'While they talk, we deliver:'][i] || 'DELIVERED:';
      txt = h.kind === 'vulnerability'
        ? `They're attacking ${subject} because they can't beat the record. The facts: ${h.detail.slice(0, 160)}`
        : `${open} ${h.line}.`;
    } else {
      const open = ['🚨 FACT:', 'The record doesn\'t lie:', 'While you weren\'t looking —', 'Remember this in November:'][i] || 'FACT:';
      txt = `${open} ${h.line}.`;
    }
    if (txt.length < 200 && h.universes[0]) txt += `\n\n${'#' + h.universes[0].replace(/[^A-Za-z0-9]/g, '')}`;
    return { audience: h.universes[0] || 'Broad', text: txt.slice(0, 275) };
  },

  smsTemplate(stance, subject, h, i) {
    const body = stance === 'support'
      ? `${subject} delivered: ${h.line.slice(0, 100)}. See the record: [link]`
      : `${h.line.slice(0, 120)}. Voters deserve the truth about ${subject}. See the record: [link]`;
    return { audience: h.universes[0] || 'Persuasion', text: `${body}  Reply STOP to opt out` };
  },

  postTemplate(stance, subject, h, i) {
    const text = stance === 'support'
      ? `${h.line}.\n\n${h.detail}\n\nThis is what showing up for our community looks like. Share it so every neighbor knows the record. ➡️`
      : `${h.line}.\n\n${h.detail}\n\nOur neighbors deserve better. Share this so every voter sees the record before Election Day. ➡️`;
    return { audience: h.universes[0] || 'Broad', platform: i === 0 ? 'Facebook' : 'Instagram', text };
  },

  pressTemplate(stance, subject, h, i) {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (stance === 'support') {
      return {
        headline: `${subject.toUpperCase()} DELIVERS: ${h.line}`,
        subhead: `A record of results for the communities that count on it`,
        body: `FOR IMMEDIATE RELEASE — ${today}\n\n[CITY, STATE] — ${h.line}, a review of the public record shows.\n\n${h.detail}\n\n"This is what voters actually want from public service — results, not rhetoric," said [Spokesperson Name], [Title]. "${subject} delivered, and there's more work to do."\n\nAdditional record documentation and local validators are available to press on request.\n\n###\n\nCONTACT: [Press Contact] · [email] · [phone]`,
      };
    }
    return {
      headline: `NEW: ${h.line}`,
      subhead: `Records reveal what ${subject} hoped voters would never find`,
      body: `FOR IMMEDIATE RELEASE — ${today}\n\n[CITY, STATE] — ${h.line}, according to a review of public records released today.\n\n${h.detail}\n\n"Voters deserve to know exactly who ${subject} works for — and it isn't them," said [Spokesperson Name], [Title]. "The record speaks for itself, and no amount of election-year spin can rewrite it."\n\nThe finding is part of a broader review of ${subject}'s record. Additional materials, documentation, and citations are available to press on request.\n\n###\n\nCONTACT: [Press Contact] · [email] · [phone]`,
    };
  },

  /* ── Ad concepts: platform-true mockups + contrast/quote layouts ─────── */
  buildAds(stance, subject, hits) {
    const pal = stance === 'support'
      ? [
          { bg: '#2E4939', fg: '#E8E2D4', accent: '#F2C686', bar: '#CC9758' },
          { bg: '#E8E2D4', fg: '#272D25', accent: '#B57E35', bar: '#2E4939' },
          { bg: '#272D25', fg: '#E8E2D4', accent: '#8BAF98', bar: '#CC9758' },
        ]
      : [
          { bg: '#272D25', fg: '#E8E2D4', accent: '#CC9758', bar: '#8C3A2B' },
          { bg: '#8C3A2B', fg: '#F7E4BA', accent: '#F2C686', bar: '#272D25' },
          { bg: '#E8E2D4', fg: '#272D25', accent: '#8C3A2B', bar: '#8C3A2B' },
        ];
    const ads = [];
    hits.slice(0, 4).forEach((h, i) => {
      const p = pal[i % pal.length];
      const cite = (h.detail || '').slice(0, 110) + ((h.detail || '').length > 110 ? '…' : '');
      if (i % 2 === 0) {
        // Contrast / quote square for social
        ads.push({
          format: 'square', platform: 'facebook', w: 1080, h: 1080,
          layout: stance === 'support' ? 'quote' : 'contrast',
          kicker: stance === 'support' ? 'THE RECORD' : (h.category || 'THE RECORD').toUpperCase(),
          headline: h.line.length > 110 ? h.line.slice(0, 107) + '…' : h.line,
          topLabel: stance === 'support' ? 'PROMISES MADE' : 'WHAT THEY SAY',
          topText: stance === 'support' ? 'Results for our community' : `${subject} works for you`,
          bottomLabel: stance === 'support' ? 'PROMISES KEPT' : 'WHAT THEY DID',
          bottomText: h.line,
          cite, palette: p,
          cta: stance === 'support' ? 'SEE THE RESULTS' : 'SEE THE RECORD',
          audience: h.universes[0] || 'Broad',
          notes: `1080×1080 social square · target: ${h.universes.join(', ') || 'broad'} · severity ${h.severity}`,
        });
      } else {
        // Leaderboard banner
        ads.push({
          format: 'banner', platform: 'display', w: 970, h: 250,
          layout: 'banner',
          kicker: stance === 'support' ? 'PROVEN RESULTS' : (h.category || 'THE RECORD').toUpperCase(),
          headline: h.line.length > 90 ? h.line.slice(0, 87) + '…' : h.line,
          cite, palette: p,
          cta: stance === 'support' ? 'STAND WITH US' : 'GET THE FACTS',
          audience: h.universes[0] || 'Broad',
          notes: `970×250 leaderboard (resize set: 300×250, 728×90) · target: ${h.universes.join(', ') || 'broad'}`,
        });
      }
    });
    // One X/Twitter promoted-post concept off the top hit
    const h0 = hits[0];
    if (h0) ads.push({
      format: 'xpost', platform: 'x', w: 1200, h: 675,
      layout: stance === 'support' ? 'quote' : 'contrast',
      kicker: stance === 'support' ? 'DELIVERED' : 'ON THE RECORD',
      headline: h0.line.length > 110 ? h0.line.slice(0, 107) + '…' : h0.line,
      topLabel: stance === 'support' ? 'PROMISES MADE' : 'WHAT THEY SAY',
      topText: stance === 'support' ? 'Results for our community' : `${subject} works for you`,
      bottomLabel: stance === 'support' ? 'PROMISES KEPT' : 'WHAT THEY DID',
      bottomText: h0.line,
      cite: (h0.detail || '').slice(0, 110),
      palette: pal[0],
      cta: stance === 'support' ? 'SEE THE RESULTS' : 'SEE THE RECORD',
      audience: h0.universes[0] || 'Broad',
      tweetText: this.tweetTemplate(stance, subject, h0, 0).text,
      notes: `1200×675 promoted-post creative · target: ${h0.universes.join(', ') || 'broad'}`,
    });
    return ads;
  },

  // The creative itself (no platform chrome) — this node is what exports to PNG
  adCanvas(a, id) {
    const p = a.palette;
    const isBanner = a.format === 'banner';
    const ratio = a.h / a.w;
    let inner;
    if (a.layout === 'contrast') {
      inner = `
        <div class="adx-half" style="background:rgba(0,0,0,.18)">
          <div class="adx-lbl" style="color:${p.accent}">${esc(a.topLabel)}</div>
          <div class="adx-line" style="text-decoration:line-through;opacity:.75">${esc(a.topText)}</div>
        </div>
        <div class="adx-half">
          <div class="adx-lbl" style="color:${p.accent}">${esc(a.bottomLabel)}</div>
          <div class="adx-line adx-big">${esc(a.bottomText)}</div>
        </div>
        <div class="adx-foot" style="background:${p.bar};color:#fff">
          <span>${esc(a.cite)}</span><span class="adx-cta" style="color:${p.bg};background:${p.accent}">${esc(a.cta)}</span>
        </div>`;
    } else if (a.layout === 'quote') {
      inner = `
        <div class="adx-quotewrap">
          <div class="adx-kicker" style="color:${p.accent}">${esc(a.kicker)}</div>
          <div class="adx-qmark" style="color:${p.accent}">“</div>
          <div class="adx-line adx-big">${esc(a.headline)}</div>
          <div class="adx-cite" style="border-color:${p.accent}">${esc(a.cite)}</div>
        </div>
        <div class="adx-foot" style="background:${p.bar};color:#fff">
          <span class="adx-sun" style="color:${p.accent}">◉</span><span class="adx-cta" style="color:${p.bg};background:${p.accent}">${esc(a.cta)}</span>
        </div>`;
    } else {
      inner = `
        <div class="adx-bannerwrap">
          <div>
            <div class="adx-kicker" style="color:${p.accent}">${esc(a.kicker)}</div>
            <div class="adx-line" style="font-size:20px">${esc(a.headline)}</div>
          </div>
          <span class="adx-cta" style="color:${p.bg};background:${p.accent}">${esc(a.cta)}</span>
        </div>`;
    }
    return `<div class="adx-canvas ${isBanner ? 'banner' : ''}" id="${id}"
      style="background:${p.bg};color:${p.fg};aspect-ratio:${a.w}/${a.h}"
      data-w="${a.w}" data-h="${a.h}">${inner}</div>`;
  },

  // Platform chrome wrappers
  adMock(a, idx) {
    const canvasId = `adx-${idx}`;
    const canvas = this.adCanvas(a, canvasId);
    const c = this.state.campaign;
    let body;
    if (a.platform === 'facebook') {
      body = `
        <div class="fbpost">
          <div class="fb-head">
            <span class="fb-pfp">◉</span>
            <span><b>[Campaign Page]</b><br><span class="fb-sub">Sponsored · <span style="letter-spacing:1px">⚙</span></span></span>
          </div>
          <div class="fb-copy">${esc((c.posts[0]?.text || a.headline).split('\n')[0])}</div>
          ${canvas}
          <div class="fb-bar"><span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span></div>
        </div>`;
    } else if (a.platform === 'x') {
      body = `
        <div class="xpost">
          <div class="x-head"><span class="fb-pfp" style="background:#272D25">◉</span>
            <span><b>[Campaign Account]</b> <span class="fb-sub">@handle · Promoted</span></span></div>
          <div class="x-copy">${esc(a.tweetText || a.headline)}</div>
          ${canvas}
        </div>`;
    } else {
      body = `<div style="padding:10px 12px">${canvas}</div>`;
    }
    return `
      <div class="ad-mock">
        ${body}
        <div class="ad-meta">
          <b>${esc(a.notes)}</b><br>Audience: ${esc(a.audience)}
          <div style="margin-top:8px"><button class="btn ghost sm" onclick="Hera.exportPNG('${canvasId}', ${a.w}, ${a.h}, '${esc(a.platform)}_${a.w}x${a.h}')">⬇ PNG at ${a.w}×${a.h}</button></div>
        </div>
      </div>`;
  },

  async exportPNG(canvasId, w, h, name) {
    await loadScript(HTML2CANVAS_URL);
    const el = document.getElementById(canvasId);
    if (!el) return;
    const scale = w / el.offsetWidth;
    const canvas = await window.html2canvas(el, { scale, backgroundColor: null, logging: false });
    const a = document.createElement('a');
    a.download = `${(this.state.campaign?.subject || 'ad').replace(/[^\w-]+/g, '_')}_${name}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  },

  /* ── UI ──────────────────────────────────────────────────────────────── */
  async renderPicker(preselect) {
    const projects = await Store.allProjects();
    const eligible = projects.filter(p => p.status !== 'failed');
    $('#view').innerHTML = `
      <div class="hera-hero">
        <h2>HERA — Messaging Campaign Studio</h2>
        <p>Select a project and Hera drafts the full campaign: a phased channel timeline, sample emails, tweets, texts and posts, press releases, and platform-ready ad concepts — matched to the voter universes the research surfaced, and voiced for whether you're promoting your candidate or prosecuting the case against theirs.</p>
      </div>
      ${eligible.length ? `
      <div class="card panel">
        <div class="row">
          <div class="grow">
            <label class="fld">Source Project</label>
            <select id="hera-proj">${eligible.map(p => `<option value="${p.id}" ${p.id === preselect ? 'selected' : ''}>${esc(p.name)} — ${esc(p.type)}${p.stance ? ' · ' + (p.stance === 'support' ? '▲' : '▼') : ''}</option>`).join('')}</select>
          </div>
          <div style="width:180px">
            <label class="fld">Stance</label>
            <select id="hera-stance">
              <option value="">Use project stance</option>
              <option value="support">▲ Supporting</option>
              <option value="oppose">▼ Opposing</option>
            </select>
          </div>
          <div style="width:150px">
            <label class="fld">Length</label>
            <select id="hera-weeks"><option value="4">4 weeks</option><option value="6" selected>6 weeks</option><option value="8">8 weeks</option><option value="12">12 weeks</option></select>
          </div>
          <button class="btn gold" id="hera-gen">Generate Campaign</button>
        </div>
        <div class="row" style="margin-top:4px">
          <div class="grow">
            <label class="fld">Subject Name (optional override)</label>
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
          stance: $('#hera-stance').value || meta.stance || 'oppose',
          subject: $('#hera-subject').value.trim(),
          sponsor: $('#hera-sponsor').value.trim() || 'Paid for by [Committee Name]',
        });
        this.state = { campaign, meta, tab: 'timeline' };
        if (payload) { payload.hera = campaign; Store.saveProject(meta, payload); }
        this.renderCampaign();
      } catch (e) {
        if (meta && meta.origin === 'repo' && !payload) {
          setStatus('#hera-status', 'Loading project results…');
          News.fetchResults(id).then(data => {
            if (!data) return setStatus('#hera-status', 'Could not load results for this project yet.', 'err');
            Store.saveProject({ ...meta }, { keywords: data.keywords || [] });
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
        <span class="stance-tag ${c.stance}">${c.stance === 'support' ? '▲ Supporting' : '▼ Opposing'}</span>
        <span class="hint">${c.weeks}-week plan · ${c.hits.length} ${c.stance === 'support' ? 'proof points' : 'hits'} · ${c.universes.length} universes · from “${esc(c.sourceName)}”</span>
        <span class="spacer"></span>
        <button class="btn ghost sm" onclick="Hera.exportJSON()">Export JSON</button>
        <button class="btn ghost sm" onclick="window.print()">Print</button>
      </div>
      <div class="hera-tabs">
        ${[['timeline', 'Timeline'], ['email', 'Emails'], ['social', 'Social'], ['sms', 'Texts'], ['press', 'Press'], ['ads', 'Ad Concepts']].map(([id, name]) =>
          `<button class="${this.state.tab === id ? 'active' : ''}" onclick="Hera.state.tab='${id}';Hera.renderCampaign()">${name}</button>`).join('')}
      </div>
      <div id="hera-tabbody">${this.renderTab()}</div>`;
    // Delegated copy: the payload rides in a data attribute (HTML-escaped by
    // esc and decoded by the parser) rather than through a JS-string onclick,
    // which cannot be safely escaped with esc alone.
    $('#hera-out').addEventListener('click', e => {
      const b = e.target.closest('[data-copy]');
      if (b) this.copy(b, b.dataset.copy);
    });
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
    let html = c.phases.map(p => `<div class="notice" style="margin:6px 0"><b>${p.name}.</b> ${p.desc}</div>`).join('');
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
    const c = this.state.campaign;
    const t = c.timeline[idx];
    if (!t) return;
    showModal(`Week ${t.week} — ${esc(t.label)}`, `
      <p><b>Phase:</b> ${c.phases[t.phase].name}</p>
      <p style="margin-top:8px"><b>Featured ${c.stance === 'support' ? 'proof point' : 'hit'}:</b> ${esc(t.hit.line)}</p>
      <p style="margin-top:8px;color:var(--bark)">${esc(t.hit.detail || '')}</p>
      <p style="margin-top:8px"><b>Target universes:</b> ${t.hit.universes.map(u => `<span class="pill">${esc(u)}</span>`).join(' ') || '—'}</p>
      <p style="margin-top:14px"><button class="btn sm" onclick="closeModal();Hera.state.tab='${t.channel === 'social' ? 'social' : t.channel === 'ads' ? 'ads' : t.channel === 'press' ? 'press' : t.channel === 'sms' ? 'sms' : 'email'}';Hera.renderCampaign()">View sample content →</button></p>`);
  },

  tabEmails(c) {
    return `<div class="sample-grid">${c.emails.map(e => `
      <div class="card sample">
        <div class="s-head"><span>Email</span><span class="aud">→ ${esc(e.audience)}</span></div>
        <div class="s-body"><div class="subj">Subject: ${esc(e.subject_line)}</div><div style="color:var(--bark);font-size:12px;margin-bottom:10px">Preview: ${esc(e.preview)}…</div>${esc(e.body)}</div>
        <div class="s-foot"><button class="btn ghost sm" data-copy="${esc(e.subject_line + '\n\n' + e.body)}">Copy</button></div>
      </div>`).join('')}</div>`;
  },

  tabSocial(c) {
    return `
      <div class="section-h"><h2 style="font-size:16px">Sample Tweets / X Posts</h2></div>
      <div class="sample-grid">${c.tweets.map(t => `
        <div class="tweet">
          <div class="who"><div class="pfp">◉</div><div><div class="nm">[Campaign Account]</div><div class="hd">@handle · targeting ${esc(t.audience)}</div></div></div>
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
    return `
      <div class="notice" style="margin-top:0">Concepts render in platform context; the <b>⬇ PNG</b> button exports just the creative at true ad dimensions, ready to hand a designer or run as a comp.</div>
      <div class="ad-grid">${c.ads.map((a, i) => this.adMock(a, i)).join('')}</div>`;
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

// Phase arcs by stance
const HERA_PHASES_OPPOSE = [
  { id: 'define', name: 'Phase 1 — Define', desc: 'Introduce the narrative frame and soften the target with the broadest, highest-severity hits.' },
  { id: 'drive', name: 'Phase 2 — Drive', desc: 'Sustained multi-channel pressure. Rotate issue-specific hits against their matched universes.' },
  { id: 'close', name: 'Phase 3 — Close', desc: 'Sharpen to the two strongest contrasts. High frequency, GOTV integration, persuasion-to-mobilization handoff.' },
];
const HERA_PHASES_SUPPORT = [
  { id: 'introduce', name: 'Phase 1 — Introduce', desc: 'Define the candidate on your terms: biography, values, and the record frame — before the other side defines them.' },
  { id: 'prove', name: 'Phase 2 — Prove', desc: 'Accomplishment rotation. Each proof point runs against the universes it moves; inoculate known vulnerabilities in parallel.' },
  { id: 'mobilize', name: 'Phase 3 — Mobilize', desc: 'Closing argument and turnout. Convert persuasion into commitment; GOTV integration across every channel.' },
];
