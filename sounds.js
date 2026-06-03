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
      .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
      .replace(/[\u2600-\u27FF]/gu, '')
      .replace(/[\uFE00-\uFE0F]/gu, '')
      .replace(/[🌟⭐🎯🔊🐢🇧🇷]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

// ── GLOBAL avaliarResposta ─────────────────────────────────────────────────────
function avaliarResposta(input, expected) {
  const clean = s => s
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FFFF}]/gu,'')
    .replace(/[\u2600-\u27FF]/gu,'')
    .replace(/[^a-záàãâéèêíìîóòõôúùûç\s]/gi,'')
    .replace(/\s+/g,' ')
    .trim();

  const a = clean(input);
  const b = clean(expected);

  if (!a || !b) return { score:0, feedback:"tryagain", ratio:0 };
  if (a === b)  return { score:10, feedback:"correct", ratio:1 };

  const wordsA = a.split(' ');
  const wordsB = b.split(' ');

  let matched = 0;
  const used = new Array(wordsB.length).fill(false);
  wordsA.forEach(wa => {
    const idx = wordsB.findIndex((wb,i) => !used[i] && (wb===wa || levenshtein(wa,wb)<=1));
    if (idx>=0) { matched++; used[idx]=true; }
  });

  const ratio = matched / Math.max(wordsA.length, wordsB.length);
  const keyWords = wordsB.filter(w=>w.length>3);
  const keyHits  = keyWords.filter(w=>a.includes(w)||wordsA.some(wa=>levenshtein(wa,w)<=1)).length;
  const keyRatio = keyWords.length ? keyHits/keyWords.length : ratio;
  const finalRatio = (ratio * 0.6) + (keyRatio * 0.4);

  if (finalRatio >= 0.85) return { score:10, feedback:"correct", ratio:finalRatio };
  if (finalRatio >= 0.50) return { score:5,  feedback:"almost",  ratio:finalRatio };
  return                         { score:0,  feedback:"tryagain", ratio:finalRatio };
}

function levenshtein(a, b) {
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i||j));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
