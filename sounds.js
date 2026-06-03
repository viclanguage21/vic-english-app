// sounds.js — VIC English v12 — Audio + Speech

const SoundFX = {
  ctx: null,

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  correct() {
    this.init();
    [523,659,784].forEach((freq,i)=>{
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.connect(g); g.connect(this.ctx.destination);
      o.frequency.value=freq; o.type="sine";
      const t=this.ctx.currentTime+i*0.12;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.18,t+0.02);
      g.gain.linearRampToValueAtTime(0,t+0.18);
      o.start(t); o.stop(t+0.2);
    });
  },

  almost() {
    this.init();
    [440,494].forEach((freq,i)=>{
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.connect(g); g.connect(this.ctx.destination);
      o.frequency.value=freq; o.type="sine";
      const t=this.ctx.currentTime+i*0.15;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.14,t+0.02);
      g.gain.linearRampToValueAtTime(0,t+0.2);
      o.start(t); o.stop(t+0.22);
    });
  },

  wrong() {
    this.init();
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.connect(g); g.connect(this.ctx.destination);
    o.type="sawtooth";
    o.frequency.setValueAtTime(300,this.ctx.currentTime);
    o.frequency.linearRampToValueAtTime(160,this.ctx.currentTime+0.3);
    g.gain.setValueAtTime(0.12,this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(0,this.ctx.currentTime+0.32);
    o.start(); o.stop(this.ctx.currentTime+0.33);
  },

  complete() {
    this.init();
    const melody=[523,523,523,659,523,659,784];
    const times=[0,0.18,0.36,0.54,0.72,0.84,0.96];
    melody.forEach((freq,i)=>{
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.connect(g); g.connect(this.ctx.destination);
      o.frequency.value=freq; o.type="sine";
      const t=this.ctx.currentTime+times[i];
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.2,t+0.03);
      g.gain.linearRampToValueAtTime(0,t+0.16);
      o.start(t); o.stop(t+0.18);
    });
  },

  // ── Strip emojis and special characters ─────────────
  _clean(text) {
    return (text||'')
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27FF}]/gu, '')
      .replace(/[\uFE00-\uFE0F]/gu, '')
      .replace(/[🌟⭐🎯🔊🐢🇧🇷🇺🇸]/g, '')
      // Remove slashes — never say "slash" or "barra"
      .replace(/[\/\\|]/g, ' ')
      // Remove emoji-style punctuation
      .replace(/[\u2000-\u206F]/gu, '')
      // Remove parenthetical pronunciation hints like (ÁK-tchu)
      .replace(/\([^)]{1,20}\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Returns true if text mixes Portuguese AND English — should NOT be spoken
  _isMixed(text) {
    const t = ' ' + (text||'').toLowerCase() + ' ';
    const ptMarkers = [' não ',' está ',' são ',' você ',' também ',' então ',' muito ',' isso ',' esse ',' essa ',' este ',' esta ',' por favor',' obrigado',' bom dia',' boa ',' preciso ',' posso ',' quero ',' vamos ',' chegou ',' estava ',' tinha ',' temos ',' será ',' vou ',' vai ',' há ',' do ',' da ',' nos ',' na '];
    const enMarkers = [' the ',' is ',' are ',' was ',' were ',' have ',' has ',' will ',' can ',' please ',' your ',' this ',' that ',' with ',' from ',' they ',' their '];
    const hasPT = ptMarkers.some(w => t.includes(w));
    const hasEN = enMarkers.some(w => t.includes(w));
    return hasPT && hasEN;
  },

  // ── STRICT language detection ───────────────────────
  // Returns 'pt' only if text has CLEAR Portuguese markers
  // Otherwise defaults to English (safer)
  _isPT(text) {
    const t = (' ' + (text||'').toLowerCase() + ' ');

    // Very strong PT-only markers (won't appear in English)
    const strongPT = [
      ' não ',' está ',' são ',' você ',' também ',' então ',
      ' muito ',' isso ',' esse ',' essa ',' este ',' esta ',
      ' por favor',' obrigado',' obrigada',' bom dia',' boa tarde',
      ' boa noite',' de nada',' preciso ',' posso ',' quero ',
      ' vamos ',' chegou ',' estava ',' tinha ',' temos ',
      ' será ',' vou ',' vai ',' vem ',' há ',' às ',
      ' do ',' da ',' nos ',' na ',' em que',' de que',
      ' é um',' é uma',' é o',' é a',' estamos',
      ' ficou ',' houve ',' havia ',' navio ',' porto ',
      ' carga ',' frete ',' viagem ',' queremos',
      ' aguardando',' desembaraço',' alfândega',
    ];
    return strongPT.some(w => t.includes(w));
  },

  // ── ALWAYS use explicit language — never guess ──────

  // Speak English (en-US) — ALWAYS American voice
  speakEN(text, rate=0.85) {
    if (!text) return;
    speechSynthesis.cancel();
    const clean = this._clean(text);
    if (!clean) return;
    // Never speak mixed language sentences
    if (this._isMixed(clean)) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    u.rate = rate;
    // Highlight words while speaking
    u.onboundary = (e) => {
      if (e.name === 'word') {
        const charIdx = e.charIndex;
        document.querySelectorAll('#phrase-en .phrase-word').forEach(span => {
          span.classList.remove('word-speaking');
        });
        const words = document.querySelectorAll('#phrase-en .phrase-word');
        let pos = 0;
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          if (pos >= charIdx && pos <= charIdx + e.charLength) {
            w.classList.add('word-speaking');
            break;
          }
          pos += w.textContent.length + 1;
        }
      }
    };
    u.onend = () => {
      document.querySelectorAll('.word-speaking').forEach(s => s.classList.remove('word-speaking'));
      document.querySelectorAll('.speaking-highlight').forEach(s => s.classList.remove('speaking-highlight'));
    };
    speechSynthesis.speak(u);
  },

  // Speak English slowly (turtle mode)
  speakENSlow(text) {
    this.speakEN(text, 0.5);
  },

  // Speak Portuguese (pt-BR) — ALWAYS Brazilian voice
  speakPT(text) {
    if (!text) return;
    speechSynthesis.cancel();
    const clean = this._clean(text);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'pt-BR';
    u.rate = 0.85;
    speechSynthesis.speak(u);
  },

  // Auto-detect — only use when language is truly unknown
  // Defaults to EN if unsure
  speak(text, forceLang) {
    if (!text) return;
    const clean = this._clean(text);
    if (!clean) return;
    if (forceLang === 'pt-BR' || this._isPT(clean)) {
      this.speakPT(clean);
    } else {
      this.speakEN(clean);
    }
  },
};

