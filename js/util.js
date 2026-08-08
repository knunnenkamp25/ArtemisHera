/* =========================================================================
   ArtemisHera — utilities: fetch, CSV, keyword/universe matching, helpers
   ========================================================================= */

// ── Smart fetch with CORS-proxy fallback + HTML-response detection ─────────
// Every attempt is time-boxed: a hung free proxy would otherwise leave the UI
// spinning forever, since fetch() has no default timeout.
const FETCH_TIMEOUT_MS = 30000;
let workingProxyIdx = -1;

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function smartFetch(url, timeoutMs = FETCH_TIMEOUT_MS) {
  async function validateResp(resp) {
    if (!resp || !resp.ok) return null;
    const peek = await resp.clone().text();
    const t = peek.trimStart();
    if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) return null; // login/redirect page
    return new Response(peek, { status: 200, headers: resp.headers });
  }
  if (workingProxyIdx >= 0) {
    try {
      const r = await validateResp(await fetchWithTimeout(PROXIES[workingProxyIdx](url), timeoutMs));
      if (r) return r;
    } catch (e) { /* fall through */ }
    workingProxyIdx = -1;
  }
  try {
    const r = await validateResp(await fetchWithTimeout(url, timeoutMs));
    if (r) return r;
  } catch (e) { /* CORS blocked — fall through to proxies */ }
  for (let i = 0; i < PROXIES.length; i++) {
    try {
      const r = await validateResp(await fetchWithTimeout(PROXIES[i](url), timeoutMs));
      if (r) { workingProxyIdx = i; return r; }
    } catch (e) { continue; }
  }
  throw new Error('All fetch methods failed for: ' + url);
}

// ── CSV parsing with quoted-field support ──────────────────────────────────
function parseCSVLine(line) {
  const result = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = (vals[i] || '').trim());
    return row;
  });
}

// ── Keyword extraction (legislative stop-word tuned) ───────────────────────
function extractKeywords(text) {
  const words = (text || '').toLowerCase().split(/\W+/)
    .filter(w => w.length > 3 && !STOP.has(w));
  return [...new Set(words)];
}

// ── Match rules: the user-trained layer ────────────────────────────────────
// Pins add a keyword to a universe (always counted as strong evidence); bans
// remove one. Rules persist in this browser and can be exported as
// data/match_rules.json so cloud runs learn the same corrections.
const MatchRules = {
  KEY: 'artemishera.match_rules',

  load() {
    try {
      const r = JSON.parse(localStorage.getItem(this.KEY)) || {};
      return { pins: r.pins || [], bans: r.bans || [] };
    } catch (e) { return { pins: [], bans: [] }; }
  },
  _version: 0,
  version() { return this._version; },
  save(rules) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(rules));
    } catch (e) {
      console.warn('Could not save match rules:', e.message);
    }
    this._cache = null;
    this._version++;          // invalidates universePatterns cache
  },

  _cache: null,
  _index() {
    if (this._cache) return this._cache;
    const rules = this.load();
    const pins = new Map(), bans = new Map();
    for (const p of rules.pins) {
      if (!pins.has(p.universe)) pins.set(p.universe, []);
      pins.get(p.universe).push(p.kw.toLowerCase());
    }
    for (const b of rules.bans) {
      if (!bans.has(b.universe)) bans.set(b.universe, new Set());
      bans.get(b.universe).add(b.kw.toLowerCase());
    }
    this._cache = { pins, bans };
    return this._cache;
  },

  apply(universe, patterns) {
    const { pins, bans } = this._index();
    let out = patterns;
    const banned = bans.get(universe);
    if (banned) out = out.filter(p => !banned.has(p.toLowerCase()));
    const pinned = pins.get(universe);
    if (pinned) out = [...out, ...pinned.filter(p => !out.includes(p))];
    return out;
  },

  isPinned(universe, kw) {
    return (this._index().pins.get(universe) || []).includes(kw.toLowerCase());
  },

  pin(kw, universe) {
    const rules = this.load();
    kw = kw.toLowerCase().trim();
    rules.bans = rules.bans.filter(b => !(b.kw === kw && b.universe === universe));
    if (!rules.pins.some(p => p.kw === kw && p.universe === universe)) rules.pins.push({ kw, universe });
    this.save(rules);
  },

  ban(kw, universe) {
    const rules = this.load();
    kw = kw.toLowerCase().trim();
    rules.pins = rules.pins.filter(p => !(p.kw === kw && p.universe === universe));
    if (!rules.bans.some(b => b.kw === kw && b.universe === universe)) rules.bans.push({ kw, universe });
    this.save(rules);
  },

  remove(type, kw, universe) {
    const rules = this.load();
    rules[type] = rules[type].filter(r => !(r.kw === kw && r.universe === universe));
    this.save(rules);
  },

  count() { const r = this.load(); return r.pins.length + r.bans.length; },

  export() {
    downloadFile('match_rules.json', JSON.stringify(this.load(), null, 2), 'application/json');
  },
  import(obj) {
    if (!obj || (!Array.isArray(obj.pins) && !Array.isArray(obj.bans))) throw new Error('Not a match_rules file.');
    this.save({ pins: obj.pins || [], bans: obj.bans || [] });
  },
};

