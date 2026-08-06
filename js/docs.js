/* =========================================================================
   ArtemisHera — document ingestion + attack extraction
   Reads PDF (pdf.js), DOCX (mammoth) or TXT fully in the browser, then runs
   a signal-phrase extraction engine over the text: every sentence carrying
   an attack signal becomes a candidate hit, categorized against the 23
   Poseidon categories, scored for severity, and matched to universes.
   A Poseidon-skill attacks.json can also be imported directly for
   full-fidelity results.
   ========================================================================= */

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

const Docs = {
  // ── Text extraction ────────────────────────────────────────────────────
  async extractText(file, onStatus) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return this._extractPDF(file, onStatus);
    if (name.endsWith('.docx')) return this._extractDOCX(file, onStatus);
    if (name.endsWith('.txt') || name.endsWith('.md')) return file.text();
    if (name.endsWith('.json')) return file.text(); // attacks.json import
    throw new Error('Unsupported file type. Use PDF, DOCX, TXT, or a Poseidon attacks.json.');
  },

  async _extractPDF(file, onStatus) {
    await loadScript(PDFJS_URL);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      onStatus && onStatus(`Reading page ${p} of ${pdf.numPages}…`, p / pdf.numPages);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n\n';
    }
    return text;
  },

  async _extractDOCX(file, onStatus) {
    await loadScript(MAMMOTH_URL);
    onStatus && onStatus('Extracting document text…', 0.5);
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  },

  // ── Attack extraction engine ───────────────────────────────────────────
  splitSentences(text) {
    return text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z“"'(])/)
      .map(s => s.trim())
      .filter(s => s.length > 40 && s.length < 800);
  },

  detectCategory(sentence) {
    const low = sentence.toLowerCase();
    let best = 'Statements & Quotes', bestScore = 0;
    for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const k of kws) if (low.includes(k)) score++;
      if (score > bestScore) { bestScore = score; best = cat; }
    }
    return bestScore > 0 ? best : 'Media & Public Perception';
  },

  scoreSeverity(sentence, signalCount) {
    const low = sentence.toLowerCase();
    let score = signalCount;
    if (/\$[\d,]+/.test(sentence)) score += 2;                       // dollar amounts
    if (/(indicted|convicted|arrested|fraud|felony|scandal)/.test(low)) score += 3;
    if (/(voted against|voted for|voted with|voted to)/.test(low)) score += 2;
    if (/(100%|every single|repeatedly|dozens|hundreds)/.test(low)) score += 1;
    if (/(only member|one of only|deciding vote)/.test(low)) score += 2;
    if (score >= 5) return 'Major';
    if (score >= 3) return 'Moderate';
    if (score >= 2) return 'Minor';
    return 'Niche';
  },

  extractAttacks(text, subject, onStatus) {
    const sentences = this.splitSentences(text);
    const index = buildUniverseIndex(POSEIDON_UNIVERSES);
    const attacks = [];
    const seen = new Set();
    let num = 0;

    sentences.forEach((s, i) => {
      if (onStatus && i % 200 === 0) onStatus(`Analyzing sentence ${i + 1} of ${sentences.length}…`, i / sentences.length);
      const low = s.toLowerCase();
      const signals = ATTACK_SIGNALS.filter(sig => low.includes(sig));
      if (!signals.length) return;

      // dedup on normalized leading text
      const key = low.replace(/[^a-z0-9]+/g, '').slice(0, 90);
      if (seen.has(key)) return;
      seen.add(key);

      const category = this.detectCategory(s);
      const severity = this.scoreSeverity(s, signals.length);
      const universes = matchTextToUniverses(s, index, 3);

      attacks.push({
        number: ++num,
        category,
        attack: s.length > 220 ? s.slice(0, 217) + '…' : s,
        key_detail: s,
        severity,
        best_universe: universes[0] || '',
        secondary_universe: universes[1] || '',
        tertiary_universe: universes[2] || '',
        notes: 'Auto-extracted (signal: ' + signals[0] + ')',
      });
    });

    const rank = { Major: 0, Moderate: 1, Minor: 2, Niche: 3 };
    attacks.sort((a, b) => rank[a.severity] - rank[b.severity]);
    attacks.forEach((a, i) => a.number = i + 1);
    return attacks;
  },

  // ── Poseidon attacks.json import ───────────────────────────────────────
  parseAttacksJSON(text) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : (data.attacks || []);
    if (!arr.length || !arr[0].attack) throw new Error('JSON does not look like a Poseidon attacks file.');
    return arr.map((a, i) => ({
      number: a.number || i + 1,
      category: a.category || 'Other',
      attack: a.attack || '',
      key_detail: a.key_detail || '',
      severity: a.severity || 'Minor',
      best_universe: a.best_universe || '',
      secondary_universe: a.secondary_universe || '',
      tertiary_universe: a.tertiary_universe || '',
      notes: a.notes || '',
    }));
  },

  // General documents: keyword + universe intelligence summary
  analyzeDocument(text) {
    const index = buildUniverseIndex(POSEIDON_UNIVERSES);
    const freq = new Map();
    for (const w of (text.toLowerCase().split(/\W+/))) {
      if (w.length < 4 || STOP.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    const keywords = [...freq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120)
      .map(([word, count]) => {
        const m = matchKeywordToUniverse(word, index);
        return { word, count, universe_match: m ? m.universe : '', universe_score: m ? m.score : 0 };
      });
    return keywords;
  },
};
