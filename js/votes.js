/* =========================================================================
   ArtemisHera — vote pipelines (federal via Voteview, state via pre-scraped
   LegiScan JSON in the congress-votes repo)
   ========================================================================= */

const Votes = {
  allMembers: [],          // federal member index (with icpsrs[])
  stateSessions: null,     // sessions.json
  stateMembers: [],

  // ── Federal member directory ───────────────────────────────────────────
  // Served from the repo (data/federal/members.json), rebuilt monthly by the
  // federal-votes workflow. Voteview sends no CORS headers, so fetching the
  // 6 MB source CSV in the browser only works through flaky proxies.
  async loadMembers(onStatus) {
    if (this.allMembers.length) return this.allMembers;
    onStatus && onStatus('Loading member directory…');
    const resp = await fetch('data/federal/members.json');
    if (!resp.ok) throw new Error('Member directory is missing from the deployment (data/federal/members.json).');
    this.allMembers = await resp.json();
    return this.allMembers;
  },

  searchMembers(q) {
    q = q.toLowerCase().trim();
    if (q.length < 2) return [];
    return this.allMembers
      .filter(m => m.name.toLowerCase().includes(q) || m.state.toLowerCase() === q)
      .sort((a, b) => b.maxCongress - a.maxCongress)
      .slice(0, 40);
  },

  // ── Federal vote loading pipeline ──────────────────────────────────────
  async loadFederalVotes(member, opts, onStatus) {
    const { chamber = 'both', congressFrom, congressTo } = opts || {};
    const icpsrSet = new Set(member.icpsrs || []);
    const needed = [];
    for (let c = congressFrom; c <= congressTo; c++) {
      for (const ch of ['House', 'Senate']) {
        if (chamber !== 'both' && ch !== chamber) continue;
        if (!member.chambers.includes(ch) && !member.chambers.includes('President')) continue;
        needed.push({ congress: c, chamber: ch });
      }
    }
    if (!needed.length) throw new Error('No matching chamber/congress selections for this member.');

    const voteRecords = [];
    let done = 0, failures = 0;
    for (const n of needed) {
      const prefix = n.chamber === 'House' ? 'H' : 'S';
      onStatus && onStatus(`Loading ${n.chamber} votes, Congress ${n.congress} (${done + 1}/${needed.length})…`, done / needed.length);
      let loaded = false;
      for (const base of CONFIG.VOTEVIEW_URLS) {
        try {
          const [vResp, rResp] = await Promise.all([
            smartFetch(`${base}/votes/${prefix}${n.congress}_votes.csv`),
            smartFetch(`${base}/rollcalls/${prefix}${n.congress}_rollcalls.csv`),
          ]);
          const votes = parseCSV(await vResp.text());
          const rolls = parseCSV(await rResp.text());
          const rcMap = new Map(rolls.map(r => [r.rollnumber, r]));
          for (const v of votes) {
            if (!icpsrSet.has(v.icpsr)) continue;
            const rc = rcMap.get(v.rollnumber) || {};
            const desc = rc.vote_desc || rc.dtl_desc || rc.vote_question || '';
            voteRecords.push({
              date: rc.date || '',
              congress: n.congress,
              chamber: n.chamber,
              bill_number: rc.bill_number || '',
              description: desc,
              question: rc.vote_question || '',
              result: rc.vote_result || '',
              member_vote: CAST_CODES[+v.cast_code] || 'Unknown',
              keywords: extractKeywords((rc.bill_number || '') + ' ' + desc),
            });
          }
          loaded = true;
          break;
        } catch (e) { /* try next base */ }
      }
      if (!loaded) { failures++; console.warn(`Skipped ${prefix}${n.congress} — both Voteview domains failed`); }
      done++;
    }
    if (failures === needed.length) {
      const err = new Error('Voteview is unreachable from the browser (no CORS headers, and every proxy failed).');
      err.code = 'PROXY_FAILED';
      throw err;
    }
    voteRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    voteRecords.partial = failures > 0;
    return voteRecords;
  },

  // Cloud fallback: GitHub Actions fetches the vote files server-side
  async dispatchCloudVotes(member, opts) {
    const projectId = 'fed-' + uid();
    const resp = await GH.api(
      `/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows/${CONFIG.GH_VOTES_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            project_id: projectId,
            bioguide: member.bioguide_id,
            member_name: member.name,
            congress_from: String(opts.congressFrom),
            congress_to: String(opts.congressTo),
            chamber: opts.chamber,
          },
        }),
      });
    if (resp.status !== 204) throw new Error('Dispatch failed (' + resp.status + '): ' + (await resp.text()).slice(0, 200));
    Store.saveProject({
      id: projectId, name: `${member.name} — Federal Votes`, type: 'federal-votes',
      status: 'running', subject: member.name,
      summary: `Cloud run · Congress ${opts.congressFrom}–${opts.congressTo}`,
    });
    return projectId;
  },

  async fetchCloudVotes(projectId) {
    for (const p of [`data/federal/${projectId}.json?t=${Date.now()}`,
                     `https://raw.githubusercontent.com/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/main/data/federal/${projectId}.json?t=${Date.now()}`]) {
      try {
        const r = await fetch(p);
        if (r.ok) return await r.json();
      } catch (e) { /* next */ }
    }
    return null;
  },

  // ── State pipeline ─────────────────────────────────────────────────────
  async loadStateSessions() {
    if (this.stateSessions) return this.stateSessions;
    const resp = await smartFetch(`${CONFIG.STATE_DATA_BASE}/sessions.json`);
    this.stateSessions = await resp.json();
    return this.stateSessions;
  },

  async loadStateMembers(state, session) {
    const resp = await smartFetch(`${CONFIG.STATE_DATA_BASE}/${state}/${session}/people.json`);
    this.stateMembers = await resp.json();
    return this.stateMembers;
  },

  async loadStateVotes(state, session, person) {
    const resp = await smartFetch(`${CONFIG.STATE_DATA_BASE}/${state}/${session}/${person.people_id}.json`);
    const raw = await resp.json();
    const votes = Array.isArray(raw) ? raw : (raw.votes || []);
    return votes.map(v => ({
      date: v.date || '',
      congress: session,
      chamber: v.chamber || '',
      bill_number: v.bill_number || '',
      description: v.bill_title || '',
      question: v.vote_question || '',
      result: v.vote_result || '',
      member_vote: v.member_vote || '',
      keywords: typeof v.keywords === 'string'
        ? v.keywords.split(';').map(k => k.trim()).filter(Boolean)
        : (v.keywords || extractKeywords((v.bill_number || '') + ' ' + (v.bill_title || ''))),
    })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  // ── Analysis: OTS topic matching + keyword aggregation ─────────────────
  matchVotesToTopics(voteRecords, models) {
    const results = [];
    for (const model of models) {
      const patterns = TOPIC_KEYWORDS[model] || [];
      if (!patterns.length) continue;
      let yes = 0, no = 0, other = 0;
      const matchedKeywords = new Set();
      for (const v of voteRecords) {
        const hay = ((v.description || '') + ' ' + (v.keywords || []).join(' ')).toLowerCase();
        const hit = patterns.find(p => hay.includes(p));
        if (!hit) continue;
        matchedKeywords.add(hit);
        if (v.member_vote === 'Yes') yes++;
        else if (v.member_vote === 'No') no++;
        else other++;
      }
      const total = yes + no + other;
      if (total > 0) results.push({ model, total, yes, no, other, matchedKeywords: [...matchedKeywords] });
    }
    results.sort((a, b) => b.total - a.total);
    return results;
  },

  analyzeKeywords(voteRecords, models) {
    const agg = new Map();
    for (const v of voteRecords) {
      for (const kw of (v.keywords || [])) {
        let a = agg.get(kw);
        if (!a) { a = { keyword: kw, total: 0, yes: 0, no: 0, other: 0 }; agg.set(kw, a); }
        a.total++;
        if (v.member_vote === 'Yes') a.yes++;
        else if (v.member_vote === 'No') a.no++;
        else a.other++;
      }
    }
    const results = [...agg.values()].filter(a => a.total >= 2);
    for (const a of results) {
      a.percentage = a.total ? Math.round((a.yes / a.total) * 100) : 0;
      a.tieredModels = [];
      for (const model of models) {
        const tier = scoreModelMatch(a.keyword, model);
        if (tier) a.tieredModels.push({ model, tier });
      }
      const rank = { primary: 0, secondary: 1, tertiary: 2 };
      a.tieredModels.sort((x, y) => rank[x.tier] - rank[y.tier]);
      a.tieredModels = a.tieredModels.slice(0, 5);
    }
    results.sort((a, b) => b.total - a.total);
    return results;
  },
};