// Pins always count as strong evidence — the user said so explicitly.
function effectiveStrength(universe, pattern) {
  if (typeof MatchRules !== 'undefined' && MatchRules.isPinned(universe, pattern)) return 'strong';
  return patternStrength(pattern);
}

// ── Tiered universe matching (primary / secondary / tertiary) ──────────────
function scoreModelMatch(kwLower, universe) {
  const patterns = universePatterns(universe);
  for (const p of patterns) if (p === kwLower) return 'primary';
  for (const p of patterns) if (p.includes(kwLower) || kwLower.includes(p)) return 'secondary';
  const kwWords = kwLower.split(/\s+/);
  for (const p of patterns) {
    const pw = p.split(/\s+/);
    if (kwWords.some(w => pw.includes(w))) return 'tertiary';
  }
  return null;
}

// ── Universe token index + tiered scoring (from news-dashboard pipeline) ───
function wordVariants(word) {
  const v = new Set([word]);
  if (word.endsWith('ies')) v.add(word.slice(0, -3) + 'y');
  if (word.endsWith('es')) v.add(word.slice(0, -2));
  if (word.endsWith('s')) v.add(word.slice(0, -1));
  if (word.endsWith('ing')) { v.add(word.slice(0, -3)); v.add(word.slice(0, -3) + 'e'); }
  if (word.endsWith('ed')) { v.add(word.slice(0, -2)); v.add(word.slice(0, -1)); }
  return [...v].filter(w => w.length >= 3);
}

function buildUniverseIndex(universes) {
  return universes.map(name => {
    const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return { name, norm, tokens: new Set(norm.split(' ').filter(t => t.length >= 3)) };
  });
}

function matchKeywordToUniverse(keyword, index) {
  const kw = keyword.toLowerCase();
  let best = null, bestScore = 0;
  for (const variant of wordVariants(kw)) {
    for (const u of index) {
      let score = 0;
      if (u.tokens.has(variant)) score = 0.90;
      else if (u.norm.includes(variant)) score = 0.70;
      else {
        for (const t of u.tokens) {
          if (t.startsWith(variant.slice(0, 4)) && variant.slice(0, 4).length >= 4) { score = 0.50; break; }
        }
      }
      if (score > bestScore) { bestScore = score; best = u.name; }
    }
  }
  return bestScore >= 0.5 ? { universe: best, score: bestScore } : null;
}

