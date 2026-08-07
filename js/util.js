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

// ── Tiered model matching (primary / secondary / tertiary) ─────────────────
function scoreModelMatch(kwLower, model) {
  const patterns = TOPIC_KEYWORDS[model] || [];
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

// Rank the N best universes for a block of free text (used by oppo extraction)
function matchTextToUniverses(text, index, n = 3) {
  const kws = extractKeywords(text);
  const scores = new Map();
  for (const kw of kws) {
    for (const variant of wordVariants(kw)) {
      for (const u of index) {
        let s = 0;
        if (u.tokens.has(variant)) s = 0.9;
        else if (u.norm.includes(variant) && variant.length >= 4) s = 0.6;
        if (s) scores.set(u.name, (scores.get(u.name) || 0) + s);
      }
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
}

// ── OTS universe loading (Google Sheet placeholder → fallback) ─────────────
let _otsCache = null;
async function loadOTSModels() {
  if (_otsCache) return _otsCache;
  if (CONFIG.OTS_SHEET_ID) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${CONFIG.OTS_SHEET_ID}/export?format=csv&gid=${CONFIG.OTS_SHEET_GID}`;
      const resp = await smartFetch(url);
      const rows = parseCSV(await resp.text());
      const names = rows.map(r => Object.values(r)[0]).filter(Boolean);
      if (names.length) { _otsCache = names; return names; }
    } catch (e) { console.warn('OTS sheet unavailable, using fallback list', e); }
  }
  _otsCache = [...OTS_FALLBACK];
  return _otsCache;
}

// ── DOM / misc helpers ─────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

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
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
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