// ── CENTRAL EVALUATION ENGINE ─────────────────────────────────────────────────
// Works for typed text, speech recognition, fill-blank, word order, translation
// Accepts natural variations, Brazilian common mistakes, abbreviations

const COMMON_VARIATIONS = {
  // Common Brazilian EN spelling mistakes
  "the": ["de", "dê"],
  "is": ["iz", "es"],
  "are": ["ar"],
  "have": ["hav", "hev"],
  "their": ["there", "they're", "der"],
  "your": ["you're", "yor"],
  "its": ["it's"],
};

const FILLER_WORDS = new Set(["a","an","the","of","in","on","at","to","is","are","was","were"]);

function avaliarResposta(input, expected, opts={}) {
  const clean = s => (s||'')
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FFFF}]/gu,'')
    .replace(/[\u2600-\u27FF]/gu,'')
    .replace(/[^a-záàãâéèêíìîóòõôúùûç'\s]/gi,'')
    .replace(/\s+/g,' ')
    .trim();

  const a = clean(input);
  const b = clean(expected);

  if (!a || !b) return { score:0, feedback:"tryagain", ratio:0, detail:"" };

  // Perfect match
  if (a === b) return { score:10, feedback:"correct", ratio:1, detail:"" };

  // Normalize contractions
  const normalize = s => s
    .replace(/i'm/g,"i am").replace(/you're/g,"you are").replace(/it's/g,"it is")
    .replace(/don't/g,"do not").replace(/doesn't/g,"does not").replace(/can't/g,"cannot")
    .replace(/won't/g,"will not").replace(/isn't/g,"is not").replace(/aren't/g,"are not");

  const na = normalize(a), nb = normalize(b);
  if (na === nb) return { score:10, feedback:"correct", ratio:1, detail:"" };

  const wordsA = na.split(' ').filter(w=>w);
  const wordsB = nb.split(' ').filter(w=>w);

  // Word-by-word matching with Levenshtein tolerance
  let matched = 0;
  const used = new Array(wordsB.length).fill(false);
  const wrongWords = [];
  const missedWords = [];

  wordsA.forEach(wa => {
    // Allow levenshtein distance proportional to word length
    const tolerance = wa.length <= 4 ? 1 : wa.length <= 7 ? 2 : 2;
    const idx = wordsB.findIndex((wb,i) => !used[i] && (
      wb===wa ||
      levenshtein(wa,wb) <= tolerance ||
      (COMMON_VARIATIONS[wb]||[]).includes(wa)
    ));
    if (idx >= 0) { matched++; used[idx]=true; }
    else if (!FILLER_WORDS.has(wa)) wrongWords.push(wa);
  });

  wordsB.forEach((wb,i) => {
    if (!used[i] && !FILLER_WORDS.has(wb)) missedWords.push(wb);
  });

  const ratio = matched / Math.max(wordsA.length, wordsB.length);

  // Key words (length > 3, not filler)
  const keyWords = wordsB.filter(w=>w.length>3 && !FILLER_WORDS.has(w));
  const keyHits  = keyWords.filter(w=>na.includes(w)||wordsA.some(wa=>levenshtein(wa,w)<=2)).length;
  const keyRatio = keyWords.length ? keyHits/keyWords.length : ratio;
  const finalRatio = (ratio * 0.55) + (keyRatio * 0.45);

  // Build detail feedback
  let detail = "";
  if (missedWords.length > 0 && missedWords.length <= 3) {
    detail = `Faltou: "${missedWords.join('", "')}"`;
  }

  if (finalRatio >= 0.85) return { score:10, feedback:"correct", ratio:finalRatio, detail };
  if (finalRatio >= 0.55) return { score:5,  feedback:"almost",  ratio:finalRatio, detail };
  return                         { score:0,  feedback:"tryagain", ratio:finalRatio, detail };
}

// ── PRONUNCIATION ANALYSIS ────────────────────────────────────────────────────
// Analyzes speech recognition result vs expected text
// Returns detailed feedback on what was said vs what was expected

function analyzePronunciation(spoken, expected) {
  const clean = s => (s||'').toLowerCase()
    .replace(/[^a-záàãâéèêíìîóòõôúùûç\s]/gi,'').replace(/\s+/g,' ').trim();

  const s = clean(spoken);
  const e = clean(expected);

  const sWords = s.split(' ').filter(w=>w);
  const eWords = e.split(' ').filter(w=>w);

  const issues = [];
  const correct = [];

  eWords.forEach((ew, i) => {
    const sw = sWords[i];
    if (!sw) { issues.push({ expected:ew, spoken:"(não falado)", type:"missing" }); return; }
    const dist = levenshtein(sw, ew);
    if (dist === 0) { correct.push(ew); }
    else if (dist <= 1) { correct.push(ew); } // close enough
    else if (dist <= 2) { issues.push({ expected:ew, spoken:sw, type:"close" }); }
    else { issues.push({ expected:ew, spoken:sw, type:"wrong" }); }
  });

  const score = correct.length / Math.max(eWords.length, 1);
  const pct = Math.round(score * 100);

  let feedback = "";
  if (pct >= 90) feedback = "🌟 Excelente pronúncia!";
  else if (pct >= 70) feedback = "👍 Boa pronúncia! Quase perfeito.";
  else if (pct >= 50) feedback = "💪 Continue praticando!";
  else feedback = "🔄 Tente novamente. Ouça e repita.";

  // Specific word feedback (max 2 issues shown)
  const wordFeedback = issues.slice(0,2).map(issue => {
    if (issue.type === "missing") return `Faltou falar "${issue.expected}"`;
    if (issue.type === "close") return `"${issue.spoken}" ficou próximo de "${issue.expected}"`;
    return `Você falou "${issue.spoken}", mas era "${issue.expected}"`;
  });

  return { pct, score:pct>=90?10:pct>=70?7:pct>=50?5:0, feedback, wordFeedback, issues };
}

function levenshtein(a, b) {
  const m=a.length, n=b.length;
  if (!m) return n; if (!n) return m;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i||j));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