// Rank the N best universes for a block of free text (used by oppo extraction
// and document analysis). Scoring follows the same evidence rule as votes:
// strong pattern hits are worth 2, weak ones 1, a full-name appearance 2 —
// and a universe needs a score of 2 to qualify at all. This is what stops a
// lone generic word ("reform") from dragging in an unrelated universe.
function matchTextToUniverses(text, index, n = 3) {
  const low = ' ' + (text || '').toLowerCase() + ' ';
  const scores = new Map();
  for (const u of index) {
    let score = 0;
    const seenStems = new Set();
    for (const p of universePatterns(u.name)) {
      const stem = p.trim().slice(0, 4);
      if (seenStems.has(stem) || !patternHit(low, p)) continue;
      seenStems.add(stem);
      score += effectiveStrength(u.name, p) === 'strong' ? 2 : 1;
    }
    if (u.norm.length >= 6 && low.includes(u.norm)) score += 2;   // name itself appears
    if (score >= 2) scores.set(u.name, score);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
}

// ── Google Sheet universe loading ──────────────────────────────────────────
// Accepts a full Sheets URL or a bare id and returns the id.
function sheetIdFrom(urlOrId) {
  const s = (urlOrId || '').trim();
  if (!s) return '';
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s.replace(/^.*[/=]/, '');
}

function sheetCsvUrl(id, gid = '0') {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// Pull column A as a name list. `skipRows` drops leading title/header rows —
// the Poseidon inventory sheet carries two. A title like "Poseidon OTS
// Inventory" is indistinguishable from a real entry, so this is an explicit
// setting rather than a guess; the single-word header filter below is only a
// safety net for the obvious cases.
const _HEADERISH = /^(name|universe|universes|model|models|model name|ots|ots model|inventory|title)$/i;
function namesFromSheetCsv(text, skipRows = 0) {
  return text.split(/\r?\n/)
    .slice(skipRows)
    .map(line => (parseCSVLine(line)[0] || '').trim())
    .filter(v => v && !_HEADERISH.test(v));
}

async function fetchSheetNames(idOrUrl, gid = '0', skipRows = 0) {
  const id = sheetIdFrom(idOrUrl);
  if (!id) throw new Error('that does not look like a Google Sheets link or id.');
  let resp;
  try {
    resp = await smartFetch(sheetCsvUrl(id, gid));
  } catch (e) {
    // smartFetch rejects HTML bodies, which is exactly what Google returns for
    // a sheet that is private, deleted, or not shared to "anyone with the link".
    throw new Error('the sheet could not be read. Google returns an HTML error page instead of CSV when a sheet is private, deleted, or not shared to "anyone with the link".');
  }
  const names = namesFromSheetCsv(await resp.text(), skipRows);
  if (!names.length) throw new Error('the sheet loaded but column A had no usable values (check the header-rows setting).');
  return names;
}

// Where the Poseidon universe list came from on the last load, for the UI.
const UniverseSource = { label: 'bundled fallback', count: 0, fromSheet: false };
const UNIVERSE_SHEET_KEY = 'artemishera.universe_sheet';
const UNIVERSE_SKIP_KEY = 'artemishera.universe_skip';

function getUniverseSheet() {
  return localStorage.getItem(UNIVERSE_SHEET_KEY) || CONFIG.UNIVERSE_SHEET_ID || '';
}
function getUniverseSkip() {
  return parseInt(localStorage.getItem(UNIVERSE_SKIP_KEY) || '0', 10) || 0;
}
function setUniverseSheet(v, skipRows = 0) {
  if (v) {
    localStorage.setItem(UNIVERSE_SHEET_KEY, v);
    localStorage.setItem(UNIVERSE_SKIP_KEY, String(skipRows));
  } else {
    localStorage.removeItem(UNIVERSE_SHEET_KEY);
    localStorage.removeItem(UNIVERSE_SKIP_KEY);
  }
  _universeCache = null;   // force a reload on next use
}

// The single universe list, used by every pipeline: votes, oppo, docs, news.
let _universeCache = null;
async function loadUniverses() {
  if (_universeCache) return _universeCache;
  const sheet = getUniverseSheet();
  if (sheet) {
    try {
      const names = await fetchSheetNames(sheet, CONFIG.UNIVERSE_SHEET_GID, getUniverseSkip());
      _universeCache = names;
      Object.assign(UniverseSource, { label: 'Google Sheet', count: names.length, fromSheet: true });
      return names;
    } catch (e) {
      console.warn('Universe sheet unreachable, using bundled list:', e.message);
    }
  }
  _universeCache = [...POSEIDON_UNIVERSES];
  Object.assign(UniverseSource, { label: 'bundled fallback', count: _universeCache.length, fromSheet: false });
  return _universeCache;
}

// ── DOM / misc helpers ─────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// Only http(s) survives — scraped data must never yield a javascript: link.
function safeUrl(u) {
  try {
    const parsed = new URL(u, location.href);
    return /^https?:$/.test(parsed.protocol) ? parsed.href : '#';
  } catch (e) { return '#'; }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (e) { return d; }
}

function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCSV(rows, headers) {
  const escCell = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [headers.join(','), ...rows.map(r => headers.map(h => escCell(r[h])).join(','))].join('\n');
}

// Lazy-load an external script once (pdf.js, mammoth)
const _loadedScripts = {};
function loadScript(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => {
      // Don't cache the rejection — one CDN blip would otherwise poison this
      // script for the rest of the session with no way to retry.
      delete _loadedScripts[src];
      s.remove();
      reject(new Error('Failed to load ' + src));
    };
    document.head.appendChild(s);
  });
  return _loadedScripts[src];
}

// Simple modal
function showModal(title, bodyHTML) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-veil" onclick="if(event.target===this) closeModal()">
      <div class="modal">
        <div class="m-head"><b>${esc(title)}</b><span class="x" onclick="closeModal()">×</span></div>
        <div class="m-body">${bodyHTML}</div>
      </div>
    </div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function setStatus(el, msg, cls = '') {
  if (typeof el === 'string') el = $(el);
  if (!el) return;
  el.className = 'status ' + cls;
  el.textContent = msg;
}
