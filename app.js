// app.js — VIC English v12 — Full fix

import { auth, registerUser, loginUser, loginWithGoogle, logoutUser, onAuthChange, getUserData, saveProgress, getAllUsers, getUserById, OWNER_UID, registerFCMToken, onForegroundMessage, resetPassword, resendVerificationEmail, reloadCurrentUser, callSendPushToAll } from "./firebase.js";
import { I18N, SEG_NAMES, LEVEL_TIPS, LOADING_QUOTES, GLOSSARY, PRO_MESSAGES, BADGES, NOTIF_MESSAGES, MP_LINK } from "./constants.js";
import { calcLevel, stripEmoji, cleanEnunciado, shuffle, vibrate } from "./utils.js";

// Global haptic: every button tap gets a short buzz (capture fires before onclick)
document.addEventListener("click", e => {
  if(e.target.closest("button") || e.target.closest("[role='button']")) vibrate(22);
}, true);

// ══════════════════════════════════════════════════════════════════════════════
// ERROR LOGGING — centralised, non-blocking
// ══════════════════════════════════════════════════════════════════════════════
const _errLog = [];
function vicLog(scope, msg, err) {
  const entry = { scope, msg, err: err?.message || String(err||""), ts: Date.now() };
  _errLog.push(entry);
  if(_errLog.length > 50) _errLog.shift(); // keep last 50
  console.warn(`[VIC:${scope}]`, msg, err || "");
}

// Global safety net — catches anything that slips past individual try/catch
window.addEventListener("unhandledrejection", e => {
  vicLog("unhandledRejection", e.reason?.message || String(e.reason), e.reason);
});
window.onerror = (msg, src, line, col, err) => {
  vicLog("globalError", `${msg} @ ${src}:${line}`, err);
  return false; // don't suppress default browser reporting
};

// Expose error log for debug (type window._vicLog in console)
window._vicLog = _errLog;

// ── VIEW / PHRASE LIFECYCLE — AbortControllers prevent listener accumulation ──
let _dashAC = null;
let _phraseAC = null;

// ── SETTINGS CACHE — single synchronous localStorage read per key at startup ──
const _LS = {
  avatar:       "vic_avatar",
  darkMode:     "vic_darkMode",
  sounds:       "vic_sounds",
  fontSize:     "vic_fontSize",
  notifEnabled: "vic_notif_enabled",
  notifFreq:    "vic_notif_freq",
  lastNotif:    "vic_last_notif",
  notifAsked:   "vic_notif_asked",
};
const _cfg = Object.fromEntries(
  Object.entries(_LS).map(([k, lsKey]) => [k, localStorage.getItem(lsKey)])
);
function _setCfg(key, value) {
  _cfg[key] = value;
  const lsKey = _LS[key];
  if(!lsKey) return;
  if(value === null) localStorage.removeItem(lsKey);
  else localStorage.setItem(lsKey, value);
}


// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS — Firebase Analytics + eventos customizados
// ══════════════════════════════════════════════════════════════════════════════
let _analytics = null;
async function initAnalytics(){
  try{
    const { getAnalytics, logEvent, setUserId } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js");
    // A instância do app já existe — acessar via window
    if(!window._vicApp) return;
    _analytics = getAnalytics(window._vicApp);
    console.log("✅ Analytics inicializado");
    return { logEvent: (name, params) => logEvent(_analytics, name, params), setUserId };
  }catch(e){ console.warn("Analytics:", e.message); return null; }
}

function trackEvent(name, params={}){
  try{
    if(!_analytics) return;
    // Evitar tracking de dados pessoais
    const { getAnalytics, logEvent } = window._vicAnalyticsFns || {};
    if(logEvent && _analytics) logEvent(_analytics, name, params);
  }catch(e){ vicLog("analytics", name, e); }
}

// Eventos principais
function analyticsTrackLogin(method){ trackEvent("login", {method}); }
function analyticsTrackMission(segId, missionId){ trackEvent("complete_mission", {segment:segId, mission:missionId}); }
function analyticsTrackGame(type){ trackEvent("play_game", {game_type:type}); }
function analyticsTrackUpgrade(){ trackEvent("begin_checkout", {currency:"BRL", value:15}); }
function analyticsTrackScreen(name){ trackEvent("screen_view", {screen_name:name}); }

// Nomes dos segmentos por idioma

function segName(segId){
  return SEG_NAMES[_lang]?.[segId] || SEG_NAMES["pt"]?.[segId] || segId;
}

// Idioma atual — padrão PT, salvo no localStorage
let _lang = (()=>{ const l=localStorage.getItem("vic_lang"); return(l==="pt"||l==="en")?l:"pt"; })();

// Função principal de tradução
function t(key) {
  return I18N[_lang]?.[key] || I18N["pt"]?.[key] || key;
}

// Trocar idioma e re-renderizar tudo
function setLang(lang) {
  _lang = lang;
  localStorage.setItem("vic_lang", lang);
  applyLang();
}

// Aplicar idioma em todos os elementos com data-i18n
function applyLang() {
  // Flags e labels por idioma — mostra o idioma ATUAL
  const LANG_LABELS = { pt:"🇧🇷 PT", en:"🇺🇸 EN", es:"🇪🇸 ES", de:"🇩🇪 DE", it:"🇮🇹 IT" };

  // Botão no header removido — seletor só no perfil agora

  // Destacar botão ativo — configurações E tela de login
  ["pt","en","es","de","it"].forEach(lang => {
    const active = _lang === lang;
    // Botões no perfil/configurações
    const btn = document.getElementById(`lang-btn-${lang}`);
    if (btn) btn.classList.toggle("active", active);
    // Botões na tela de login
    const authBtn = document.getElementById(`auth-lang-${lang}`);
    if (authBtn) {
      authBtn.classList.toggle("active", active);
    }
  });

  // Atualizar todos os elementos marcados com data-i18n
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-html]").forEach(el => {
    const key = el.getAttribute("data-i18n-html");
    el.innerHTML = t(key);
  });

  // Atualizar placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });

  // Atualizar títulos
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });

  // Hide PT tagline on auth screen when English is selected
  const taglinePt = document.querySelector(".auth-tagline-pt");
  if(taglinePt) taglinePt.style.display = _lang === "pt" ? "" : "none";

  // Re-renderizar partes dinâmicas se estiverem visíveis
  const activeView = document.querySelector(".view.active")?.id;
  if (activeView === "view-dashboard") renderDashboardTexts();
  if (activeView === "view-mission") renderMissionTexts();
  if (activeView === "view-profile") renderProfileTexts();
}

function renderDashboardTexts() {
  const el = id => document.getElementById(id);
  // Labels principais
  if (el("dash-daily-title"))    el("dash-daily-title").textContent    = t("daily_missions");
  if (el("dash-segments-label")) el("dash-segments-label").textContent = t("segments");
  if (el("dash-quick-label"))    el("dash-quick-label").textContent    = t("quick_access");
  if (el("btn-start-now"))       el("btn-start-now").textContent       = t("start_now");
  if (el("btn-upgrade-dash"))    el("btn-upgrade-dash").textContent    = t("subscribe");
  if (el("xp-track-label"))      el("xp-track-label").textContent      = t("xp_progress");
  if (el("stat-ranking-label"))  el("stat-ranking-label").textContent  = t("ranking");
  // XP next level
  const xpNext = el("dash-xp-next");
  if (xpNext && xpNext.textContent) {
    const num = xpNext.textContent.replace(/[^0-9]/g,"");
    if(num) xpNext.textContent = `${num} ${t("xp_next_level")}`;
  }
  // Pro banner
  // pro banner sub handled in applyLang
  // Botão sair admin
  const logoutBtn = el("btn-logout");
  if(logoutBtn) logoutBtn.title = t("logout");
  // Stat card labels
  const statLabels = document.querySelectorAll(".stat-label");
  statLabels.forEach(el => {
    const txt = el.textContent;
    if(txt.includes("XP Total"))      el.textContent = t("total_xp")+" 📊";
    if(txt.includes("Nível"))         el.textContent = t("level")+" ⭐";
    if(txt.includes("Streak"))        el.textContent = t("total_streak");
    if(txt.includes("Ranking"))       el.textContent = t("ranking");
    if(txt.includes("Total XP"))      el.textContent = t("total_xp")+" 📊";
    if(txt.includes("Level"))         el.textContent = t("level")+" ⭐";
  });
  // Perfil stat labels
  document.querySelectorAll(".profile-stat small").forEach(el => {
    const txt = el.textContent;
    if(txt.includes("XP Total") || txt.includes("Total XP")) el.textContent = t("total_xp");
    if(txt.includes("Dias Praticados") || txt.includes("Days Practiced") || txt.includes("Tage")) el.textContent = t("days_practiced")||"Dias Praticados";
    if(txt.includes("Missões") || txt.includes("Missions")) el.textContent = t("total_missions");
  });
  // Próxima conquista
  const nbiLabel = document.querySelector(".nbi-label");
  if(nbiLabel) nbiLabel.textContent = t("next_conquest");
  const nbiText = document.querySelector(".nbi-text");
  if(nbiText){
    const strong = nbiText.querySelector("strong");
    const name = strong ? strong.textContent : "";
    nbiText.innerHTML = `${t("next_conquest")}: <strong id="nbi-name">${name}</strong>`;
  }

  // Stat card labels — force re-apply by data attribute
  document.querySelectorAll(".stat-label").forEach(el => {
    const key = el.dataset.i18nStat;
    if(key) { el.textContent = t(key); return; }
    const txt = el.textContent;
    if(txt.includes("XP") && !txt.includes("Ranking"))    { el.dataset.i18nStat="total_xp";      el.textContent = t("total_xp")+" 📊"; }
    else if(txt.includes("ível")||txt.includes("Level")||txt.includes("Stufe")||txt.includes("Livello")||txt.includes("Nivel")) { el.dataset.i18nStat="level"; el.textContent = t("level")+" ⭐"; }
    else if(txt.includes("Streak")||txt.includes("Racha")||txt.includes("Striscia")) { el.dataset.i18nStat="total_streak"; el.textContent = t("total_streak"); }
    else if(txt.includes("Ranking")||txt.includes("Rangliste")||txt.includes("Classifica")) { el.dataset.i18nStat="ranking"; el.textContent = t("ranking"); }
  });

  // Diag invite banner
  const diagInvTitle = document.querySelector(".diag-invite-title");
  const diagInvSub   = document.querySelector(".diag-invite-sub");
  const diagInvBtn   = document.getElementById("btn-start-diag");
  if(diagInvTitle) diagInvTitle.textContent = t("discover_level");
  if(diagInvSub)   diagInvSub.textContent   = t("quick_test");
  if(diagInvBtn)   diagInvBtn.textContent   = t("do_test");

  // Grammar Core banner title/sub
  const gcTitle = document.querySelector(".grammar-core-banner .gc-title");
  if(gcTitle) gcTitle.textContent = t("grammar_core_title");
  const gcSubEl = document.querySelector(".grammar-core-banner .gc-sub");
  if(gcSubEl) gcSubEl.textContent = t("gc_sub");

  // Writing banner title
  const wTitle = document.querySelector(".writing-core-banner .gc-title");
  if(wTitle) wTitle.textContent = t("writing_title");

  // Quick access game buttons
  const qa = id => document.getElementById(id);
  if(qa("btn-goto-flashcards")) qa("btn-goto-flashcards").textContent = t("qa_flashcards");
  if(qa("btn-goto-memory"))     qa("btn-goto-memory").textContent     = t("qa_memory");
  if(qa("btn-goto-truefalse"))  qa("btn-goto-truefalse").textContent  = t("qa_truefalse");
  if(qa("btn-goto-dialogue"))   qa("btn-goto-dialogue").textContent   = t("qa_dialogue");

  // Diagnosis step 2 title
  const diagStep2Title = document.querySelector("#diag-step-2 .diag-step-title");
  if(diagStep2Title) diagStep2Title.textContent = t("difficulty_title");
  // Pro banner
  const _pbt = document.getElementById("pro-banner-title");
  const _pbs = document.getElementById("pro-banner-sub");
  if(_pbt) _pbt.textContent = t("pro_banner_title");
  if(_pbs) _pbs.textContent = t("pro_banner_sub2");
  // Upgrade screen — traduzir
  const upgTitle = document.querySelector(".upgrade-title");
  if(upgTitle) upgTitle.textContent = t("upgrade_title");
  const upgBtn = document.getElementById("btn-pay-mp");
  if(upgBtn) upgBtn.textContent = t("upgrade_btn");
  // Benefits
  const benefits = document.querySelectorAll(".upgrade-benefit");
  const benefitKeys = [
    {pt:"Todos os segmentos", en:"All segments unlocked", es:"Todos los segmentos", de:"Alle Bereiche", it:"Tutti i segmenti"},
    {pt:"Todas as fases",     en:"All phases (1→5)",      es:"Todas las fases",    de:"Alle Phasen",  it:"Tutte le fasi"},
    {pt:"Jogos ilimitados",   en:"Unlimited games",       es:"Juegos ilimitados",  de:"Unbegrenzte Spiele", it:"Giochi illimitati"},
    {pt:"Progresso na nuvem", en:"Cloud progress",        es:"Progreso en la nube",de:"Cloud-Fortschritt", it:"Progressi nel cloud"},
  ];
  benefits.forEach((el,i) => {
    if(benefitKeys[i]) el.textContent = "✅ " + (benefitKeys[i][_lang] || benefitKeys[i].pt);
  });
  // Diagnóstico — títulos dos steps
  const diagTitles = {
    0: {pt:"Por que você quer aprender inglês?", en:"Why do you want to learn English?", es:"¿Por qué quieres aprender inglés?", de:"Warum möchtest du Englisch lernen?", it:"Perché vuoi imparare l'inglese?"},
    1: {pt:"Qual é a sua área de atuação?", en:"What is your area of work?", es:"¿Cuál es tu área de trabajo?", de:"Was ist dein Arbeitsbereich?", it:"Qual è la tua area di lavoro?"},
    2: {pt:"Qual é sua maior dificuldade?", en:"What is your biggest challenge?", es:"¿Cuál es tu mayor dificultad?", de:"Was ist deine größte Schwierigkeit?", it:"Qual è la tua difficoltà principale?"},
    3: {pt:"O que você quer conseguir fazer em inglês?", en:"What do you want to be able to do in English?", es:"¿Qué quieres poder hacer en inglés?", de:"Was möchtest du auf Englisch tun können?", it:"Cosa vuoi riuscire a fare in inglese?"},
  };
  Object.entries(diagTitles).forEach(([i, titles]) => {
    const stepEl = document.getElementById(`diag-step-${i}`);
    if(stepEl){
      const titleEl = stepEl.querySelector(".diag-step-title");
      if(titleEl) titleEl.textContent = titles[_lang]||titles.pt;
    }
  });
  // Botões do diagnóstico
  const diagContinueBtn = document.getElementById("btn-finish-diag-note");
  if(diagContinueBtn) diagContinueBtn.textContent = t("diag_continue");
  const diagSkipNote = document.getElementById("btn-skip-diag-note");
  if(diagSkipNote) diagSkipNote.textContent = t("diag_skip");
  const diagTestBtn = document.getElementById("btn-finish-diag");
  if(diagTestBtn) diagTestBtn.textContent = t("diag_test_btn");
  const diagSkipTest = document.getElementById("btn-skip-level-test-diag");
  if(diagSkipTest) diagSkipTest.textContent = t("diag_skip_test");
  const confirmSegsBtn = document.getElementById("btn-confirm-segments");
  if(confirmSegsBtn && _selectedSegments?.length > 0){
    const confirmLabels = {pt:"Confirmar →",en:"Confirm →",es:"Confirmar →",de:"Bestätigen →",it:"Conferma →"};
    confirmSegsBtn.textContent = (confirmLabels[_lang]||"Confirmar →").replace("→", `${_selectedSegments.length > 1 ? " ("+_selectedSegments.length+")" : ""} →`);
  }
  // Onboarding language buttons active state
  ["pt","en"].forEach(lang => {
    const obBtn = document.getElementById(`ob-lang-${lang}`);
    if(obBtn) obBtn.classList.toggle("active", _lang===lang);
  });

  // Auth labels (login e cadastro)
  const authLabels = {
    "auth-label-email":    {pt:"EMAIL",         en:"EMAIL",     es:"CORREO",    de:"E-MAIL",    it:"EMAIL"},
    "auth-label-password": {pt:"SENHA",         en:"PASSWORD",  es:"CONTRASEÑA",de:"PASSWORT",  it:"PASSWORD"},
    "auth-label-username": {pt:"@ Nome de usuário", en:"@ Username", es:"@ Nombre de usuario", de:"@ Benutzername", it:"@ Nome utente"},
  };
  Object.entries(authLabels).forEach(([id, vals]) => {
    const el = document.getElementById(id);
    if(el) el.textContent = vals[_lang] || vals.pt;
  });
  // Botões de auth tabs
  const tabLogin = document.getElementById("tab-login");
  const tabReg   = document.getElementById("tab-register");
  if(tabLogin) tabLogin.textContent = t("login");
  if(tabReg)   tabReg.textContent   = t("register");
  // Placeholder do email/senha
  const loginEmail = document.getElementById("login-email");
  const loginPass  = document.getElementById("login-password");
  if(loginEmail) loginEmail.placeholder = t("email").toLowerCase()+"@...";
  // Botão Google
  const btnGoogle = document.getElementById("btn-google");
  if(btnGoogle) btnGoogle.textContent = t("login_google");
  // Botão anon
  const btnAnon = document.getElementById("btn-anon");
  if(btnAnon) btnAnon.textContent = t("login_anon");
  // Quick access buttons
  if(qa("btn-goto-flashcards")) qa("btn-goto-flashcards").textContent = t("qa_flashcards");
  if(qa("btn-goto-memory"))     qa("btn-goto-memory").textContent     = t("qa_memory");
  if(qa("btn-goto-truefalse"))  qa("btn-goto-truefalse").textContent  = t("qa_truefalse");
  if(qa("btn-goto-dialogue"))   qa("btn-goto-dialogue").textContent   = t("qa_dialogue");

  // V/F buttons (dentro do jogo)
  if(qa("tf-true"))  qa("tf-true").innerHTML  = "✅ " + (_lang==="pt"?"Verdadeiro":_lang==="es"?"Verdadero":_lang==="de"?"Wahr":_lang==="it"?"Vero":"True");
  if(qa("tf-false")) qa("tf-false").innerHTML = "❌ " + (_lang==="pt"?"Falso":_lang==="es"?"Falso":_lang==="de"?"Falsch":_lang==="it"?"Falso":"False");

  // Grammar Core banner
  const gcSub = document.querySelector(".grammar-core-banner .gc-sub");
  if(gcSub) gcSub.textContent = t("gc_sub");
  const gcMore = document.querySelector(".grammar-core-banner .gc-tags span:last-child");
  if(gcMore) gcMore.textContent = t("gc_tags_more");

  // Writing banner
  const wSub = document.querySelector(".writing-core-banner .gc-sub");
  if(wSub) wSub.textContent = t("writing_sub");
  const wTags = document.querySelectorAll(".writing-core-banner .gc-tags span");
  const wTagKeys = ["writing_tag1","writing_tag2","writing_tag3","writing_tag4","writing_tag5"];
  wTags.forEach((el,i)=>{ if(wTagKeys[i]) el.textContent = t(wTagKeys[i]); });

  // Feedback strip
  const fbTitle = document.querySelector(".feedback-strip-title");
  if(fbTitle) fbTitle.textContent = t("feedback_title");
  if(qa("btn-feedback-comment")) qa("btn-feedback-comment").textContent = t("feedback_comment");
  if(qa("btn-feedback-like"))    qa("btn-feedback-like").textContent    = t("feedback_like");
  if(qa("btn-feedback-bug"))     qa("btn-feedback-bug").textContent     = t("feedback_bug");

  // About button e modal — via ID (sólido)
  if(qa("btn-about-us")) qa("btn-about-us").textContent = t("about_us");
  if(qa("about-title-text")) qa("about-title-text").textContent = t("about_title");
  const aboutMission = document.querySelector(".about-mission");
  if(aboutMission) aboutMission.textContent = t("about_mission");
  const aboutServices = document.querySelectorAll(".about-service");
  const aboutSvcKeys = ["about_app","about_incompany","about_aulas","about_trad","about_interp"];
  aboutServices.forEach((el,i)=>{ if(aboutSvcKeys[i]) el.textContent = t(aboutSvcKeys[i]); });

  // Perfil — section titles via ID (sólido)
  const profMap = {
    "prof-title-commitment": "prof_commitment",
    "prof-title-calendar":   "prof_calendar",
    "prof-title-skills":     "prof_skills",
    "prof-title-goal":       "prof_goal",
    "prof-title-account":    "prof_account",
    "prof-title-networks":   "prof_networks",
    "prof-title-prefs":      "prof_prefs",
    "prof-title-share":      "prof_share",
  };
  Object.entries(profMap).forEach(([id, key]) => {
    const el = qa(id);
    if(el) el.textContent = t(key);
  });

  // Lang section label
  if(qa("lang-section-label")) qa("lang-section-label").textContent = t("pref_lang");
  if(qa("notif-label")) qa("notif-label").textContent = t("notif_title");

  // Contato via ID
  if(qa("contact-form-title-text")) qa("contact-form-title-text").textContent = t("contact_title");
  if(qa("contact-form-sub-text"))   qa("contact-form-sub-text").textContent   = t("contact_sub");
  if(qa("official-site-btn"))       qa("official-site-btn").textContent       = t("official_site");

  // Conta — botões de edição
  const accBtns = document.querySelectorAll(".account-edit-btn, .profile-edit-btn");
  accBtns.forEach(btn => {
    if(btn.textContent.includes("nome")||btn.textContent.includes("name")||btn.textContent.includes("Name")||btn.textContent.includes("Nome"))
      btn.textContent = t("acc_edit_name");
    else if(btn.textContent.includes("email")||btn.textContent.includes("Email"))
      btn.textContent = t("acc_edit_email");
    else if(btn.textContent.includes("senha")||btn.textContent.includes("password")||btn.textContent.includes("Password"))
      btn.textContent = t("acc_edit_pass");
  });

  // Compartilhar & Contato
  if(qa("btn-share-app")) qa("btn-share-app").textContent = t("share_app");
  const ctTitle = document.querySelector(".contact-form-title");
  if(ctTitle) ctTitle.textContent = t("contact_title");
  const ctSub = document.querySelector(".contact-form-sub");
  if(ctSub) ctSub.textContent = t("contact_sub");
  const ctArea = qa("contact-form-text");
  if(ctArea) ctArea.placeholder = t("contact_placeholder");
  if(qa("btn-send-contact")) qa("btn-send-contact").textContent = t("contact_send");

  // Preferências
  document.querySelectorAll(".settings-row span").forEach(el => {
    const txt = el.textContent;
    if(txt.includes("Sons")||txt.includes("Sounds")||txt.includes("Töne")||txt.includes("Suoni"))
      el.textContent = t("pref_sounds");
    else if(txt.includes("Modo escuro")||txt.includes("Dark")||txt.includes("Dunkel")||txt.includes("scura"))
      el.textContent = t("pref_dark");
    else if(txt.includes("Idioma")||txt.includes("Language")||txt.includes("Sprache")||txt.includes("Lingua")||txt.includes("App"))
      el.textContent = t("pref_lang");
    else if(txt.includes("Notificações")||txt.includes("Notifications")||txt.includes("Benachrichtigung")||txt.includes("Notifiche"))
      el.textContent = t("notif_title");
    else if(txt.includes("Frequência")||txt.includes("Frequency")||txt.includes("Frequenz")||txt.includes("Frequenza"))
      el.textContent = t("notif_freq_label");
    else if(txt.includes("vezes")||txt.includes("times")||txt.includes("mal")||txt.includes("volte"))
      el.textContent = t("notif_per_day");
  });

  // Site oficial
  document.querySelectorAll(".settings-big-btn, a").forEach(el => {
    if(el.textContent.includes("Site Oficial")||el.textContent.includes("Official Site")||el.textContent.includes("Offizielle"))
      el.textContent = t("official_site");
  });

  // Segmentos — re-render cards
  if(document.querySelector(".segment-card")) renderSegments();
  // Refazer saudação com novo idioma
  if(userData?.name) buildGreeting(userData.name.split(" ")[0]||userData.name);
  // Missões diárias — re-render
  if(userData) renderDailyMissions();
}

function renderProfileTexts() {
  // Re-render JS-built sections that have language-specific text
  if (userData) {
    renderSkillsAnalysis();
    renderCommitment();
  }
}

function renderMissionTexts() {
  ["btn-prev-exercise"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = t("previous");
  });
  ["btn-next-main"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = t("next");
  });
}


// Capture auth state before DOM ready
let _pendingAuthUser = undefined;
let _domReady = false;
let _onboardingActive = false; // true while onboarding is showing — blocks all auto-navigation

onAuthChange(user => {
  _pendingAuthUser = user;
  // Never auto-navigate while the user is going through onboarding
  if(_domReady && !_onboardingActive) _handleAuth(user);
});

// ── STATE ──────────────────────────────────────────────────────────────────────
let currentUser=null, userData=null;
let _logoImgCache=null;
let currentSegmentId="maritimo", currentPhaseId="f1", currentMissionId="vocab_basico", currentPhraseIndex=0;
let exerciseAnswered=false;
let diagAnswers={}, diagStep=0;
const DIAG_STEPS=3;

let mediaRecorder=null, audioChunks=[], recordedURL=null, isRecording=false;
let recognition=null, spokenWords=[];
let memSelected=null, memMatched=0;
let wordOrderPlaced=[];
let matchSelected=null, matchCorrect=0;
let fcDeckId=null, fcCards=[], fcIndex=0, fcFlipped=false, fcXP=0;
let freeMemSelected=[], freeMemMatched=0, freeMemXP=0;
let tfItems=[], tfIndex=0, tfScore=0, tfCategory=null;
let dlgScenario=null, dlgIndex=0, dlgScore=0;
let adminUsers=[], adminSearchTerm="", _currentModalUser=null;
let ltIndex=0, ltScore=0;

// ── HELPERS ────────────────────────────────────────────────────────────────────
const getSegment  = id     => VICTOR_DATA.segments.find(s=>s.id===id);
const getPhase    = (s,p)  => getSegment(s)?.phases?.find(x=>x.id===p);
const getMission  = (s,p,m)=> getPhase(s,p)?.missions?.find(x=>x.id===m);
const getPhrase   = ()     => getMission(currentSegmentId,currentPhaseId,currentMissionId)?.phrases[currentPhraseIndex]||null;

function getRandomTip(level){
  const group = LEVEL_TIPS[Math.min(level,4)] || LEVEL_TIPS[4];
  const tips = group[_lang] || group["pt"];
  return tips[Math.floor(Math.random()*tips.length)];
}
function levelInfo(xp){
  const l=calcLevel(xp);
  if(l<=2) return {label:t("level_beginner"), msg:getRandomTip(1)};
  if(l<=5) return {label:t("level_basic"),    msg:getRandomTip(2)};
  if(l<=9) return {label:t("level_inter"),    msg:getRandomTip(3)};
  return         {label:t("level_advanced"),  msg:getRandomTip(4)};
}

let _lastView = null;
function showView(id){
  // view-leaderboard é bottom sheet — usar openLeaderboard()
  if(id === "view-leaderboard"){ openLeaderboard(); return; }
  // Remove admin return btn when leaving dashboard
  if(id !== "view-dashboard") document.getElementById("admin-return-btn")?.remove();
  // Aplicar idioma quando trocar de view (garante tradução em auth também)
  if(id === "view-auth" || id === "view-onboarding") {
    setTimeout(applyLang, 50);
  }
  const next=document.getElementById(id);
  if(!next) return;

  const current=document.querySelector(".view.active");
  if(current===next) return;

  // Determine direction
  const views=["view-onboarding","view-auth","view-dashboard","view-phases","view-missions-list","view-mission","view-complete","view-flashcards","view-memory-free","view-truefalse","view-dialogue","view-writing","view-profile","view-upgrade","view-admin","view-diagnosis","view-level-test"];
// view-leaderboard foi substituída por bottom sheet — não usa showView()
  const ci=views.indexOf(current?.id||"");
  const ni=views.indexOf(id);
  const dir=ni>=ci?1:-1; // 1=forward (slide left), -1=back (slide right)

  // Hide current with slide out
  if(current){
    current.style.transition="transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.38s ease";
    current.style.transform=`translateX(${dir*-100}%)`;
    current.style.opacity="0";
    current.style.pointerEvents="none";
    setTimeout(()=>{
      current.classList.remove("active");
      current.style.transform="";
      current.style.opacity="";
      current.style.transition="";
      current.style.pointerEvents="";
    },380);
  }

  // Show next with slide in
  next.style.transform=`translateX(${dir*100}%)`;
  next.style.opacity="0";
  next.style.transition="none";
  next.classList.add("active");
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      next.style.transition="transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.38s ease";
      next.style.transform="translateX(0)";
      next.style.opacity="1";
      setTimeout(()=>{
        next.style.transform="";
        next.style.opacity="";
        next.style.transition="";
      },390);
    });
  });

  _lastView=current?.id||null;
  window.scrollTo(0,0);
}

// ── MERCADO PAGO ─────────────────────────────────────────────────────────────
function isPro(){ return userData?.plan==="pro"; }
function isSegmentFree(segId,phaseId){
  if(phaseId==="f1") return true;
  if(segId==="gramatica"){
    const FREE_GRAMMAR=["present_simple","present_continuous","past_simple","past_continuous","present_perfect","future","modal_verbs","prepositions","articles","pronouns","there_forms","false_friends_grammar"];
    return FREE_GRAMMAR.includes(phaseId);
  }
  return false;
}

// ── STREAK ────────────────────────────────────────────────────────────────────
async function updateStreak(){
  const today=new Date().toISOString().slice(0,10);
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const lastLogin=userData.lastLoginDate||"";

  if(lastLogin!==today){
    // Archive yesterday's XP
    userData.xpYesterday=userData.xpToday||0;
    userData.xpToday=0;
    userData.lastLoginDate=today;

    // Streak RESET only — increment only happens via updateStreakOnExercise
    // If lastExerciseDate is set and older than yesterday, the streak is broken
    const lastEx=userData.lastExerciseDate||"";
    if(lastEx && lastEx<yesterday && (userData.streak||0)>0){
      const freezes = userData.streakFreezes||0;
      if(freezes>0){
        userData.streakFreezes = freezes-1;
        setTimeout(()=>showXpToast("🛡️ Streak protegido pelo escudo!"),800);
      } else {
        userData.streak=0;
      }
    }

    const save={lastLoginDate:today,xpYesterday:userData.xpYesterday,xpToday:0};
    if(userData.streak===0) save.streak=0;
    if(userData.streakFreezes!==undefined) save.streakFreezes=userData.streakFreezes;
    await saveProgressSafe(currentUser.uid,save,true);
  }

  updateStreakFireDisplay();
}

// Called whenever user completes an exercise — increments streak for first exercise of the day
async function updateStreakOnExercise(){
  if(!currentUser||!userData) return;
  const today=new Date().toISOString().slice(0,10);
  const lastEx=userData.lastExerciseDate||"";
  if(lastEx===today){ updateStreakFireDisplay(); return; } // already counted today

  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  let streak=userData.streak||0;
  streak = (lastEx===yesterday) ? streak+1 : 1;

  userData.streak=streak;
  userData.lastExerciseDate=today;

  const elSt=document.getElementById("dash-streak");
  if(elSt) elSt.textContent=streak;
  updateStreakFireDisplay();

  await saveProgressSafe(currentUser.uid,{streak,lastExerciseDate:today},true);

  // Earn a shield every 7-day streak milestone
  if(streak%7===0 && streak>0){
    const cur=userData.streakFreezes||0;
    if(cur<3){
      userData.streakFreezes=cur+1;
      await saveProgressSafe(currentUser.uid,{streakFreezes:cur+1},false);
      setTimeout(()=>showXpToast("🛡️ Escudo de streak ganho! ("+userData.streakFreezes+"/3)"),600);
    }
  }
  updateShieldDisplay();
}

// Updates the header fire icon: bright if exercised today, dimmed if not
function updateStreakFireDisplay(){
  const today=new Date().toISOString().slice(0,10);
  const active=userData?.lastExerciseDate===today;
  const streak=userData?.streak||0;

  const elSt=document.getElementById("dash-streak");
  if(elSt) elSt.textContent=streak;

  const elStH=document.getElementById("dash-header-streak");
  const elStHV=document.getElementById("dash-header-streak-val");
  if(elStH&&elStHV){
    elStHV.textContent=streak;
    elStH.style.display=streak>=1?"flex":"none";
    if(streak>=1) elStH.setAttribute("data-fire",active?"on":"off");
  }
  updateShieldDisplay();
}

function updateShieldDisplay(){
  const freezes=userData?.streakFreezes||0;
  const el=document.getElementById("dash-streak-shields");
  if(el){
    el.style.display=freezes>0?"flex":"none";
    const cnt=document.getElementById("dash-shield-count");
    if(cnt) cnt.textContent=freezes;
  }
  // Header pill shield
  const hel=document.getElementById("dash-header-shields");
  if(hel){
    hel.style.display=freezes>0?"flex":"none";
    const hcnt=document.getElementById("dash-header-shield-count");
    if(hcnt) hcnt.textContent=freezes;
  }
}

// ── GREETING ──────────────────────────────────────────────────────────────────
const GREET_LINES = {
  morning: {
    en: [
      "You've got this!",
      "Make today count!",
      "Fresh start, fresh words!",
      "Hope you have a great day!",
      "Consistency is your superpower!",
      "Another day, another step forward!",
      "Every morning is a fresh chance!",
      "Progress over perfection!",
      "One lesson closer to fluency!",
      "Great minds practice daily!",
      "Small effort, big results over time!",
      "Good things take time — keep going!",
      "A new day, a new opportunity!",
      "You're building something real here!",
      "Let's make the most of today!",
    ],
    pt: [
      "Você consegue!",
      "Faça hoje valer a pena!",
      "Novo dia, novas palavras!",
      "Espero que tenha um ótimo dia!",
      "Consistência é o seu superpoder!",
      "Mais um dia, mais um passo!",
      "Cada manhã é uma nova chance!",
      "Progresso acima da perfeição!",
      "Um passo a mais rumo à fluência!",
      "Grandes mentes praticam todo dia!",
      "Pequeno esforço, grandes resultados!",
      "Boas coisas levam tempo — continue!",
      "Novo dia, nova oportunidade!",
      "Você está construindo algo de verdade!",
      "Vamos aproveitar o dia ao máximo!",
    ],
  },
  afternoon: {
    en: [
      "Keep the momentum going!",
      "Good to have you back!",
      "A few minutes goes a long way!",
      "You're doing great, keep going!",
      "Every session counts!",
      "Small steps, big results!",
      "Your future self will thank you!",
      "Stay focused, you're getting there!",
      "One mission at a time!",
      "You're closer than you think!",
      "You're making real progress!",
      "Glad you're here today!",
      "A little practice goes a long way!",
      "Keep it up — it's working!",
      "This is where habits are built!",
    ],
    pt: [
      "Mantém o ritmo!",
      "Bom ter você de volta!",
      "Alguns minutos fazem toda a diferença!",
      "Você está indo bem, não para!",
      "Cada sessão conta!",
      "Passos pequenos, resultados grandes!",
      "Seu futuro eu vai agradecer!",
      "Foco — você está chegando lá!",
      "Uma missão de cada vez!",
      "Você está mais perto do que imagina!",
      "Você está evoluindo de verdade!",
      "Fico feliz em te ver por aqui!",
      "Um pouco de prática faz muito!",
      "Continua — está funcionando!",
      "É aqui que os hábitos se formam!",
    ],
  },
  evening: {
    en: [
      "End the day with a win!",
      "Don't break the streak!",
      "A little practice before bed!",
      "Evenings are great for review!",
      "Sleep better knowing you practiced!",
      "The best time to review is now!",
      "Quiet hours, clear mind!",
      "Finish strong today!",
      "Glad you carved out some time!",
      "You showed up — that's what matters!",
      "A few minutes before bed makes a difference!",
      "Winding down? A little English helps!",
      "Great job fitting it in today!",
      "The day isn't over yet — let's go!",
      "One more session before you rest!",
    ],
    pt: [
      "Termina o dia com uma vitória!",
      "Não quebra o streak!",
      "Um pouquinho antes de dormir!",
      "À noite é ótimo para revisar!",
      "Dorme melhor sabendo que praticou!",
      "Melhor hora pra revisar é agora!",
      "Hora calma, mente tranquila!",
      "Termina forte hoje!",
      "Último esforço — você merece!",
      "Você apareceu — isso é o que importa!",
      "Fecha o dia com algo de valor!",
      "Que bom que você reservou um tempo!",
      "Você apareceu — isso é o que importa!",
      "Alguns minutos antes de dormir ajudam muito!",
      "Encerrando o dia? Um inglês cai bem!",
      "Ótimo por encaixar isso na sua rotina!",
      "O dia ainda não acabou — vamos lá!",
      "Mais uma sessão antes de descansar!",
    ],
  },
};

function buildGreeting(name){
  const h=new Date().getHours();
  const period = h<12?"morning":h<18?"afternoon":"evening";
  const timeEmoji = h<12?"☀️":h<18?"⚡":"🌙";
  const timeEN = h<12?"Good morning":h<18?"Good afternoon":"Good evening";
  const timeGreet = h<12?t("good_morning"):h<18?t("good_afternoon"):t("good_evening");

  const lines = GREET_LINES[period];
  const idx = Math.floor(Math.random()*lines.en.length);

  const el=id=>document.getElementById(id);
  if(el("greeting-hi")) el("greeting-hi").textContent="";
  if(el("greeting-time-en")) el("greeting-time-en").textContent=`${timeEN} — ${lines.en[idx]}, ${name}! ${timeEmoji}`;
  const ptLine = el("greeting-time-pt");
  if(ptLine){
    if(_lang==="en"){
      ptLine.style.display="none";
    } else {
      ptLine.style.display="";
      ptLine.textContent=`${timeGreet} — ${lines.pt[idx]}, ${name}! ${timeEmoji}`;
    }
  }
  if(el("greeting-motivational")) el("greeting-motivational").style.display="none";
}

function buildDate(){
  const d=new Date();
  const day=d.getDate();
  const suffix=day===1||day===21||day===31?"st":day===2||day===22?"nd":day===3||day===23?"rd":"th";
  const weekday=d.toLocaleDateString("en-US",{weekday:"long"});
  const month=d.toLocaleDateString("en-US",{month:"long"});
  const el=document.getElementById("dash-date");
  if(el) el.textContent=`${weekday}, ${month} ${day}${suffix}`;
}

// ── DAILY MISSIONS ─────────────────────────────────────────────────────────────
// ── MISSÕES DIÁRIAS DINÂMICAS ────────────────────────────────────────────────
// Variam por segmento do usuário + dia da semana
// Mudam apenas quando: (1) todas concluídas E (2) passou da meia-noite

const DAILY_POOL = {
  // Missões genéricas — para qualquer segmento
  generic: [
    {id:"dm_ex3",   icon:"⚡", pt:"Complete 3 exercícios",       en:"Complete 3 exercises",       key:"dailyExercises", target:3, xp:30},
    {id:"dm_perf2", icon:"🌟", pt:"Acerte 2 com nota 10",        en:"Score perfect twice",         key:"dailyPerfect",   target:2, xp:25},
    {id:"dm_ex5",   icon:"🔥", pt:"Complete 5 exercícios",       en:"Complete 5 exercises",        key:"dailyExercises", target:5, xp:50},
    {id:"dm_perf3", icon:"💎", pt:"3 respostas perfeitas",       en:"3 perfect answers",           key:"dailyPerfect",   target:3, xp:40},
    {id:"dm_voice", icon:"🎤", pt:"Use o microfone 2 vezes",     en:"Use voice 2 times",           key:"dailyVoice",     target:2, xp:30},
    {id:"dm_streak",icon:"🏆", pt:"5 acertos seguidos",          en:"5 answers in a row",          key:"dailyStreak",    target:5, xp:45},
    {id:"dm_fc3",   icon:"🃏", pt:"Revise 3 flashcards",         en:"Review 3 flashcards",         key:"dailyFlashcard", target:3, xp:20},
    {id:"dm_mem1",  icon:"🧠", pt:"Complete 1 jogo de memória",  en:"Complete 1 memory game",      key:"dailyMemory",    target:1, xp:25},
    {id:"dm_dlg1",  icon:"💬", pt:"Pratique 1 diálogo",          en:"Practice 1 dialogue",         key:"dailyDialogue",  target:1, xp:30},
    {id:"dm_write", icon:"✍️", pt:"Escreva 1 redação",           en:"Write 1 essay",               key:"dailyWriting",   target:1, xp:40},
  ],
  // Missões específicas por segmento
  maritimo:    [{id:"dm_mar1", icon:"⚓", pt:"1 lição marítima",         en:"1 maritime lesson",          key:"dailySegment",   target:1, xp:20}],
  comex:       [{id:"dm_com1", icon:"🌍", pt:"1 lição de COMEX",         en:"1 COMEX lesson",             key:"dailySegment",   target:1, xp:20}],
  offshore:    [{id:"dm_off1", icon:"🛢️", pt:"1 lição de offshore",      en:"1 offshore lesson",          key:"dailySegment",   target:1, xp:20}],
  hotelaria:   [{id:"dm_hot1", icon:"🏨", pt:"1 lição de hotelaria",     en:"1 hospitality lesson",       key:"dailySegment",   target:1, xp:20}],
  restaurantes:[{id:"dm_res1", icon:"🍽️", pt:"1 lição de restaurante",   en:"1 restaurant lesson",        key:"dailySegment",   target:1, xp:20}],
  aeroporto:   [{id:"dm_aer1", icon:"✈️", pt:"1 lição de aeroporto",     en:"1 airport lesson",           key:"dailySegment",   target:1, xp:20}],
  corporativo: [{id:"dm_cor1", icon:"💼", pt:"1 lição corporativa",      en:"1 corporate lesson",         key:"dailySegment",   target:1, xp:20}],
  cruzeiros:   [{id:"dm_cru1", icon:"🛳️", pt:"1 lição de cruzeiros",    en:"1 cruise lesson",            key:"dailySegment",   target:1, xp:20}],
};

// Gera 3 missões do dia baseadas no segmento + seed do dia
function getDailyMissions(segmentId) {
  const today = new Date().toISOString().slice(0,10); // "2025-06-04"
  const seed = today.split("-").reduce((a,b)=>a+parseInt(b),0); // número do dia

  const segMission = (DAILY_POOL[segmentId]||DAILY_POOL.maritimo)[0];
  const pool = DAILY_POOL.generic;

  // Pegar 2 missões genéricas diferentes usando seed do dia
  const idx1 = seed % pool.length;
  const idx2 = (seed + 3) % pool.length;
  const m1 = pool[idx1];
  const m2 = pool[idx2 === idx1 ? (idx2+1)%pool.length : idx2];

  return [segMission, m1, m2];
}

// getDailyDef: retorna as missões do dia para o segmento atual do usuário
function getDailyDef() {
  const seg = userData?.diagnosisAnswers?.segment || currentSegmentId || "maritimo";
  return getDailyMissions(seg);
}

// Compatibilidade — DAILY_DEF agora é dinâmico
const DAILY_DEF = getDailyMissions("maritimo"); // fallback inicial

function getTodayKey(){ return new Date().toISOString().slice(0,10); }
function getDailyProgress(){
  const today=getTodayKey();
  const saved=(userData?.dailyProgress)||{};
  if(saved.date!==today){
    if(saved.allComplete){
      // Completed — fresh start
      return {date:today,allComplete:false};
    } else {
      // Not completed — carry all progress keys forward
      const carried={date:today,allComplete:false};
      Object.keys(saved).forEach(k=>{ if(k!=='date'&&k!=='allComplete') carried[k]=saved[k]; });
      return carried;
    }
  }
  return saved;
}
async function updateDailyProgress(type){
  const dp=getDailyProgress();
  const wasComplete=dp.allComplete||false;
  const todayMissions=getDailyDef();
  // Check if missions were ALREADY all done before this update (carry-forward false positive)
  const alreadyDoneBeforeUpdate=!wasComplete&&todayMissions.every(dm=>(dp[dm.key]||0)>=(dm.target));

  if(type==="exercise")  dp.dailyExercises = Math.min((dp.dailyExercises||0)+1, 99);
  if(type==="perfect")   dp.dailyPerfect   = Math.min((dp.dailyPerfect||0)+1,   99);
  if(type==="segment")   dp.dailySegment   = Math.min((dp.dailySegment||0)+1,   99);
  if(type==="flashcard") dp.dailyFlashcard = Math.min((dp.dailyFlashcard||0)+1, 99);
  if(type==="memory")    dp.dailyMemory    = Math.min((dp.dailyMemory||0)+1,    99);
  if(type==="dialogue")  dp.dailyDialogue  = Math.min((dp.dailyDialogue||0)+1,  99);
  if(type==="writing")   dp.dailyWriting   = Math.min((dp.dailyWriting||0)+1,   99);
  if(type==="voice")     dp.dailyVoice     = Math.min((dp.dailyVoice||0)+1,     99);
  if(type==="streak")    dp.dailyStreak    = 5;

  const allDone=todayMissions.every(dm=>(dp[dm.key]||0)>=(dm.target));
  if(allDone&&!wasComplete){
    dp.allComplete=true;
    const bonusXP=todayMissions.reduce((a,dm)=>a+dm.xp,0);
    userData.xp=(userData.xp||0)+bonusXP;
    await saveProgressSafe(currentUser.uid,{xp:userData.xp,dailyProgress:dp},true);
    userData.dailyProgress=dp;
    // Cancel the 7pm reminder since user already practiced
    navigator.serviceWorker?.ready.then(reg => reg.active?.postMessage({type:"CANCEL_NOTIF"})).catch(()=>{});
    if(!alreadyDoneBeforeUpdate) showDailyComplete(bonusXP);
  } else {
    userData.dailyProgress=dp;
    saveProgressSafe(currentUser.uid,{dailyProgress:dp});
  }
  renderDailyMissions();
}

function showDailyComplete(bonusXP){
  const emojis=['⭐','✨','🌟','💫','🎉','🏆','🎊'];
  for(let i=0;i<22;i++){
    const el=document.createElement('span');
    el.className='dc-confetti';
    el.textContent=emojis[i%emojis.length];
    el.style.left=`${Math.random()*100}%`;
    el.style.setProperty('--fall-dur',`${1.8+Math.random()*2}s`);
    el.style.setProperty('--fall-delay',`${Math.random()*1}s`);
    el.style.setProperty('--fall-rot',`${(Math.random()-0.5)*720}deg`);
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),4200);
  }
  const overlay=document.getElementById("daily-complete-overlay");
  const xpEl=document.getElementById("daily-complete-xp");
  if(!overlay) return;
  if(xpEl) xpEl.textContent=`+${bonusXP} XP Bônus 🎁`;
  overlay.classList.add("visible");
  SoundFX.complete();
}
function toggleDailyBlock(){
  const block=document.getElementById('daily-block');
  if(!block) return;
  vibrate(10);
  block.classList.toggle('collapsed');
  localStorage.setItem('vic_daily_collapsed',block.classList.contains('collapsed')?'1':'0');
}
function renderDailyMissions(){
  const dp=getDailyProgress();
  const container=document.getElementById("daily-missions-list"); if(!container) return;
  container.innerHTML="";
  let totalDone=0,totalTarget=0;
  const todayMissions=getDailyDef().filter(Boolean);
  todayMissions.forEach(dm=>{
    const current=dp[dm.key]||0, done=current>=dm.target;
    totalDone+=Math.min(current,dm.target); totalTarget+=dm.target;
    const pct=Math.min(Math.round((current/dm.target)*100),100);
    const div=document.createElement("div");
    div.className=`daily-mission-item${done?" completed":""}`;
    div.innerHTML=`<span class="dmi-icon">${dm.icon}</span><div class="dmi-text"><div class="dmi-title">${dm.en}</div><div class="dmi-sub">${dm.pt}</div><div class="dmi-bar-wrap"><div class="dmi-bar" style="width:${pct}%"></div></div><div class="dmi-count">${current}/${dm.target}</div></div><span class="dmi-xp">${done?"✅":"+"+dm.xp+" XP"}</span>`;
    div.addEventListener("click",()=>{
      if(done) return;
      vibrate(22);
      // Route each mission key to the correct destination
      if(dm.key==="dailyFlashcard") { openFlashcards(); return; }
      if(dm.key==="dailyMemory")    { openMemoryFree(); return; }
      if(dm.key==="dailyDialogue")  { openDialogue(); return; }
      if(dm.key==="dailyWriting")   { openWriting(); return; }
      if(dm.key==="dailyVoice")     { openDialogue(); return; } // dialogue has voice practice
      // Exercises, perfect score, streak, segment lesson → segment phases
      const seg = dm.segmentId || userData?.diagnosisAnswers?.segment || currentSegmentId || "maritimo";
      currentSegmentId = seg;
      openSegmentPhases(seg);
    });
    container.appendChild(div);
  });
  const overall=totalTarget>0?Math.round((totalDone/totalTarget)*100):0;
  const ob=document.getElementById("daily-overall-bar"), ot=document.getElementById("daily-overall-pct");
  if(ob) ob.style.width=`${overall}%`;
  if(ot) ot.textContent=dp.allComplete?`✅ Completo!`:`${overall}% feito hoje`;
  // Golden all-complete state + initial collapsed state from localStorage
  const block=document.getElementById('daily-block');
  if(block){
    block.classList.toggle('all-complete',!!dp.allComplete);
    if(!block.hasAttribute('data-init')){
      block.setAttribute('data-init','1');
      if(localStorage.getItem('vic_daily_collapsed')==='1') block.classList.add('collapsed');
    }
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
// Avatar selecionado no cadastro
let _regAvatar = "😎";
function selectRegAvatar(btn){
  document.querySelectorAll(".reg-avatar-opt").forEach(b=>b.classList.remove("selected"));
  btn.classList.add("selected");
  _regAvatar = btn.dataset.emoji;
}

async function handleRegister(){
  const name=document.getElementById("reg-name").value.trim();
  const email=document.getElementById("reg-email").value.trim();
  const pw=document.getElementById("reg-password").value;
  const btn=document.getElementById("btn-register");
  if(!name||!email||!pw) return showAuthError(t("fill_all"));
  if(pw.length<6) return showAuthError(t("min_password"));
  btn.disabled=true; btn.textContent="Criando...";
  showAuthLoading("Criando sua conta... 🚀");
  const timeout=setTimeout(()=>{
    hideAuthLoading();
    btn.disabled=false; btn.textContent="Criar Conta";
    showView("view-auth");
    showAuthError("Tempo esgotado. Verifique sua internet e tente novamente.");
  }, 12000);
  try{
    const newUser = await registerUser(email,pw,name);
    if(_regAvatar){
      _setCfg("avatar", _regAvatar);
      saveProgress(newUser.uid, {avatar: _regAvatar}).catch(()=>{});
    }
    localStorage.setItem("vic_last_email",email);
    clearTimeout(timeout);
    // _handleAuth will be called automatically by onAuthChange
  }
  catch(e){
    clearTimeout(timeout);
    console.error("Register error:", e.code, e.message);
    // If auth user was already created but Firestore failed, the user exists in Auth.
    // Navigate back to auth and show the error regardless of current view.
    hideAuthLoading();
    showView("view-auth");
    showAuthError(translateErr(e.code));
    btn.disabled=false;
    btn.textContent="Criar Conta";
  }
}

let _loadingShownAt=0;
function showAuthLoading(msg){
  const rawQ=LOADING_QUOTES[Math.floor(Math.random()*LOADING_QUOTES.length)];
  const q=typeof rawQ==="string"?{en:rawQ,pt:""}:rawQ;
  const el=document.getElementById("auth-loading");
  if(!el) return;
  el.style.display="flex";
  _loadingShownAt=Date.now();
  const txt=el.querySelector(".auth-loading-text");
  const sub=el.querySelector(".auth-loading-sub");
  const quote=el.querySelector(".auth-loading-quote");
  const quotePT=el.querySelector(".auth-loading-quote-pt");
  if(txt) txt.textContent=msg||"Carregando VIC English...";
  if(sub) sub.textContent="";
  if(quote) quote.textContent=`"${q.en}"`;
  if(quotePT) quotePT.textContent=q.pt;
}
function hideAuthLoading(){
  const el=document.getElementById("auth-loading");
  if(!el) return;
  // Ensure loading shows for at least 3 seconds
  const elapsed=Date.now()-_loadingShownAt;
  const delay=Math.max(0, 4500-elapsed);
  setTimeout(()=>{ el.style.display="none"; }, delay);
}

async function handleLogin(){
  const email=document.getElementById("login-email").value.trim();
  const pw=document.getElementById("login-password").value;
  const remember=document.getElementById("remember-me")?.checked!==false;
  const btn=document.getElementById("btn-login");
  if(!email||!pw) return showAuthError("Preencha email e senha.");
  const reset=()=>{btn.disabled=false;btn.textContent="Entrar";hideAuthLoading();};
  btn.disabled=true; btn.textContent="Entrando...";
  showAuthLoading("Preparando tua jornada no inglês! 🚀");
  const timeout=setTimeout(()=>{hideAuthLoading();reset();showAuthError("Tente novamente.");},8000);
  try{
    // Set persistence based on remember-me
    const {browserLocalPersistence, browserSessionPersistence, setPersistence} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await loginUser(email,pw);
    localStorage.setItem("vic_last_email",email);
    clearTimeout(timeout);
  }
  catch(e){clearTimeout(timeout);hideAuthLoading();showAuthError(translateErr(e.code));reset();}
}
async function handleGoogle(){
  const btn=document.getElementById("btn-google");
  const reset=()=>{if(btn){btn.disabled=false;btn.textContent="Entrar com Google";}hideAuthLoading();};
  if(btn){btn.disabled=true;btn.textContent="Aguarde...";}
  showAuthLoading("Abrindo login do Google... ⭐");
  // 30s timeout for Google popup
  const t=setTimeout(()=>{hideAuthLoading();reset();showAuthError("Tempo esgotado. Tente novamente.");},30000);
  try{
    await loginWithGoogle();
    clearTimeout(t);
    // _handleAuth will fire via onAuthChange
  }catch(e){
    clearTimeout(t);
    hideAuthLoading();
    reset();
    if(e.code==="auth/popup-closed-by-user") showAuthError("Login cancelado.");
    else if(e.code==="auth/popup-blocked") showAuthError("Popup bloqueado. Permita popups e tente novamente.");
    else if(e.code==="auth/network-request-failed") showAuthError("Sem conexão. Verifique sua internet.");
    else showAuthError("Erro no Google: "+e.message.slice(0,50));
  }
}

async function handleAnon(){
  const btn=document.getElementById("btn-anon");
  if(btn){btn.disabled=true;btn.textContent="Entrando...";}
  showAuthLoading("Preparando seu acesso... 💪");
  // Reuse existing guest UID or create a new one — no Firebase Auth call
  let uid=localStorage.getItem("vic_guest_uid");
  if(!uid){ uid="guest_"+Date.now(); localStorage.setItem("vic_guest_uid",uid); }
  const fakeUser={uid, displayName:"Visitante", email:"", isAnonymous:true, isLocalGuest:true, photoURL:null};
  hideAuthLoading();
  if(btn){btn.disabled=false;btn.textContent=t("login_anon");}
  try{ await loadDashboard(fakeUser); }
  catch(e){ console.error("Guest dashboard error:",e); showAuthError("Tente novamente."); }
}
function showAuthError(msg){const e=document.getElementById("auth-error");e.textContent=msg;e.style.display="block";setTimeout(()=>e.style.display="none",7000);}
function translateErr(c){return{"auth/email-already-in-use":"Email já cadastrado. Use o botão Entrar.","auth/invalid-email":"Email inválido. Verifique e tente novamente.","auth/weak-password":"Senha muito fraca. Use pelo menos 6 caracteres.","auth/user-not-found":"Usuário não encontrado. Verifique o email.","auth/wrong-password":"Senha incorreta.","auth/invalid-credential":"Email ou senha incorretos.","auth/too-many-requests":"Muitas tentativas. Aguarde alguns minutos e tente novamente.","auth/network-request-failed":"Sem conexão com a internet. Verifique o Wi-Fi e tente novamente.","auth/operation-not-allowed":"Cadastro por email está desativado no servidor.","auth/unauthorized-domain":"Domínio não autorizado. Contate o suporte.","auth/internal-error":"Erro interno do servidor. Tente novamente em instantes.","permission-denied":"Erro de permissão no banco de dados. Contate o suporte."}[c]||`Erro ao criar conta (${c||"desconhecido"}). Recarregue a página e tente novamente.`;}
function switchTab(t){document.querySelectorAll(".auth-tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".auth-form").forEach(x=>x.classList.remove("active"));document.getElementById(`tab-${t}`).classList.add("active");document.getElementById(`form-${t}`).classList.add("active");document.getElementById("auth-error").style.display="none";}

// ── DIAGNOSIS ─────────────────────────────────────────────────────────────────
const DIAG_KEYS = ["motivo","segment","difficulty"]; // 3 steps de opções + 1 nota livre

function skipDiagnosis(){
  // Pular diagnóstico e ir direto para o app
  localStorage.setItem("vic_onboarding_done","1");
  renderDashboard();
  showView("view-dashboard");
}

function startDiagnosis(){
  diagStep=0; diagAnswers={};
  _selectedSegments = []; _selectedDifficulties = []; // resetar seleções
  // Esconder botões do step de segmentos
  const confirmBtn = document.getElementById("btn-confirm-segments");
  if(confirmBtn) confirmBtn.style.display = "none";
  const skipSegBtn = document.getElementById("btn-skip-segments");
  if(skipSegBtn) skipSegBtn.style.display = "none";
  // Limpar seleções anteriores
  document.querySelectorAll(".diag-option-multi").forEach(b=>b.classList.remove("selected"));
  document.querySelectorAll(".diag-step").forEach(s=>s.classList.remove("active"));
  document.getElementById("diag-step-0")?.classList.add("active");
  renderDiagProgress(); showView("view-diagnosis");
}

function renderDiagProgress(){
  const c=document.getElementById("diag-progress"); if(!c) return; c.innerHTML="";
  const total=5; // 3 perguntas + nota + resultado
  for(let i=0;i<total;i++){
    const d=document.createElement("div");
    d.className=`diag-dot ${i<diagStep?"done":""}`;
    c.appendChild(d);
  }
}

// Segmentos selecionados no diagnóstico (múltipla seleção)
let _selectedSegments = [];

function handleDiagSegmentToggle(val, btn){
  const idx = _selectedSegments.indexOf(val);
  if(idx >= 0){
    _selectedSegments.splice(idx, 1);
    btn.classList.remove("selected");
  } else {
    _selectedSegments.push(val);
    btn.classList.add("selected");
  }
  // Mostrar botão confirmar quando tem pelo menos 1 selecionado
  const confirmBtn = document.getElementById("btn-confirm-segments");
  const skipSegBtn = document.getElementById("btn-skip-segments");
  if(confirmBtn){
    confirmBtn.style.display = _selectedSegments.length > 0 ? "block" : "none";
    confirmBtn.textContent = _selectedSegments.length > 1
      ? `Confirmar ${_selectedSegments.length} segmentos →`
      : "Confirmar →";
  }
  if(skipSegBtn) skipSegBtn.style.display = _selectedSegments.length > 0 ? "block" : "none";
}

function confirmSegments(){
  if(_selectedSegments.length === 0) return;
  diagAnswers.segments = _selectedSegments;
  // Segmento principal = primeiro selecionado
  diagAnswers.segment = _selectedSegments[0];

  // Personalizar placeholder da nota
  const placeholders = {
    maritimo:"Ex: Quero falar com tripulantes estrangeiros no porto...",
    comex:"Ex: Quero negociar com fornecedores internacionais...",
    offshore:"Ex: Preciso entender procedimentos de segurança na plataforma...",
    hotelaria:"Ex: Quero atender hóspedes estrangeiros na recepção...",
    restaurantes:"Ex: Preciso entender pedidos de clientes internacionais...",
    aeroporto:"Ex: Quero entender passageiros estrangeiros...",
    corporativo:"Ex: Quero participar de reuniões em inglês...",
    cruzeiros:"Ex: Quero me comunicar com passageiros a bordo...",
    saude:"Ex: Preciso atender pacientes estrangeiros...",
    outro:"Ex: Quero melhorar meu inglês para crescer na carreira...",
  };
  const ta = document.getElementById("diag-personal-note");
  if(ta) ta.placeholder = placeholders[_selectedSegments[0]] || placeholders.outro;

  // Avançar para próximo step
  const stepEl = document.getElementById("diag-step-1");
  if(stepEl) stepEl.classList.remove("active");
  diagStep++; renderDiagProgress();
  const next = document.getElementById(`diag-step-${diagStep}`);
  if(next){
    next.classList.add("active");
    // Scroll para o topo do step
    next.scrollIntoView({behavior:"smooth", block:"start"});
  }
}

let _selectedDifficulties = [];

function handleDiagOption(val,stepEl){
  // Step 1 = segmentos → múltipla seleção
  if(stepEl && stepEl.id === "diag-step-1"){
    const btn = stepEl.querySelector(`.diag-option[data-value="${val}"]`);
    if(btn) handleDiagSegmentToggle(val, btn);
    return;
  }

  // Step 2 = dificuldades → múltipla seleção
  if(stepEl && stepEl.id === "diag-step-2"){
    const btn = stepEl.querySelector(`.diag-option[data-value="${val}"]`);
    if(!btn) return;
    const idx = _selectedDifficulties.indexOf(val);
    if(idx >= 0){ _selectedDifficulties.splice(idx,1); btn.classList.remove("selected"); }
    else { _selectedDifficulties.push(val); btn.classList.add("selected"); }
    const confirmBtn = document.getElementById("btn-confirm-difficulty");
    if(confirmBtn) confirmBtn.style.display = _selectedDifficulties.length > 0 ? "block" : "none";
    return;
  }

  stepEl.querySelectorAll(".diag-option").forEach(b=>b.classList.remove("selected"));
  [...stepEl.querySelectorAll(".diag-option")].find(b=>b.dataset.value===val)?.classList.add("selected");
  // Salvar resposta com chave correta
  const key = DIAG_KEYS[diagStep]||"extra";
  diagAnswers[key] = val;

  // Personalizar placeholder da nota baseado no segmento escolhido
  if(key==="segment"){
    const placeholders = {
      maritimo:"Ex: Quero falar com tripulantes estrangeiros no porto sem travar...",
      comex:"Ex: Quero negociar com fornecedores internacionais e entender contratos...",
      offshore:"Ex: Preciso entender procedimentos de segurança e comunicação na plataforma...",
      hotelaria:"Ex: Quero atender hóspedes estrangeiros com confiança na recepção...",
      restaurantes:"Ex: Preciso entender pedidos e me comunicar com clientes internacionais...",
      aeroporto:"Ex: Quero entender passageiros estrangeiros e fazer anúncios em inglês...",
      corporativo:"Ex: Quero participar de reuniões em inglês e escrever e-mails profissionais...",
      outro:"Ex: Quero melhorar meu inglês para crescer na carreira e vida pessoal...",
    };
    const ta = document.getElementById("diag-personal-note");
    if(ta && placeholders[val]) ta.placeholder = placeholders[val];
  }

  setTimeout(()=>{
    stepEl.classList.remove("active");
    diagStep++;
    renderDiagProgress();
    const nextStep = document.getElementById(`diag-step-${diagStep}`);
    if(nextStep) nextStep.classList.add("active");
    else document.getElementById("diag-step-3")?.classList.add("active");
  },320);
}

// Personalizar resultado do diagnóstico com base no motivo
function getDiagResultText(){
  const motivo = diagAnswers.motivo||"ambos";
  const seg = diagAnswers.segment||"—";
  const segNames = {
    maritimo:"Marítimo",comex:"COMEX",offshore:"Offshore",
    hotelaria:"Hotelaria",restaurantes:"Restaurantes",
    aeroporto:"Aeroporto",corporativo:"Corporativo",outro:"Geral"
  };
  const segName = segNames[seg]||seg;

  if(motivo==="profissional"){
    return { icon:"💼", title:"Perfil Profissional criado!", sub:`Área: ${segName} • Foco total em inglês do trabalho` };
  } else if(motivo==="pessoal"){
    return { icon:"🌍", title:"Perfil Pessoal criado!", sub:`Área: ${segName} • Foco em fluência e comunicação geral` };
  }
  return { icon:"🚀", title:"Perfil Completo criado!", sub:`Área: ${segName} • Mix profissional + pessoal` };
}

let diagVoiceRec=null;
function startDiagVoice(){
  const btn=document.getElementById("btn-diag-voice");
  const status=document.getElementById("diag-voice-status");
  const ta=document.getElementById("diag-personal-note");
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){status.textContent="❌ Não suportado";return;}
  if(diagVoiceRec){diagVoiceRec.stop();diagVoiceRec=null;btn.textContent="🎤 Falar";status.textContent="";return;}
  diagVoiceRec=new SR(); diagVoiceRec.lang="pt-BR"; diagVoiceRec.continuous=true; diagVoiceRec.interimResults=true;
  btn.textContent="⏹ Parar"; status.textContent="🔴 Ouvindo...";
  diagVoiceRec.onresult=e=>{let t="";for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript+" ";ta.value=t.trim();};
  diagVoiceRec.onerror=()=>{btn.textContent="🎤 Falar";status.textContent="❌ Erro";diagVoiceRec=null;};
  diagVoiceRec.onend=()=>{btn.textContent="🎤 Falar";status.textContent=ta.value?"✅ Transcrito!":"";diagVoiceRec=null;};
  diagVoiceRec.start();
}
async function finishDiagnosisNote(){
  const note=document.getElementById("diag-personal-note")?.value?.trim()||"";
  if(diagVoiceRec){try{diagVoiceRec.stop();}catch(e){}}
  diagAnswers.personalNote=note;
  // Definir segmento atual
  const diagSeg = diagAnswers.segment||"maritimo";
  if(getSegment(diagSeg)) currentSegmentId=diagSeg;
  diagStep++; renderDiagProgress();
  document.getElementById("diag-step-3")?.classList.remove("active");
  // Mostrar resultado personalizado
  const diagResult = getDiagResultText();
  const _ri = document.getElementById("diag-result-icon");   if(_ri) _ri.textContent = diagResult.icon;
  const _rl = document.getElementById("diag-result-level");  if(_rl) _rl.textContent = diagResult.title;
  const _rs = document.getElementById("diag-result-sub");    if(_rs) _rs.textContent = diagResult.sub;
  document.getElementById("diag-step-result")?.classList.add("active");
}
async function finishDiagnosis(){
  if(currentUser){
    await saveProgress(currentUser.uid,{diagnosisAnswers:diagAnswers,currentMission:{segmentId:currentSegmentId,phaseId:"f1",missionId:getSegment(currentSegmentId)?.phases[0]?.missions[0]?.id||"",phraseIndex:0}});
    userData.diagnosisAnswers=diagAnswers;
  }
  startLevelTest();
}


// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// SAVE BATCH + OFFLINE QUEUE
// Non-urgent saves are merged and written after 4s of inactivity.
// Urgent saves (streak, mission complete, payment) flush immediately.
// Offline queue is keyed by UID so updates merge instead of stacking.
// ══════════════════════════════════════════════════════════════════════════════
const OFFLINE_QUEUE_KEY = "vic_offline_queue";

function offlineEnqueue(uid, updates){
  if(uid?.startsWith("guest_")) return;
  try{
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||"{}");
    q[uid] = { ...(q[uid]||{}), ...updates, _ts: Date.now() };
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  }catch(e){}
}

async function offlineFlush(){
  try{
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||"{}");
    const uids = Object.keys(q);
    if(!uids.length) return;
    const failed = {};
    for(const uid of uids){
      const { _ts, ...updates } = q[uid];
      try{
        await saveProgress(uid, updates);
      }catch(e){
        if(Date.now() - (_ts||0) < 86400000) failed[uid] = q[uid];
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
    const n = uids.length - Object.keys(failed).length;
    if(n > 0) console.log(`✅ Synced ${n} queued saves`);
  }catch(e){ console.warn("offlineFlush error:", e); }
}

// Batch state
let _saveBatch = null;  // { uid, updates }
let _saveTimer = null;

function _flushSaveBatch(){
  clearTimeout(_saveTimer); _saveTimer = null;
  if(!_saveBatch) return;
  const { uid, updates } = _saveBatch; _saveBatch = null;
  _doSave(uid, updates);
}

async function _doSave(uid, updates){
  if(!navigator.onLine){ offlineEnqueue(uid, updates); return; }
  try{
    await saveProgress(uid, updates);
    // Clear from offline queue on success
    try{
      const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||"{}");
      if(q[uid]){ delete q[uid]; localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); }
    }catch(e){}
  }catch(e){
    offlineEnqueue(uid, updates);
    console.warn("Save queued:", e.message);
  }
}

// saveProgressSafe — use this everywhere instead of saveProgress directly.
// urgent=true  → flush batch immediately (mission complete, streak, payment)
// urgent=false → debounce 4s (per-answer XP, daily progress, etc.)
async function saveProgressSafe(uid, updates, urgent = false){
  if(uid?.startsWith("guest_")) return saveProgress(uid, updates);
  if(_saveBatch?.uid === uid){
    Object.assign(_saveBatch.updates, updates);
  } else {
    _flushSaveBatch();
    _saveBatch = { uid, updates: { ...updates } };
  }
  if(urgent){
    _flushSaveBatch();
  } else {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_flushSaveBatch, 4000);
  }
}

// Flush when app is backgrounded or closed; re-sync arrays when tab becomes visible again
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    _flushSaveBatch();
  } else {
    // Tab regained focus — quietly merge remote data to protect against two-tab overwrites
    if (currentUser && !currentUser.isLocalGuest) {
      getUserData(currentUser.uid).then(fresh => {
        if (!fresh || !userData) return;
        if (Array.isArray(fresh.completedMissions)) {
          userData.completedMissions = [...new Set([...(userData.completedMissions||[]), ...fresh.completedMissions])];
        }
        if (Array.isArray(fresh.badges)) {
          userData.badges = [...new Set([...(userData.badges||[]), ...fresh.badges])];
        }
        if (typeof fresh.xp === "number" && fresh.xp > (userData.xp||0)) {
          userData.xp = fresh.xp;
        }
        if (typeof fresh.streak === "number") {
          userData.streak = fresh.streak;
        }
      }).catch(()=>{});
    }
  }
});
window.addEventListener("pagehide", _flushSaveBatch);

window.addEventListener("online", () => {
  showXpToast("📶 Conexão restaurada! Sincronizando...");
  if(currentUser){ _flushSaveBatch(); offlineFlush(); }
});
window.addEventListener("offline", () => {
  showXpToast("📶 Sem internet — progresso salvo localmente");
});

// ── LEVEL TEST ADAPTATIVO ────────────────────────────────────────────────────
// 15 questões | 5 por nível (A1-A2, B1-B2, C1) | lógica adaptativa
// Acertou 3 seguidas → sobe nível | Errou 2 seguidas → desce nível
// Penalidade: erro em A1/A2 trava máximo em B1

const LT_QUESTIONS = {
  all: [
    // ── A1 ──────────────────────────────────────────────────────────────────
    {id:"q1", type:"mcq", level:"A1",
     title:"Vocabulário — A1",
     question:"What does 'deadline' mean?",
     options:["Prazo","Reunião","Contrato","Relatório"], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q2", type:"mcq", level:"A1",
     title:"Gramática — A1",
     question:"Choose the correct sentence:",
     options:["He works on an offshore platform.","I works in a ship.","She work every day.","They works together."], correct:0,
     pts:{correct:1,wrong:0}},

    // ── A2 ──────────────────────────────────────────────────────────────────
    {id:"q3", type:"mcq", level:"A2",
     title:"Passado Simples — A2",
     question:"She _____ the report before the meeting started.",
     options:["sent","send","sends","was send"], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q4", type:"mcq", level:"A2",
     title:"Vocabulário — Trabalho",
     question:"Your supervisor asks: 'Please send me the _____ with all the numbers from last month.' What does he want?",
     options:["Report","Schedule","Receipt","Invoice"], correct:0,
     pts:{correct:1,wrong:0}},

    // ── B1 ──────────────────────────────────────────────────────────────────
    {id:"q5", type:"mcq", level:"B1",
     title:"Present Perfect vs Simple Past",
     question:"'We _____ this supplier for 10 years, but last year we changed to another one.'",
     options:["used","have used","are using","use"], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q6", type:"reading", level:"B1",
     title:"Compreensão — B1",
     question:"Read: 'The shipment was delayed due to port congestion, but we expect it to arrive by Thursday.' — What is the main problem?",
     options:["The shipment is late","The goods are damaged","The port is permanently closed","The supplier cancelled the order"], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q7", type:"mcq", level:"B1",
     title:"Condicional Tipo 1",
     question:"'If the client _____ by tomorrow, we will cancel the order.'",
     options:["doesn't confirm","won't confirm","didn't confirm","wouldn't confirm"], correct:0,
     pts:{correct:1,wrong:0}},

    // ── B2 ──────────────────────────────────────────────────────────────────
    {id:"q8", type:"mcq", level:"B2",
     title:"Voz Passiva — B2",
     question:"The safety report _____ before the inspection tomorrow.",
     options:["must be submitted","must submit","must submitted","must have submit"], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q9", type:"mcq", level:"B2",
     title:"Registro Formal — B2",
     question:"Which sentence is correct for a professional email?",
     options:[
       "I am writing with regard to your recent inquiry.",
       "I am writing about your asking.",
       "I write for your inquiry.",
       "I am writing in regard of your question."
     ], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q10", type:"reading", level:"B2",
     title:"Inferência — B2",
     question:"Read: 'Although the quarterly figures exceeded projections, the board expressed concern about the sustainability of current growth rates.' — What is the board worried about?",
     options:[
       "The growth may not continue at this pace",
       "The company lost money this quarter",
       "The projections were wrong",
       "The quarterly report had errors"
     ], correct:0,
     pts:{correct:1,wrong:0}},

    // ── C1 ──────────────────────────────────────────────────────────────────
    {id:"q11", type:"mcq", level:"C1",
     title:"Condicional Misto — C1",
     question:"'If they _____ the safety protocol last year, the accident _____ prevented.'",
     options:[
       "had followed / could have been",
       "followed / could be",
       "have followed / would be",
       "would follow / might be"
     ], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q12", type:"mcq", level:"C1",
     title:"Expressão Idiomática — C1",
     question:"The manager said: 'We need to take ownership of this project.' What does this mean?",
     options:[
       "Be fully responsible for the project's success or failure",
       "Buy shares in the project",
       "Submit a formal ownership document",
       "Assign the project to another team"
     ], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q13", type:"mcq", level:"C1",
     title:"Registro Avançado — C1",
     question:"Which sentence is most appropriate for a formal business proposal?",
     options:[
       "This initiative has the potential to significantly enhance operational efficiency.",
       "We think this idea is really good and you should totally try it.",
       "Doing this will make things way better for everyone.",
       "The company would be a lot more efficient if they did this."
     ], correct:0,
     pts:{correct:1,wrong:0}},

    // ── C2 ──────────────────────────────────────────────────────────────────
    {id:"q14", type:"mcq", level:"C2",
     title:"Nuance de Vocabulário — C2",
     question:"What is the key difference between 'He refused to sign' and 'He declined to sign'?",
     options:[
       "'Refused' implies stronger resistance; 'declined' is more formal and polite",
       "No difference — they mean exactly the same",
       "'Declined' means he was unable to sign; 'refused' means unwilling",
       "'Refused' is only used in legal documents"
     ], correct:0,
     pts:{correct:1,wrong:0}},

    {id:"q15", type:"reading", level:"C2",
     title:"Texto Técnico — C2",
     question:"Read: 'The arbitration clause stipulates that any disputes arising from this agreement shall be resolved through binding arbitration rather than litigation.' — What does this mean for the parties?",
     options:[
       "Disputes must be resolved privately through arbitration, not courts",
       "Disputes must go to court",
       "Either party can choose to litigate",
       "No disputes are allowed under the agreement"
     ], correct:0,
     pts:{correct:1,wrong:0}},
  ]
};

// ── LÓGICA SEQUENCIAL — 15 questões A1→C2 ────────────────────────────────────
let ltTotalQuestions = 15;
let ltCurrentQ = 0;

function buildAdaptiveQueue() {
  ltIndex = 0;
}

function getNextAdaptiveQuestion() {
  return LT_QUESTIONS.all[ltIndex++];
}

function adaptLevel() {} // sequencial — classificação por pontuação final

function calcFinalLevel() {
  if (ltScore >= 14) return { level:"c2", label:"C2 — Fluente 🎓", msg:"Inglês excepcional! Vocabulário, gramática e nuance sob controle total.", color:"#f97316" };
  if (ltScore >= 12) return { level:"c1", label:"C1 — Avançado 🏆", msg:"Impressionante! Você domina inglês profissional com precisão e naturalidade.", color:"#ffd700" };
  if (ltScore >= 10) return { level:"b2", label:"B2 — Intermediário Alto 🌟", msg:"Ótimo nível! Comunicação fluida — pequenos refinamentos para chegar ao topo.", color:"#e4b45c" };
  if (ltScore >= 7)  return { level:"b1", label:"B1 — Intermediário ⭐", msg:"Bom nível! Você se vira bem. Foco em fluência e vocabulário profissional.", color:"#a78bfa" };
  if (ltScore >= 4)  return { level:"a2", label:"A2 — Básico Funcional 📘", msg:"Você tem uma base sólida! Vamos fortalecer o vocabulário e a gramática.", color:"#60a5fa" };
  return               { level:"a1", label:"A1 — Iniciante 🌱", msg:"Todo expert já foi iniciante! Vamos construir seu inglês do zero.", color:"#22c55e" };
}

function startLevelTest(){
  ltIndex=0; ltScore=0; ltCurrentQ=0;
  buildAdaptiveQueue();
  document.getElementById("lt-result").style.display="none";
  document.getElementById("lt-questions-area").style.display="block";
  showView("view-level-test");
  renderLTQuestion();
}

function renderLTQuestion(){
  const q = getNextAdaptiveQuestion();
  if (!q || ltCurrentQ >= ltTotalQuestions) { showLTResult(); return; }

  const total = ltTotalQuestions;
  ltCurrentQ++;
  document.getElementById("lt-counter").textContent=`${ltCurrentQ} / ${total}`;
  document.getElementById("lt-progress-bar").style.width=`${Math.round((ltCurrentQ/total)*100)}%`;

  // Badge do nível da pergunta atual
  const levelColors = {A1:"#22c55e",A2:"#4ade80",B1:"#a78bfa",B2:"#e4b45c",C1:"#ffd700",C2:"#f97316"};
  document.getElementById("lt-title").textContent = q.title;
  document.getElementById("lt-title").style.color = levelColors[q.level]||"#e4b45c";

  let levelBadge = document.getElementById("lt-level-badge");
  if(!levelBadge){
    levelBadge = document.createElement("div");
    levelBadge.id = "lt-level-badge";
    levelBadge.style.cssText="font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;display:inline-block;margin-bottom:8px;";
    document.getElementById("lt-title").parentNode.insertBefore(levelBadge, document.getElementById("lt-title"));
  }
  levelBadge.textContent = q.level;
  levelBadge.style.background = (levelColors[q.level]||"#e4b45c")+"22";
  levelBadge.style.color = levelColors[q.level]||"#e4b45c";
  levelBadge.style.border = `1px solid ${levelColors[q.level]||"#e4b45c"}44`;

  document.getElementById("lt-question").textContent = q.question;
  document.getElementById("lt-feedback").style.display="none";
  ["lt-mc","lt-fill","lt-order"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});

  // ── MCQ ──
  if(q.type==="mcq"||q.type==="reading"){
    const indices=[0,1,2,3];
    const shuffled=shuffle(indices);
    const newCorrect=shuffled.indexOf(q.correct);
    const newOptions=shuffled.map(i=>q.options[i]);
    const wrap=document.getElementById("lt-mc"); wrap.innerHTML=""; wrap.style.display="flex";
    newOptions.forEach((opt,i)=>{
      const btn=document.createElement("button"); btn.className="lt-option"; btn.textContent=opt;
      btn.addEventListener("click",()=>{
        wrap.querySelectorAll(".lt-option").forEach((b,j)=>{b.disabled=true;if(j===newCorrect)b.classList.add("correct");else if(j===i&&i!==newCorrect)b.classList.add("wrong");});
        const correct=(i===newCorrect);
        const pts=correct?q.pts.correct:q.pts.wrong||0;
        ltScore+=pts;
        adaptLevel(correct);
        showLTFeedback(correct?"correct":"tryagain",newOptions[newCorrect],pts);
      });
      wrap.appendChild(btn);
    });
  }

  // ── FILL / ERROR_CORRECTION / TRANSLATION ──
  if(q.type==="fill"||q.type==="error_correction"||q.type==="translation"){
    const inp=document.getElementById("lt-fill-input");
    inp.value=""; inp.disabled=false;
    inp.placeholder=q.placeholder||"";
    document.getElementById("lt-fill").style.display="block";
    // Label especial para tradução
    const fillLabel = document.getElementById("lt-fill-label")||null;
    if(fillLabel){
      fillLabel.textContent = q.type==="translation"?"🇧🇷 → 🇺🇸 Escreva em inglês:":q.type==="error_correction"?"✏️ Reescreva corretamente:":"✏️ Complete:";
      fillLabel.style.display="block";
    }
    document.getElementById("lt-fill-check").onclick=()=>{
      if(inp.disabled) return;
      const res=avaliarResposta(inp.value.trim(),q.answer);
      const pts=res.feedback==="correct"?q.pts.correct:res.feedback==="almost"?(q.pts.almost||0):q.pts.wrong||0;
      ltScore+=pts; inp.disabled=true;
      adaptLevel(res.feedback==="correct");
      showLTFeedback(res.feedback,q.answer,pts);
    };
    inp.onkeydown=e=>{if(e.key==="Enter")document.getElementById("lt-fill-check").click();};
    setTimeout(()=>inp.focus(),100);
  }

  // ── WORD ORDER ──
  if(q.type==="word_order"){
    const wrap=document.getElementById("lt-order"); wrap.style.display="block";
    const zone=document.getElementById("lt-order-zone"); zone.innerHTML="";
    const bank=document.getElementById("lt-order-bank"); bank.innerHTML="";
    let placed=[];
    shuffle([...q.scrambled]).forEach(w=>{
      const btn=document.createElement("button"); btn.className="word-tile"; btn.textContent=w;
      btn.addEventListener("click",()=>{
        if(btn.classList.contains("placed")) return;
        placed.push(w); btn.classList.add("placed");
        const tile=document.createElement("span"); tile.className="word-tile placed-tile"; tile.textContent=w;
        tile.addEventListener("click",()=>{placed.splice(placed.lastIndexOf(w),1);btn.classList.remove("placed");tile.remove();});
        zone.appendChild(tile);
      });
      bank.appendChild(btn);
    });
    document.getElementById("lt-order-check").onclick=()=>{
      const res=avaliarResposta(placed.join(" "),q.answer);
      const pts=res.feedback==="correct"?q.pts.correct:res.feedback==="almost"?(q.pts.almost||0):0;
      ltScore+=pts;
      adaptLevel(res.feedback==="correct");
      showLTFeedback(res.feedback,q.answer,pts);
    };
  }
}

function showLTFeedback(feedback,correct,pts){
  const fb=document.getElementById("lt-feedback");
  if(feedback==="correct"){fb.className="lt-feedback correct";fb.innerHTML=`${t("correct")} <strong>+${pts} pts</strong>`;SoundFX.correct();}
  else if(feedback==="almost"){fb.className="lt-feedback almost";fb.innerHTML=`👍 Quase! Correto: <strong>${correct}</strong> +${pts} pts`;SoundFX.almost();}
  else{fb.className="lt-feedback wrong";fb.innerHTML=`❌ Correto seria: <strong>${correct}</strong>`;SoundFX.wrong();}
  fb.style.display="block";
  setTimeout(()=>{if(ltCurrentQ>=ltTotalQuestions)showLTResult();else renderLTQuestion();},1600);
}

function showLTResult(){
  const result = calcFinalLevel();
  diagAnswers.level = result.level;
  diagAnswers.levelTestCompleted = true;

  document.getElementById("lt-questions-area").style.display="none";
  document.getElementById("lt-result").style.display="block";
  document.getElementById("lt-result-score").textContent=`${ltScore} / ${ltTotalQuestions}`;
  document.getElementById("lt-result-pct").textContent=result.label;
  document.getElementById("lt-result-pct").style.color=result.color||"#e4b45c";
  document.getElementById("lt-result-level").textContent=result.label;
  document.getElementById("lt-result-msg").textContent=result.msg;
  const barPct = {c2:"100%",c1:"90%",b2:"75%",b1:"58%",a2:"38%",a1:"18%"};
  document.getElementById("lt-result-bar").style.width = barPct[result.level]||"18%";
  document.getElementById("lt-result-bar").style.background=result.color||"#e4b45c";
  SoundFX.complete();
}

async function finishLevelTest(){
  const completed = diagAnswers.levelTestCompleted || false;
  if(currentUser){
    await saveProgress(currentUser.uid,{
      diagnosisAnswers:diagAnswers,
      detectedLevel: completed ? diagAnswers.level : (userData.detectedLevel||null),
      levelTestCompleted: completed,
      currentMission:{segmentId:currentSegmentId,phaseId:"f1",missionId:getSegment(currentSegmentId)?.phases[0]?.missions[0]?.id||"",phraseIndex:0}
    });
    userData.diagnosisAnswers=diagAnswers;
    userData.detectedLevel= completed ? diagAnswers.level : (userData.detectedLevel||null);
    userData.levelTestCompleted=completed;
  }
  renderDashboard(); showView("view-dashboard");
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard(user){
  console.log("loadDashboard start:", user.uid);
  currentUser=user;

  // Always build a fallback userData first — so we NEVER crash
  const fallback={
    uid:user.uid,
    name:user.displayName||user.email?.split("@")[0]||"Aluno",
    email:user.email||"",
    xp:0, level:1, streak:0,
    completedMissions:[], plan:"free",
    badges:[]
  };

  // Try to get from Firestore — but never block on failure
  try{
    const remote=await Promise.race([
      getUserData(user.uid),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),5000))
    ]);
    if(remote) userData=remote;
    else{
      // New user — try to create doc
      try{
        await saveProgress(user.uid,{
          name:fallback.name, email:fallback.email,
          xp:0, level:1, streak:0, completedMissions:[], plan:"free",
        });
        const created=await getUserData(user.uid);
        userData=created||fallback;
      }catch(e){
        console.warn("Firestore write failed:", e.message);
        userData=fallback;
      }
    }
  }catch(e){
    console.warn("Firestore read failed, using fallback:", e.message);
    userData=fallback;
  }

  // Sync Google profile photo to Firestore so it appears in leaderboard/admin
  if(user.photoURL && !userData.avatar){
    userData.avatar = user.photoURL;
    _setCfg("avatar", user.photoURL);
    saveProgress(user.uid, { avatar: user.photoURL }).catch(()=>{});
  }

  // Sync local avatar to Firestore if it's missing there (for existing users)
  const localAvatar = _cfg.avatar || localStorage.getItem("vic_avatar");
  if(localAvatar && !userData.avatar){
    userData.avatar = localAvatar;
    saveProgress(user.uid, { avatar: localAvatar }).catch(()=>{});
  }

  // Always proceed to dashboard — never block the user
  try{ await updateStreak(); }catch(e){ console.warn("streak err:", e.message); }

  if(userData.currentMission){
    currentSegmentId  =userData.currentMission.segmentId  ||"maritimo";
    currentPhaseId    =userData.currentMission.phaseId    ||"f1";
    currentMissionId  =userData.currentMission.missionId  ||"vocab_basico";
    currentPhraseIndex=userData.currentMission.phraseIndex||0;
  }

  try{ renderDashboard(); }catch(e){ console.error("renderDashboard error:", e.message, e); }
  // Guarantee daily missions render even if renderDashboard's try-catch swallowed an error
  try{ renderDailyMissions(); }catch(e){ console.error("renderDailyMissions error:", e.message, e); }
  showView("view-dashboard");
  hideAuthLoading();
  initOneSignal();

  // Level test for new users (diagnosis screen removed)
  if(!userData.diagnosisAnswers){
    setTimeout(()=>{ try{ startLevelTest(); }catch(e){ vicLog("level-test","startLevelTest failed",e); } }, 800);
  }
  console.log("✅ Dashboard shown for:", userData.name);
}

// ── GLOSSARY DATA ─────────────────────────────────────────────────────────────

let _proBannerIdx=0;

function rotatProBanner(){
  const t=document.getElementById("pro-banner-title");
  const s=document.getElementById("pro-banner-sub");
  if(!t||!s) return;
  const msg=PRO_MESSAGES[_proBannerIdx%PRO_MESSAGES.length];
  t.textContent=msg.title; s.textContent=msg.sub;
  _proBannerIdx++;
}

function fitUserName(name){
  const el=document.getElementById("dash-username");
  if(!el) return;
  el.textContent=name;
  el.style.fontSize=name.length>14?"12px":name.length>10?"13px":"15px";
}

const CURIOSITIES=[
  // ── FALSE FRIENDS ────────────────────────────────────────────────────────
  "🚨 FALSE FRIEND: 'Actually' não significa 'atualmente' — significa 'na verdade'. Um dos erros mais comuns dos brasileiros!",
  "🚨 FALSE FRIEND: 'Library' não é livraria — é biblioteca! Livraria em inglês é 'bookstore'.",
  "🚨 FALSE FRIEND: 'Parents' não são parentes — são seus pais! Parentes são 'relatives'.",
  "🚨 FALSE FRIEND: 'Push' não é puxar — é empurrar! E 'pull' é puxar. Olha nas portas dos estabelecimentos!",
  "🚨 FALSE FRIEND: 'Pretend' não é pretender — é fingir! 'I pretend to be sick' = Fingi estar doente.",
  "🚨 FALSE FRIEND: 'Assist' não é assistir — é ajudar! 'Assistir' em inglês é 'watch' ou 'attend'.",
  "🚨 FALSE FRIEND: 'Realize' não é realizar — é perceber! 'I realized I was wrong' = Percebi que estava errado.",
  "🚨 FALSE FRIEND: 'Sensible' não é sensível — é sensato! Sensível em inglês é 'sensitive'.",
  "🚨 FALSE FRIEND: 'Fabric' não é fábrica — é tecido/pano! Fábrica em inglês é 'factory' ou 'plant'.",
  "🚨 FALSE FRIEND: 'Lecture' não é leitura — é palestra/aula expositiva! Leitura em inglês é 'reading'.",
  "🚨 FALSE FRIEND: 'Prejudice' não é prejuízo — é preconceito! Prejuízo financeiro é 'loss' ou 'damage'.",
  "🚨 FALSE FRIEND: 'Sympathetic' não é simpático — é compreensivo/empático! Simpático é 'nice' ou 'friendly'.",
  "🚨 FALSE FRIEND: 'College' não é colégio — é faculdade/universidade! Colégio é 'high school'.",
  "🚨 FALSE FRIEND: 'Novel' não é novela — é romance (livro)! Novela brasileira é 'soap opera'.",
  "🚨 FALSE FRIEND: 'Office' não é oficina — é escritório! Oficina mecânica é 'repair shop' ou 'garage'.",
  "🚨 FALSE FRIEND: 'Eventually' não é eventualmente — é no final/por fim! 'Eventually' indica algo que vai acontecer mais tarde.",
  "🚨 FALSE FRIEND: 'Deception' não é decepção — é enganação/fraude! Decepção é 'disappointment'.",
  "🚨 FALSE FRIEND: 'Terrific' não é terrível — é ótimo/incrível! 'That's terrific!' = Que ótimo!",
  "🚨 FALSE FRIEND: 'Exquisite' não é esquisito — é requintado/magnífico! Esquisito é 'weird' ou 'odd'.",
  "🚨 FALSE FRIEND: 'Comprehensive' não é compreensivo — é abrangente/completo! Compreensivo é 'understanding'.",
  "🚨 FALSE FRIEND: 'Argument' não é só argumento — geralmente é briga/discussão! 'They had an argument' = Eles brigaram.",
  "🚨 FALSE FRIEND: 'Attend' não é atender — é comparecer/ir a! 'Atender' o telefone é 'answer the phone'.",
  "🚨 FALSE FRIEND: 'Ingenuity' não é ingenuidade — é criatividade/engenho! Ingenuidade é 'naivety'.",
  "🚨 FALSE FRIEND: 'Polemic' quase não existe em inglês — use 'controversial'! 'That's a controversial topic.'",
  "🚨 FALSE FRIEND: 'Paste' não é pasta — é colar ou massa! Pasta (bolsa) é 'briefcase', pasta de dente é 'toothpaste'.",
  "🚨 FALSE FRIEND: 'Gymnasium' em inglês americano é academia de ginástica. Em inglês britânico, às vezes 'escola secundária'.",
  "🚨 FALSE FRIEND: 'Sane' não é são (saudável) — é mentalmente são/normal! São (de saúde) é 'healthy'.",
  "🚨 FALSE FRIEND: 'Journal' não é jornal — é diário/revista especializada! Jornal (newspaper) é 'newspaper'.",
  "🚨 FALSE FRIEND: 'Reunion' não é reunião de trabalho — é reencontro de pessoas! Reunião de trabalho é 'meeting'.",
  "🚨 FALSE FRIEND: 'Intend' não é entender — é ter a intenção de! Entender é 'understand'.",
  "🚨 FALSE FRIEND: 'Embarrassed' não é embaraçado — é envergonhado/constrangido! 'I'm so embarrassed!' = Que vergonha!",
  "🚨 FALSE FRIEND: 'Preservative' não é preservativo (camisinha) — é conservante de alimento! Preservativo é 'condom'.",
  "🚨 FALSE FRIEND: 'Bore' não é bora (vamos) — é entediar/aborrecer! 'This movie bores me' = Este filme me entedia.",
  // ── HOMÓFONAS ────────────────────────────────────────────────────────────
  "👂 HOMÓFONAS: 'There', 'their' e 'they're' soam iguais — lá / deles / eles são.",
  "👂 HOMÓFONAS: 'To', 'too' e 'two' soam iguais — para / também / dois.",
  "👂 HOMÓFONAS: 'Hear' e 'here' soam iguais — ouvir e aqui.",
  "👂 HOMÓFONAS: 'Read' no presente soa /riid/ — no passado, /rɛd/. Mesma escrita, pronúncias diferentes!",
  "👂 HOMÓFONAS: 'Flower' e 'flour' soam quase iguais — flor e farinha.",
  "👂 HOMÓFONAS: 'Bare' e 'bear' soam iguais — nu/exposto e urso.",
  "👂 HOMÓFONAS: 'Sea' e 'see' soam iguais — mar e ver.",
  "👂 HOMÓFONAS: 'Sun' e 'son' soam iguais — sol e filho.",
  "👂 HOMÓFONAS: 'Night' e 'knight' soam iguais — noite e cavaleiro.",
  "👂 HOMÓFONAS: 'Write', 'right' e 'rite' soam iguais — escrever, certo/direito, ritual.",
  "👂 HOMÓFONAS: 'Knew' e 'new' soam iguais — sabia e novo.",
  "👂 HOMÓFONAS: 'Knot' e 'not' soam iguais — nó e não.",
  "👂 HOMÓFONAS: 'Whole' e 'hole' soam iguais — inteiro e buraco.",
  "👂 HOMÓFONAS: 'Meet' e 'meat' soam iguais — encontrar e carne.",
  "👂 HOMÓFONAS: 'Week' e 'weak' soam iguais — semana e fraco.",
  "👂 HOMÓFONAS: 'Pair', 'pear' e 'pare' soam iguais — par, pera, descascar.",
  "👂 HOMÓFONAS: 'Sail' e 'sale' soam iguais — vela/navegar e venda/promoção.",
  "👂 HOMÓFONAS: 'Tail' e 'tale' soam iguais — cauda e história/conto.",
  "👂 HOMÓFONAS: 'Brake' e 'break' soam iguais — freio e quebrar/intervalo.",
  "👂 HOMÓFONAS: 'Whether' e 'weather' soam iguais — se (condição) e clima.",
  "👂 HOMÓFONAS: 'Dye' e 'die' soam iguais — tingir e morrer.",
  "👂 HOMÓFONAS: 'Plane' e 'plain' soam iguais — avião e simples/planície.",
  "👂 HOMÓFONAS: 'Scent', 'sent' e 'cent' soam iguais — perfume, enviou, centavo.",
  "👂 HOMÓFONAS: 'Allowed' e 'aloud' soam iguais — permitido e em voz alta.",
  "👂 HOMÓFONAS: 'Maid' e 'made' soam iguais — empregada doméstica e feito/fabricado.",
  "👂 HOMÓFONAS: 'Peace' e 'piece' soam iguais — paz e pedaço.",
  "👂 HOMÓFONAS: 'Steak' e 'stake' soam iguais — bife e estaca/aposta.",
  "👂 HOMÓFONAS: 'Cellar' e 'seller' soam iguais — adega/porão e vendedor.",
  "👂 HOMÓFONAS: 'Mail' e 'male' soam iguais — correio/email e masculino.",
  "👂 HOMÓFONAS: 'Fare' e 'fair' soam iguais — tarifa/passagem e justo/feira.",
  "👂 HOMÓFONAS: 'I' e 'eye' soam iguais — eu e olho.",
  "👂 HOMÓFONAS: 'Hour' e 'our' soam iguais — hora e nosso. O H em 'hour' é mudo!",
  "👂 HOMÓFONAS: 'Buy', 'by' e 'bye' soam iguais — comprar, por/perto, tchau.",
  "👂 HOMÓFONAS: 'Board' e 'bored' soam quase iguais — placa/diretoria e entediado.",
  "👂 HOMÓFONAS: 'Been' e 'bean' soam iguais (no brit.) — sido e feijão.",
  // ── LETRAS MUDAS ─────────────────────────────────────────────────────────
  "🔇 LETRA MUDA: 'Knife', 'know', 'knee', 'knight' — o K antes de N é sempre mudo em inglês!",
  "🔇 LETRA MUDA: 'Write', 'wrong', 'wrap' — o W antes de R também é mudo!",
  "🔇 LETRA MUDA: 'Hour', 'honest', 'heir' — o H inicial pode ser mudo em algumas palavras.",
  "🔇 LETRA MUDA: 'Lamb', 'bomb', 'thumb', 'comb' — o B depois de M no final é mudo!",
  "🔇 LETRA MUDA: 'Castle', 'listen', 'fasten', 'whistle' — o T no meio é mudo nessas!",
  "🔇 LETRA MUDA: 'Queue' tem 4 letras mudas — só pronuncia o Q! /kjuː/",
  "🔇 LETRA MUDA: 'Psychology', 'pneumonia', 'pterodactyl' — o P inicial antes de outra consoante é mudo!",
  // ── PRONÚNCIA ────────────────────────────────────────────────────────────
  "🎤 PRONÚNCIA: 'TH' tem dois sons — em 'the/this/that' é sonoro /ð/, em 'think/three/throw' é surdo /θ/.",
  "🎤 PRONÚNCIA: O som do R em inglês é bem diferente do português — a língua não vibra, ela se encurva para dentro!",
  "🎤 PRONÚNCIA: 'Comfortable' = /KUMF-ter-bul/ — 4 sílabas viram 3 na fala rápida!",
  "🎤 PRONÚNCIA: 'Wednesday' se pronuncia /WENZ-day/ — o D no meio é mudo na fala nativa!",
  "🎤 PRONÚNCIA: 'February' geralmente é pronunciado /FEB-yoo-ery/ — o primeiro R desaparece!",
  "🎤 PRONÚNCIA: 'Often' pode ser /OF-en/ ou /OF-ten/ — ambas estão corretas!",
  "🎤 PRONÚNCIA: 'Clothes' soa como /KLOHZ/ — o TH é quase inaudível na fala rápida.",
  "🎤 PRONÚNCIA: 'Chocolate' = /CHOK-let/ em inglês rápido — 3 sílabas viram 2!",
  "🎤 PRONÚNCIA: Em inglês americano, o T entre vogais soa como R — 'water' soa como 'wader'!",
  "🎤 PRONÚNCIA: 'Schedule' — americanos dizem /SKED-yool/, britânicos dizem /SHED-yool/!",
  "🎤 PRONÚNCIA: 'Aluminum' (EUA) vs 'Aluminium' (UK) — mesma substância, palavras diferentes!",
  // ── ORIGEM DAS PALAVRAS ──────────────────────────────────────────────────
  "🏰 ETIMOLOGIA: O inglês é germânico — 'water', 'house', 'father', 'mother' vêm do Germanic antigo.",
  "⚔️ ETIMOLOGIA: Após 1066, o inglês absorveu o francês — por isso tem 'beef' (bœuf) mas a vaca é 'cow'!",
  "🌍 ETIMOLOGIA: 'Tsunami' é japonês, 'jungle' é hindi, 'coffee' é árabe — o inglês importa palavras do mundo todo!",
  "📅 ETIMOLOGIA: Os dias da semana são mitologia! Monday=Lua, Sunday=Sol, Saturday=Saturno, Friday=Freya.",
  "🌿 ETIMOLOGIA: 'Avocado' vem do asteca 'ahuacatl' — que também significava testículo (pelo formato)!",
  "💰 ETIMOLOGIA: 'Salary' vem do latim 'sal' (sal) — romanos pagavam soldados com sal, daí 'salary'!",
  "⭐ ETIMOLOGIA: 'Disaster' = 'dis' (mau) + 'aster' (estrela) — antigamente culpavam as estrelas pelos acidentes.",
  "🪟 ETIMOLOGIA: 'Window' vem do nórdico antigo 'vindauga' = 'wind eye' — olho do vento!",
  "💪 ETIMOLOGIA: 'Muscle' vem do latim 'musculus' = camundongo pequeno — o formato lembra um ratinho correndo!",
  "👋 ETIMOLOGIA: 'Goodbye' = 'God be with ye' — uma bênção encurtada ao longo dos séculos!",
  "✅ ETIMOLOGIA: 'OK' pode vir de 'Oll Korrect' — uma brincadeira dos anos 1800 com grafia errada intencional!",
  "🧶 ETIMOLOGIA: 'Clue' vem de 'clew' (novelo de lã) — como o fio de Ariadne no labirinto do Minotauro!",
  "🎲 ETIMOLOGIA: 'Hazard' vem do árabe 'az-zahr' (dados de jogar) — um jogo de azar!",
  "🍕 ETIMOLOGIA: 'Companion' = 'com' + 'panis' (pão) — alguém com quem você divide o pão!",
  "📰 ETIMOLOGIA: 'Tabloid' vem do nome de um comprimido farmacêutico — notícia comprimida em pouco espaço!",
  // ── INGLÊS DO TRABALHO ───────────────────────────────────────────────────
  "💼 TRABALHO: 'ASAP' = As Soon As Possible — o mais rápido possível. Muito comum em emails profissionais!",
  "💼 TRABALHO: 'FYI' = For Your Information — para sua informação. Usado em emails de aviso.",
  "💼 TRABALHO: 'TBD' = To Be Defined/Determined — a ser definido. Aparece em cronogramas e propostas.",
  "💼 TRABALHO: 'ETA' = Estimated Time of Arrival — previsão de chegada. Usado em logística e reuniões.",
  "💼 TRABALHO: 'CC' no email = Carbon Copy — quem está em cópia. 'BCC' = cópia oculta (Blind Carbon Copy).",
  "💼 TRABALHO: 'KPI' = Key Performance Indicator — indicador-chave de desempenho. Muito usado em gestão!",
  "💼 TRABALHO: 'EOD' ou 'EOP' = End of Day / End of Play — até o fim do dia. 'Please send by EOD.'",
  "💼 TRABALHO: 'Per your request' = conforme solicitado. 'Please find attached' = segue em anexo.",
  "💼 TRABALHO: 'Let's table this' — nos EUA significa adiar. No Reino Unido significa discutir agora! Cuidado!",
  "💼 TRABALHO: 'Touch base' = entrar em contato brevemente. 'Let's touch base tomorrow' = vamos conversar amanhã.",
  "💼 TRABALHO: 'On the same page' = alinhados/com o mesmo entendimento. 'Are we on the same page?'",
  "💼 TRABALHO: 'Circle back' = retomar o assunto mais tarde. 'Let's circle back on this next week.'",
  "💼 TRABALHO: 'Deliverable' = entrega/produto final de um projeto. Muito usada em contratos e projetos.",
  "💼 TRABALHO: 'Sign off' = aprovar/dar OK final. 'I need your sign-off on this document.'",
  // ── CURIOSIDADES GERAIS ──────────────────────────────────────────────────
  "📖 Shakespeare inventou +1.700 palavras: 'lonely', 'bedroom', 'generous', 'obscene', 'eyeball'...",
  "🌐 O inglês é língua oficial em 67 países — mais do que qualquer outro idioma no planeta.",
  "🔤 'Set' é a palavra com mais significados em inglês: 430+ definições num único dicionário!",
  "💬 'I' é a única letra que forma uma palavra completa em inglês — e sempre escrita maiúscula!",
  "🧠 Aprender inglês muda o cérebro — aumenta a massa cinzenta nas áreas de memória e atenção!",
  "🔡 'Rhythm' é uma das únicas palavras inglesas sem vogal — e ainda tem 2 sílabas!",
  "🏆 Com apenas 3.000 palavras você entende 95% dos textos em inglês do dia a dia.",
  "🌍 O inglês tem o maior vocabulário do mundo — estima-se mais de 1 milhão de palavras!",
  "📜 O inglês antigo (Old English) de 1.000 anos atrás é tão diferente que parece outro idioma.",
  "💡 Diferente do português, o inglês não tem gênero gramatical — 'the car', 'the house', sempre 'the'!",
  "📝 O inglês é mais direto: 'I love you' (3 palavras). Em português: 'Eu te amo' — mesma estrutura!",
  "🔤 O inglês é uma língua analítica — usa poucas terminações verbais. 'I go, you go, he goes' — quase igual!",
  "📅 O inglês mais falado no mundo é o inglês L2 — de não-nativos! Você já está na maioria.",
  "🧩 Apenas 100 palavras formam 50% de todo o texto escrito em inglês. As mais comuns: the, of, and, a, to.",
  "🎯 Estudar 15 minutos por dia é mais eficiente que 2 horas uma vez por semana — consistência é tudo!",
  "🌙 'Lunatic' vem de 'luna' (lua) — antigamente acreditavam que a lua cheia causava loucura.",
  "🍷 'Toast' (brinde) veio do hábito medieval de colocar torrada no vinho para melhorar o sabor!",
  "🐛 'Bug' (erro de software) vem de 1947 — um inseto real entrou num computador e causou um defeito!",
  "📱 'Emoji' é japonês (絵文字) — mas o Oxford English Dictionary adicionou ao vocabulário inglês oficial.",
  "✏️ A palavra mais longa do dicionário inglês tem 45 letras: 'pneumonoultramicroscopicsilicovolcanoconiosis' — uma doença pulmonar!",
  "🔁 'Racecar', 'level', 'civic', 'radar' — palíndromos: lidos igual de frente e de trás!",
  "🌅 'Breakfast' = break + fast — literalmente 'quebrar o jejum' da noite!",
  // ── PHRASAL VERBS ────────────────────────────────────────────────────────
  "🔥 PHRASAL VERB: 'Give up' = desistir. 'Give in' = ceder. 'Give out' = distribuir. Uma palavra, três destinos!",
  "💡 PHRASAL VERB: 'Look up' = pesquisar. 'Look out' = cuidado! 'Look after' = cuidar de. 'Look into' = investigar.",
  "⚡ PHRASAL VERB: 'Turn on' liga. 'Turn off' desliga. 'Turn up' aparece do nada. 'Turn down' recusa.",
  "🎯 PHRASAL VERB: 'Pick up' = buscar alguém, aprender algo, atender o telefone — contexto é tudo!",
  "🚀 PHRASAL VERB: 'Run out of' = ficar sem. 'Run into' = encontrar por acaso. 'Run away' = fugir.",
  "🌊 PHRASAL VERB: 'Go on' = continuar. 'Go off' = explodir/tocar. 'Go over' = revisar. 'Go through' = passar por.",
  "🎭 PHRASAL VERB: 'Put off' = adiar. 'Put up with' = tolerar. 'Put on' = vestir. 'Put out' = apagar fogo.",
  "💪 PHRASAL VERB: 'Work out' = malhar/resolver. 'Work on' = trabalhar em. 'Work through' = superar.",
  "🏃 PHRASAL VERB: 'Bring up' = criar filho ou mencionar assunto. 'Bring about' = causar. 'Bring back' = trazer de volta.",
  "🎪 PHRASAL VERB: 'Call off' = cancelar. 'Call on' = visitar/pedir para falar. 'Call up' = ligar/convocar.",
  "🌟 PHRASAL VERB: 'Stand out' = se destacar. 'Stand up' = levantar/dar um bolo. 'Stand for' = representar.",
  "🔑 PHRASAL VERB: 'Break down' = quebrar/ter colapso. 'Break in' = invadir. 'Break out' = escapar/surgir.",
  "📦 PHRASAL VERB: 'Take off' = decolar/remover. 'Take on' = assumir. 'Take over' = assumir o controle.",
  "🎬 PHRASAL VERB: 'Set up' = montar/configurar. 'Set off' = partir/disparar. 'Set out' = sair com objetivo.",
];

let _curiosityIdx=0, _curiosityTimer=null;
function startCuriosityTicker(){
  const el=document.getElementById("curiosity-ticker-text"); if(!el) return;
  clearInterval(_curiosityTimer);
  const show=()=>{
    el.style.animation="none";
    el.offsetHeight;
    el.style.animation="tickerFade 0.8s ease";
    el.textContent=CURIOSITIES[_curiosityIdx%CURIOSITIES.length];
    _curiosityIdx++;
  };
  show();
  _curiosityTimer=setInterval(show,20000); // 20 seconds — time to read
}

function showXPHistoryPopup(){
  document.getElementById("xp-history-popup")?.remove();
  const history=userData.xpHistory||{};
  const today=new Date();
  const weekdays=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  const buildWeek=(offsetStart, offsetEnd)=>{
    const days=[];
    for(let i=offsetStart;i>=offsetEnd;i--){
      const d=new Date(today); d.setDate(d.getDate()-i);
      days.push({date:d.toISOString().slice(0,10), label:weekdays[d.getDay()], day:d.getDate()});
    }
    return days;
  };

  const weeks=[
    {label:"Esta semana", days:buildWeek(6,0)},
    {label:"Semana passada", days:buildWeek(13,7)},
    {label:"2 semanas atrás", days:buildWeek(20,14)},
  ];

  const maxXP=Math.max(...weeks.flatMap(w=>w.days.map(d=>history[d.date]||0)),1);

  let html=`<div class="popup-overlay" id="xp-history-popup" onclick="if(event.target===this)this.remove()">
    <div class="popup-card">
      <div class="popup-title">📊 Histórico de XP</div>`;

  weeks.forEach(w=>{
    const total=w.days.reduce((a,d)=>a+(history[d.date]||0),0);
    html+=`<div class="xph-week-label">${w.label} — <strong>${total} XP</strong></div>
    <div class="xph-bars">`;
    w.days.forEach(d=>{
      const v=history[d.date]||0;
      const h=v?Math.max(8,Math.round((v/maxXP)*52)):4;
      html+=`<div class="xph-col">
        <div class="xph-val">${v||""}</div>
        <div class="xph-bar" style="height:${h}px;opacity:${v?1:0.2}"></div>
        <div class="xph-day">${d.label}</div>
        <div class="xph-num">${d.day}</div>
      </div>`;
    });
    html+=`</div>`;
  });

  html+=`<button class="popup-close-btn" onclick="document.getElementById('xp-history-popup').remove()">Fechar</button>
    </div></div>`;

  document.body.insertAdjacentHTML("beforeend",html);
}

function showStreakCalendarPopup(){
  document.getElementById("streak-popup")?.remove();
  const history=userData.xpHistory||{};
  const today=new Date();
  const days=[];
  for(let i=29;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const key=d.toISOString().slice(0,10);
    const xp=history[key]||0;
    days.push({key,xp,day:d.getDate(),month:d.getMonth()+1});
  }

  const cells=days.map(d=>{
    const cls=d.xp>50?"cal-hot":d.xp>0?"cal-warm":"cal-cold";
    return `<div class="streak-cell ${cls}" title="${d.key}: ${d.xp} XP">
      <span>${d.day}</span>
      ${d.xp?`<span class="streak-xp">${d.xp}</span>`:""}
    </div>`;
  }).join("");

  document.body.insertAdjacentHTML("beforeend",`
    <div class="popup-overlay" id="streak-popup" onclick="if(event.target===this)this.remove()">
      <div class="popup-card">
        <div class="popup-title">🔥 Sua Consistência — 30 dias</div>
        <div class="streak-legend">
          <span class="cal-cold" style="width:14px;height:14px;display:inline-block;border-radius:3px"></span> Sem atividade
          <span class="cal-warm" style="width:14px;height:14px;display:inline-block;border-radius:3px;margin-left:8px"></span> Praticou
          <span class="cal-hot" style="width:14px;height:14px;display:inline-block;border-radius:3px;margin-left:8px"></span> Ativo!
        </div>
        <div class="streak-grid">${cells}</div>
        <div class="streak-total">Sequência de exercícios: <strong>${userData.streak||0} dias ${userData.lastExerciseDate===new Date().toISOString().slice(0,10)?"🔥":"❄️"}</strong></div>
        <button class="popup-close-btn" onclick="document.getElementById('streak-popup').remove()">Fechar</button>
      </div>
    </div>`);
}

function initContactFloat(){
  const cfBtn=document.getElementById("btn-contact-float");
  const cfMenu=document.getElementById("contact-float-menu");
  if(!cfBtn||!cfMenu) return;
  cfBtn.addEventListener("click",e=>{
    e.stopPropagation();
    const open=cfMenu.style.display!=="none";
    cfMenu.style.display=open?"none":"flex";
    cfBtn.textContent=open?"💬":"✕";
  });
  document.addEventListener("click",e=>{
    if(!cfBtn.contains(e.target)&&!cfMenu.contains(e.target)){
      cfMenu.style.display="none"; cfBtn.textContent="💬";
    }
  });
  document.getElementById("cfm-share-btn")?.addEventListener("click",()=>{
    shareApp(); cfMenu.style.display="none"; cfBtn.textContent="💬";
  });
}

function shareApp(){
  const url="https://app.viclanguage.com.br";
  if(navigator.share){navigator.share({title:"VIC English",text:"Aprenda inglês profissional!",url});}
  else{navigator.clipboard.writeText(url).then(()=>showXpToast("🔗 Link copiado!"));}
}

function renderDashboard(){
  _dashAC?.abort();
  _dashAC = new AbortController();
  const { signal: _dSig } = _dashAC;
  try{
  const xp=userData.xp||0, lv=levelInfo(xp), level=calcLevel(xp);
  buildDate(); buildGreeting(userData.name||"Aluno");
  fitUserName(userData.name||"Aluno");
  rotatProBanner();
  // Rotate pro banner every 5 seconds
  clearInterval(window._proBannerTimer);
  window._proBannerTimer=setInterval(rotatProBanner,5000);
  renderDailyMissions();
  // Show admin float button if owner
  const adminBtn=document.getElementById("btn-admin-float");
  if(adminBtn) adminBtn.style.display=currentUser?.uid===OWNER_UID?"flex":"none";
  // username handled by fitUserName above
  const elXP=document.getElementById("dash-xp"); if(elXP) elXP.textContent=userData.xpToday||0;
  const elLv=document.getElementById("dash-level"); if(elLv) elLv.textContent=level;
  updateStreakFireDisplay();

  // Next badge inline below XP bar
  const earned2=userData.badges||[];
  const nextBadge2=BADGES.find(b=>!earned2.includes(b.id));
  const nbiEl=document.getElementById("next-badge-inline");
  nbiEl?.addEventListener("click",()=>{ vibrate(30); openProfile(); setTimeout(()=>document.getElementById("profile-badges-grid")?.scrollIntoView({behavior:"smooth"}),400); },{ signal: _dSig });
  if(nbiEl&&nextBadge2){
    nbiEl.style.display="flex";
    document.getElementById("nbi-icon").textContent=nextBadge2.icon;
    document.getElementById("nbi-name").textContent=nextBadge2.name;
    const s2=getBadgeStats();
    let p2="";
    if(nextBadge2.id==="streak5") p2=`${Math.min(s2.answerStreak,5)}/5`;
    else if(nextBadge2.id==="xp250") p2=`${Math.min(s2.xp,250)}/250 XP`;
    document.getElementById("nbi-prog").textContent=p2;
  } else if(nbiEl) nbiEl.style.display="none";

  // Quadratic thresholds: xp to reach level L = (L-1)² × 100
  const xpFloor=(level-1)*(level-1)*100;
  const xpCeil=level*level*100;
  const xpInLevel=xp-xpFloor;
  const xpForLevel=xpCeil-xpFloor;
  const pct=Math.min(Math.round((xpInLevel/xpForLevel)*100),100);
  const xpBar=document.getElementById("dash-xp-bar"); if(xpBar) xpBar.style.width=`${pct}%`;
  const xpNext=document.getElementById("dash-xp-next"); if(xpNext) xpNext.textContent=`${xpCeil-xp} XP para o próximo nível`;

  // Show next badge milestone on bar
  const earned=userData.badges||[];
  const nextBadge=BADGES.find(b=>!earned.includes(b.id));
  const milestoneEl=document.getElementById("dash-milestone-marker");
  if(milestoneEl&&nextBadge){
    milestoneEl.textContent=nextBadge.icon;
    milestoneEl.title=`${t('next_badge_label')}: ${nextBadge.name}`;
  }
  const lvEl=document.getElementById("greeting-level");
  if(lvEl) lvEl.textContent=`${lv.label} — ${lv.msg}`;

  // Update header avatar
  const avatarIcon=document.getElementById("dash-avatar-icon");
  if(avatarIcon){
    const _av=_cfg.avatar||userData.avatar||null;
    if(_av && (_av.startsWith("data:")||_av.startsWith("http")))
      avatarIcon.innerHTML=`<img src="${_av}" style="width:100%;height:100%;object-fit:cover;display:block;"/>`;
    else
      avatarIcon.textContent=_av||userData.name?.[0]?.toUpperCase()||"👤";
  }

  // User level in header
  const ulEl=document.getElementById("dash-user-level");
  if(ulEl) ulEl.textContent=lv.label.split(" ")[0]+" "+lv.label.split(" ")[1];
  // Start Now — contextual: continuar se tem histórico, segmento do diagnóstico se novo
  const snBtn=document.getElementById("btn-start-now");
  if(snBtn){
    const hasMissions=(userData.completedMissions||[]).length>0;
    const hasCurrentMission=userData.currentMission?.missionId;
    if(hasMissions && hasCurrentMission){
      // Usuário com histórico — mostra a missão atual
      const seg=getSegment(currentSegmentId);
      const phase=seg?.phases?.find(p=>p.id===currentPhaseId);
      const mission=phase?.missions?.find(m=>m.id===currentMissionId);
      const missionName=mission?.name||phase?.name||seg?.name||"";
      snBtn.textContent=`▶ Continuar — ${missionName}`;
      snBtn.style.display="block";
    } else if(userData.diagnosisAnswers?.segment){
      // Usuário novo com diagnóstico — mostra segmento escolhido
      const diagSegId=userData.diagnosisAnswers.segment;
      const diagSeg=getSegment(diagSegId);
      if(diagSeg){
        snBtn.textContent=`${diagSeg.icon||"▶"} Começar ${diagSeg.name}`;
        snBtn.style.display="block";
      } else { snBtn.style.display="none"; }
    } else {
      // Sem diagnóstico — oculta o botão
      snBtn.style.display="none";
    }
  }
  const banner=document.getElementById("pro-banner");
  if(banner) banner.style.display=isPro()?"none":"flex";

  // Show banner: diagnosis not done OR level test not done yet
  const diagBanner=document.getElementById("diag-invite-banner");
  if(diagBanner){
    const needsDiag = !userData.diagnosisAnswers;
    const needsLevelTest = userData.diagnosisAnswers && !userData.levelTestCompleted;
    diagBanner.style.display = (needsDiag || needsLevelTest) ? "flex" : "none";
    if(needsLevelTest && !needsDiag){
      const titleEl = diagBanner.querySelector(".diag-invite-title");
      const subEl   = diagBanner.querySelector(".diag-invite-sub");
      if(titleEl) titleEl.textContent = "Descubra seu nível de inglês";
      if(subEl)   subEl.textContent   = "Teste rápido • 15 questões • ~5 min";
    }
  }

  renderSegments();
  try{ renderDashboardTexts(); }catch(e){}
  }catch(e){ console.error("renderDashboard error:", e.message); }
}

function toggleDashSection(colId, arrowId, openDisplay){
  const col=document.getElementById(colId);
  const arrow=document.getElementById(arrowId);
  if(!col) return;
  const isHidden=col.style.display==="none";
  col.style.display=isHidden?(openDisplay||"block"):"none";
  if(arrow) arrow.style.transform=isHidden?"rotate(0deg)":"rotate(180deg)";
}

function toggleSegments(){
  const col=document.getElementById("segments-collapsible");
  const arrow=document.getElementById("segments-toggle-arrow");
  if(!col) return;
  const open=col.style.display==="none";
  col.style.display=open?"block":"none";
  if(arrow) arrow.style.transform=open?"rotate(0deg)":"rotate(180deg)";
}

function toggleXpStats(){
  const row=document.getElementById("stats-row-collapsible");
  const arrow=document.getElementById("xp-toggle-arrow");
  if(!row) return;
  const isHidden=row.style.display==="none";
  row.style.display=isHidden?"grid":"none";
  if(arrow) arrow.style.transform=isHidden?"rotate(180deg)":"rotate(0deg)";
}

function renderSegments(){
  const c=document.getElementById("segments-grid"); if(!c) return; c.innerHTML="";
  const grammarSeg=VICTOR_DATA.segments.find(s=>s.isGrammarCore);
  const regularSegs=VICTOR_DATA.segments.filter(s=>!s.isGrammarCore && !s.hidden);
  regularSegs.forEach(seg=>{
    const div=document.createElement("div");
    div.className=`segment-card ${seg.available?"available":"locked"}`;
    div.innerHTML=`<span class="seg-icon">${seg.icon}</span><span class="seg-name">${segName(seg.id)}</span>${seg.comingSoon?'<span class="seg-badge">Em breve</span>':""}`;
    if(seg.available) div.addEventListener("click",()=>openSegmentPhases(seg.id));
    c.appendChild(div);
  });
  if(grammarSeg){
    const gc=document.getElementById("grammar-core-banner");
    if(gc){gc.style.display="flex";gc.onclick=()=>openSegmentPhases(grammarSeg.id);}
  }
  // Prepare & Present banner
  const ppBanner=document.getElementById("prepare-present-banner");
  if(ppBanner&&VICTOR_DATA.prepareTopics?.length) ppBanner.style.display="flex";
}

// ── PHASES ────────────────────────────────────────────────────────────────────
function openSegmentPhases(segId){
  const seg=getSegment(segId); if(!seg) return;
  currentSegmentId=segId;
  document.getElementById("phases-title").textContent=`${seg.icon} ${seg.name}`;
  const list=document.getElementById("phases-list"); list.innerHTML="";

  // Glossary button (only for segments that have glossary data)
  if(GLOSSARY[segId]){
    const glossBtn=document.createElement("button");
    glossBtn.className="gloss-segment-btn";
    glossBtn.innerHTML="📖 Glossário do Segmento";
    glossBtn.addEventListener("click",()=>openGlossary(segId));
    list.appendChild(glossBtn);
  }

  const completed=userData.completedMissions||[];
  let _phases=seg.phases||[];
  if(seg.isGrammarCore){
    _phases=[..._phases].sort((a,b)=>{const af=isSegmentFree("gramatica",a.id),bf=isSegmentFree("gramatica",b.id);return (bf?1:0)-(af?1:0);});
  }
  _phases.forEach((phase,pi)=>{
    // Grammar Core: all phases independent
    if(seg.isGrammarCore){ phase.unlocked=true; }
    else if(pi===0){ phase.unlocked=true; }
    else {
      // Must complete ALL missions in previous phase
      const prev=seg.phases[pi-1];
      const allPrevDone=(prev.missions||[]).every(m=>completed.includes(`${segId}_${prev.id}_${m.id}`));
      phase.unlocked=allPrevDone;
    }
    const isFree=isSegmentFree(segId,phase.id);
    const manualAccess=userData.manualAccess||{};
    const key=`${segId}_${phase.id}`;
    let accessible;
    if(manualAccess[key]===true) accessible=true;
    else if(manualAccess[key]===false) accessible=false;
    else accessible=isPro()||isFree;
    const locked=!phase.unlocked||!accessible;
    const div=document.createElement("div");
    div.className=`phase-card ${locked?"locked":"unlocked"}`;
    const total=phase.missions?.length||0;
    const done=(phase.missions||[]).filter(m=>completed.includes(`${segId}_${phase.id}_${m.id}`)).length;
    const pct=total?Math.round((done/total)*100):0;
    const proTag=!isFree&&!isPro()?`<span class="phase-pro-tag">⭐ Pro</span>`:"";
    div.innerHTML=`<div class="phase-left"><div class="phase-num">${phase.name} ${proTag}</div><div class="phase-sub">${phase.subtitle}</div><div class="phase-bar-wrap"><div class="phase-bar" style="width:${pct}%"></div></div><div class="phase-progress-text">${done}/${total} missões</div></div><div class="phase-right">${locked?(!phase.unlocked?"🔒":"⭐"):"→"}</div>`;
    if(!locked) div.addEventListener("click",()=>openMissionsList(segId,phase.id));
    else if(!isPro()&&!isFree) div.addEventListener("click",showUpgradeScreen);
    list.appendChild(div);
  });
  showView("view-phases");
}

// ── GLOSSARY ──────────────────────────────────────────────────────────────────
function openGlossary(segId){
  const data=GLOSSARY[segId]; if(!data) return;
  const overlay=document.createElement("div");
  overlay.id="glossary-overlay";
  overlay.innerHTML=`
    <div class="gloss-header">
      <div class="gloss-header-row">
        <button class="gloss-close-btn" onclick="closeGlossary()">← Voltar</button>
        <h2 class="gloss-title">${data.icon} Glossário — ${data.name}</h2>
      </div>
      <input class="gloss-search" placeholder="Buscar termo em inglês ou português..." id="gloss-search-input" />
    </div>
    <div class="gloss-list" id="gloss-term-list"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#gloss-search-input").addEventListener("input",e=>{
    renderGlossaryTerms(segId, e.target.value.trim().toLowerCase());
  });
  renderGlossaryTerms(segId,"");
}

function closeGlossary(){
  document.getElementById("glossary-overlay")?.remove();
}

function renderGlossaryTerms(segId, filter){
  const data=GLOSSARY[segId]; if(!data) return;
  const list=document.getElementById("gloss-term-list"); if(!list) return;
  const terms=filter
    ? data.terms.filter(t=>t.en.toLowerCase().includes(filter)||t.pt.toLowerCase().includes(filter))
    : data.terms;
  if(!terms.length){
    list.innerHTML=`<p class="gloss-empty">Nenhum termo encontrado.</p>`;
    return;
  }
  list.innerHTML="";
  terms.forEach(term=>{
    const card=document.createElement("div");
    card.className="gloss-term-card";
    card.innerHTML=`
      <div class="gloss-term-row">
        <div class="gloss-term-text">
          <span class="gloss-term-en">${term.en}</span>
          <span class="gloss-term-pt">${term.pt}</span>
        </div>
        <button class="gloss-speak-btn" title="Ouvir pronúncia">🔊</button>
        <span class="gloss-chevron">▼</span>
      </div>
      <div class="gloss-term-detail">
        <div class="gloss-detail-inner">
          <div class="gloss-example-en">"${term.exEN}"</div>
          <div class="gloss-example-pt">"${term.exPT}"</div>
          <button class="gloss-speak-example">🔊 Ouvir exemplo</button>
        </div>
      </div>`;
    card.querySelector(".gloss-term-row").addEventListener("click",e=>{
      if(e.target.classList.contains("gloss-speak-btn")) return;
      card.classList.toggle("open");
    });
    card.querySelector(".gloss-speak-btn").addEventListener("click",e=>{
      e.stopPropagation();
      try{ SoundFX.speakEN(term.en); }catch(_){}
    });
    card.querySelector(".gloss-speak-example").addEventListener("click",e=>{
      e.stopPropagation();
      try{ SoundFX.speakEN(term.exEN); }catch(_){}
    });
    list.appendChild(card);
  });
}

function openMissionsList(segId,phaseId){
  currentPhaseId=phaseId;
  const phase=getPhase(segId,phaseId); if(!phase) return;
  document.getElementById("missions-title").textContent=`${phase.name} — ${phase.subtitle}`;
  const list=document.getElementById("missions-list"); list.innerHTML="";
  const completed=userData.completedMissions||[];
  (phase.missions||[]).forEach(mission=>{
    const isDone=completed.includes(`${segId}_${phaseId}_${mission.id}`);
    const div=document.createElement("div");
    div.className="phase-card unlocked";
    div.innerHTML=`<div class="phase-left"><div class="phase-num">${mission.icon||"📝"} ${stripEmoji(mission.name)}</div><div class="phase-sub">${mission.description||""}</div><div class="phase-progress-text">${isDone?"✅ Concluída":mission.xpTotal+" XP"}</div></div><div class="phase-right">→</div>`;
    div.addEventListener("click",()=>enterMission(segId,phaseId,mission.id));
    list.appendChild(div);
  });
  showView("view-missions-list");
}

// ── MISSION ───────────────────────────────────────────────────────────────────
function enterMission(segId,phaseId,misId){
  // Som do segmento ao entrar num novo segmento
  if(segId !== currentSegmentId){
    try{ SoundFX.segmentSound(segId); }catch(e){}
  }
  currentSegmentId=segId; currentPhaseId=phaseId; currentMissionId=misId; currentPhraseIndex=0;
  resetRecorder(); renderMission(); showView("view-mission");
}

function renderMission(){
  _phraseAC?.abort();
  _phraseAC = new AbortController();
  const mission=getMission(currentSegmentId,currentPhaseId,currentMissionId);
  const phrase=getPhrase();
  const total=mission?.phrases.length||1;
  if(!phrase){ console.error("No phrase found",currentSegmentId,currentPhaseId,currentMissionId,currentPhraseIndex); return; }

  exerciseAnswered=false; memSelected=null; memMatched=0; wordOrderPlaced=[]; matchSelected=null; matchCorrect=0;
  showLockedNextBtn(); // show locked next button

  document.getElementById("mission-name").textContent        =stripEmoji(mission?.name||"");
  document.getElementById("phrase-counter").textContent      =`${currentPhraseIndex+1}/${total}`;
  document.getElementById("mission-progress-bar").style.width=`${Math.round(((currentPhraseIndex+1)/total)*100)}%`;
  const ptEl=document.getElementById("phrase-pt");
  if(ptEl){
    if(phrase.pt&&!["translate_en_pt","translate_pt_en","memory_match","match_columns"].includes(phrase.type)){
      ptEl.innerHTML=`<span class="phrase-pt-label">🇧🇷</span> ${phrase.pt}`;
      ptEl.style.display="";
    } else {
      ptEl.textContent=""; ptEl.style.display="none";
    }
  }
  document.getElementById("phrase-tip").textContent          =phrase.tip?`💡 ${stripEmoji(phrase.tip)}`:"";
  document.getElementById("btn-next").style.display          ="none";
  document.getElementById("score-panel").style.display       ="none";
  document.getElementById("recording-status").textContent    ="";
  document.getElementById("transcript-box").style.display    ="none";
  document.getElementById("pronunciation-feedback").style.display="none";
  document.getElementById("answer-feedback").style.display   ="none";

  const typeMap={pronunciation:["Pronúncia 🎤","ex-type-pronunciation"],translate_en_pt:["Traduza para PT 🇧🇷","ex-type-translate"],translate_pt_en:["Traduza para EN 🇺🇸","ex-type-translate"],multiple_choice:["Múltipla Escolha ☑️","ex-type-multiple"],fill_blank:["Complete a frase ✍️","ex-type-fill"],word_order:["Ordene a frase 🔀","ex-type-order"],memory_match:["Jogo da Memória 🃏","ex-type-memory"],match_columns:["Ligue as colunas 🔗","ex-type-memory"]};
  const [label,cls]=typeMap[phrase.type]||["",""];
  const badge=document.getElementById("ex-type-badge");
  badge.textContent=label; badge.className=`ex-type-badge ${cls}`;
  const phraseLabel=document.querySelector(".phrase-label");
  if(phraseLabel) phraseLabel.textContent=["memory_match","match_columns"].includes(phrase.type)?"Tema":"Frase";

  document.getElementById("speak-controls")?.style && (document.getElementById("speak-controls").style.display="flex");
  renderPhraseEN(phrase,[]);
  renderVocab(phrase);
  renderExerciseUI(phrase);
  document.getElementById("controls-wrap").style.display=phrase.type==="pronunciation"?"grid":"none";
  resetRecorder(); spokenWords=[];
}

function renderPhraseEN(phrase,spoken){
  const container=document.getElementById("phrase-en"); if(!container) return;
  if(["memory_match","match_columns"].includes(phrase.type)){container.textContent=cleanEnunciado(phrase.en);return;}
  if(phrase.type==="translate_pt_en"){container.textContent=cleanEnunciado(phrase.pt||"");return;}
  const spokenClean=spoken.map(w=>w.toLowerCase().replace(/[^a-z]/g,""));
  const wordMap={}; (phrase.words||[]).forEach(w=>{wordMap[w.w.toLowerCase().replace(/[^a-z]/g,"")]=w.cls;});
  const cleanText=cleanEnunciado(phrase.en);
  container.innerHTML=cleanText.split(/(\s+)/).map(token=>{
    if(/^\s+$/.test(token)) return token;
    const clean=token.toLowerCase().replace(/[^a-z]/g,"");
    const wtype=wordMap[clean]||"";
    let cls=spokenClean.includes(clean)?"word-said":wtype==="noun"?"w-noun":wtype==="verb"?"w-verb":wtype==="adj"?"w-adj":"";
    return `<span class="phrase-word ${cls}" data-word="${clean}">${token}</span>`;
  }).join("");
  container.querySelectorAll(".phrase-word").forEach(s=>s.addEventListener("click",()=>{const w=s.dataset.word;if(w)SoundFX.speakEN(w);},{ signal: _phraseAC?.signal }));
}

function renderVocab(phrase){
  const el=document.getElementById("vocab-list"); if(!el) return;
  const dicaBtn=document.getElementById("btn-dica");
  if(!phrase.words?.length){
    el.style.display="none";
    if(dicaBtn) dicaBtn.style.display="none";
    return;
  }
  el.style.display="flex";
  el.classList.remove("dica-open"); // start collapsed
  el.innerHTML=phrase.words.map(w=>`<div class="vocab-item" data-word="${w.w}" data-tr="${w.tr}"><span class="vocab-word">${w.w}</span><span class="vocab-class ${w.cls}">${w.cls}</span><span class="vocab-translation">= ${w.tr}</span><span class="vocab-speaker">🔊</span></div>`).join("");
  el.querySelectorAll(".vocab-item").forEach(item=>{
    item.querySelector(".vocab-word")?.addEventListener("click",()=>SoundFX.speakEN(item.dataset.word),{ signal: _phraseAC?.signal });
    item.querySelector(".vocab-translation")?.addEventListener("click",()=>SoundFX.speakPT(item.dataset.tr),{ signal: _phraseAC?.signal });
    item.querySelector(".vocab-speaker")?.addEventListener("click",()=>SoundFX.speakEN(item.dataset.word),{ signal: _phraseAC?.signal });
  });
  if(dicaBtn){
    dicaBtn.style.display="inline-flex";
    dicaBtn.classList.remove("open");
    dicaBtn.innerHTML="💡 Ver Dica";
    dicaBtn.onclick=()=>{
      el.classList.toggle("dica-open");
      const nowOpen=el.classList.contains("dica-open");
      dicaBtn.classList.toggle("open",nowOpen);
      dicaBtn.innerHTML=nowOpen?"🔼 Esconder Dica":"💡 Ver Dica";
    };
  }
}

// ── EXERCISE UI ───────────────────────────────────────────────────────────────
function renderExerciseUI(phrase){
  ["translate-box","mc-options","fill-wrap","word-order-wrap","memory-wrap","match-wrap"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});

  if(phrase.type==="translate_en_pt"||phrase.type==="translate_pt_en"){
    document.getElementById("translate-label").textContent=phrase.type==="translate_en_pt"?"Escreva em português:":"Escreva em inglês:";
    document.getElementById("translate-input").value="";
    document.getElementById("translate-box").style.display="block";
    document.getElementById("answer-feedback").style.display="none";
  }

  if(phrase.type==="multiple_choice"){
    const wrap=document.getElementById("mc-options"); wrap.innerHTML=""; wrap.style.display="flex";
    // RANDOMIZE options — track new correct position
    const indices=shuffle([0,1,2,3].slice(0,phrase.options.length));
    const newCorrect=indices.indexOf(phrase.correct);
    indices.forEach((origIdx,newIdx)=>{
      const opt=phrase.options[origIdx];
      const btn=document.createElement("button"); btn.className="mc-option";
      btn.innerHTML=`<span class="mc-text">${opt}</span><span class="mc-speak-btn" tabindex="-1">🔊</span>`;
      btn.querySelector(".mc-speak-btn").addEventListener("click",e=>{
        e.stopPropagation();
        const clean=stripEmoji(opt);
        const ph=getPhrase();
        _optionIsPT(clean,ph)?SoundFX.speakPT(clean):SoundFX.speakEN(clean);
      });
      btn.addEventListener("click",()=>{
        if(exerciseAnswered) return; exerciseAnswered=true;
        wrap.querySelectorAll(".mc-option").forEach((b,i)=>{b.disabled=true;if(i===newCorrect)b.classList.add("correct");else if(i===newIdx&&newIdx!==newCorrect)b.classList.add("wrong");});
        const correctText=stripEmoji(phrase.options[phrase.correct]);
        _optionIsPT(correctText,phrase)?SoundFX.speakPT(correctText):SoundFX.speakEN(correctText);
        showNextBtn('btn-next-exercise', newIdx===newCorrect?10:0);
      });
      wrap.appendChild(btn);
    });
  }

  if(phrase.type==="fill_blank"){
    const cleanFill=cleanEnunciado(phrase.en);
    const parts=cleanFill.split("___");
    document.getElementById("fill-sentence").innerHTML=parts[0]+`<span class="fill-blank" id="fill-blank-input" contenteditable="true" spellcheck="false"></span>`+(parts[1]||"");
    document.getElementById("fill-input-hidden").value="";
    document.getElementById("fill-wrap").style.display="block";
    document.getElementById("answer-feedback-fill").style.display="none";
    setTimeout(()=>{const b=document.getElementById("fill-blank-input");if(b){b.textContent="";b.addEventListener("input",()=>document.getElementById("fill-input-hidden").value=b.textContent,{ signal: _phraseAC?.signal });b.focus();}},100);
  }

  if(phrase.type==="word_order"){
    const wrap=document.getElementById("word-order-wrap"); wrap.style.display="block";
    wordOrderPlaced=[];
    const zone=document.getElementById("word-order-zone"); zone.innerHTML="";
    const bank=document.getElementById("word-order-bank"); bank.innerHTML="";
    document.getElementById("answer-feedback-order").style.display="none";
    shuffle(phrase.scrambled).forEach(w=>{
      const btn=document.createElement("button"); btn.className="word-tile"; btn.textContent=stripEmoji(w);
      btn.addEventListener("click",()=>{
        if(btn.classList.contains("placed")) return;
        wordOrderPlaced.push(stripEmoji(w)); btn.classList.add("placed");
        const tile=document.createElement("span"); tile.className="word-tile placed-tile"; tile.textContent=stripEmoji(w);
        tile.addEventListener("click",()=>{const idx=wordOrderPlaced.lastIndexOf(stripEmoji(w));if(idx>=0)wordOrderPlaced.splice(idx,1);btn.classList.remove("placed");tile.remove();});
        zone.appendChild(tile);
      });
      bank.appendChild(btn);
    });
  }
  if(phrase.type==="memory_match"){document.getElementById("memory-wrap").style.display="block";renderMemoryGrid(phrase.pairs,"memory-grid");}
  if(phrase.type==="match_columns"){document.getElementById("match-wrap").style.display="block";renderMatchColumns(phrase.pairs);}
}

// ── MEMORY MATCH (in-mission) ─────────────────────────────────────────────────
function renderMemoryGrid(pairs,gridId){
  const grid=document.getElementById(gridId); if(!grid) return;
  grid.innerHTML=""; memMatched=0; memSelected=null;
  // include emoji in both sides for visual memory aid
  const cards=[...pairs.map(p=>({text:p.a,type:"en",pair:p.a+"|"+p.b})),...pairs.map(p=>({text:p.b,type:"pt",pair:p.a+"|"+p.b}))];
  shuffle(cards).forEach(card=>{
    const div=document.createElement("div"); div.className="mem-card"; div.dataset.pair=card.pair; div.dataset.type=card.type;
    const display=card.text; // keep emoji
    div.innerHTML=`<div class="mem-card-inner"><div class="mem-card-front">?</div><div class="mem-card-back">${display}<span class="mem-speak">🔊</span></div></div>`;
    div.addEventListener("click",()=>handleMemCard(div,pairs.length));
    div.querySelector(".mem-speak")?.addEventListener("click",e=>{e.stopPropagation();card.type==="en"?SoundFX.speakEN(stripEmoji(card.text)):SoundFX.speakPT(stripEmoji(card.text));});
    grid.appendChild(div);
  });
}

function handleMemCard(div,totalPairs){
  if(div.classList.contains("flipped")||div.classList.contains("matched")) return;
  div.classList.add("flipped");
  const text=div.querySelector(".mem-card-back").childNodes[0].textContent.trim();
  div.dataset.type==="en"?SoundFX.speakEN(stripEmoji(text)):SoundFX.speakPT(stripEmoji(text));
  if(!memSelected){memSelected=div;return;}
  if(memSelected.dataset.pair===div.dataset.pair&&memSelected.dataset.type!==div.dataset.type){
    memSelected.classList.add("matched"); div.classList.add("matched"); SoundFX.correct(); memMatched++;
    memSelected=null;
    if(memMatched===totalPairs){document.getElementById("memory-status").textContent="🎉 Perfeito!";autoAdvance(10);}
  } else {
    SoundFX.wrong();
    const prev=memSelected; memSelected=null;
    setTimeout(()=>{prev.classList.remove("flipped");div.classList.remove("flipped");},900);
  }
}

// ── MATCH COLUMNS ──────────────────────────────────────────────────────────────
function renderMatchColumns(pairs){
  const wrap=document.getElementById("match-columns"); wrap.innerHTML="";
  const colA=document.createElement("div"); colA.className="match-col";
  const colB=document.createElement("div"); colB.className="match-col";
  const shuffledB=shuffle([...pairs]);
  pairs.forEach(p=>{
    const a=document.createElement("button"); a.className="match-item match-a"; a.dataset.key=p.a;
    a.innerHTML=`<span>${p.a}</span><span class="match-spk">🔊</span>`;
    a.querySelector(".match-spk").addEventListener("click",e=>{e.stopPropagation();SoundFX.speakEN(stripEmoji(p.a));});
    a.addEventListener("click",()=>handleMatchClick(a,"a",pairs));
    colA.appendChild(a);
  });
  shuffledB.forEach(p=>{
    const b=document.createElement("button"); b.className="match-item match-b"; b.dataset.key=p.a;
    b.innerHTML=`<span>${p.b}</span><span class="match-spk">🔊</span>`;
    b.querySelector(".match-spk").addEventListener("click",e=>{e.stopPropagation();SoundFX.speakPT(stripEmoji(p.b));});
    b.addEventListener("click",()=>handleMatchClick(b,"b",pairs));
    colB.appendChild(b);
  });
  wrap.appendChild(colA); wrap.appendChild(colB);
}

function handleMatchClick(el,side,pairs){
  if(el.classList.contains("matched")) return;
  if(!matchSelected){matchSelected={el,side};el.classList.add("selected");return;}
  if(matchSelected.side===side){matchSelected.el.classList.remove("selected");matchSelected={el,side};el.classList.add("selected");return;}
  const aEl=side==="a"?el:matchSelected.el, bEl=side==="b"?el:matchSelected.el;
  if(aEl.dataset.key===bEl.dataset.key){
    aEl.classList.add("matched");bEl.classList.add("matched");SoundFX.correct();matchCorrect++;
    if(matchCorrect===pairs.length) setTimeout(()=>autoAdvance(10),500);
  } else {
    SoundFX.wrong();aEl.classList.add("wrong");bEl.classList.add("wrong");
    setTimeout(()=>{aEl.classList.remove("wrong","selected");bEl.classList.remove("wrong","selected");},800);
  }
  matchSelected=null; el.classList.remove("selected");
}

// ── HANDLERS ──────────────────────────────────────────────────────────────────
function checkTranslate(){
  if(exerciseAnswered) return; exerciseAnswered=true;
  const phrase=getPhrase();
  const input=document.getElementById("translate-input").value.trim();
  const correct=phrase.answer||"";
  const result=avaliarResposta(input,correct);
  const fb=document.getElementById("answer-feedback");
  if(result.feedback==="correct"){fb.className="answer-feedback correct";fb.innerHTML=`🌟 Perfeito!<br><small>${correct}</small>`;SoundFX.correct();}
  else if(result.feedback==="almost"){fb.className="answer-feedback correct";fb.innerHTML=`👍 Quase!<br><small>${correct}</small>`;SoundFX.almost();}
  else{fb.className="answer-feedback wrong";fb.innerHTML=`${t("correct_answer")} <small>${correct}</small>`;SoundFX.wrong();}
  fb.style.display="block";
  phrase.type==="translate_pt_en"?SoundFX.speakEN(stripEmoji(correct)):SoundFX.speakPT(stripEmoji(correct));
  showNextBtn('btn-next-exercise', result.score);
}
function checkFill(){
  if(exerciseAnswered) return; exerciseAnswered=true;
  const phrase=getPhrase();
  const input=(document.getElementById("fill-input-hidden").value||document.getElementById("fill-blank-input")?.textContent||"").trim();
  const correct=phrase.answer||"";
  const result=avaliarResposta(input,correct);
  const fb=document.getElementById("answer-feedback-fill");
  if(result.feedback==="correct"){fb.className="answer-feedback correct";fb.innerHTML=`${t("correct")} <strong>${correct}</strong>`;SoundFX.correct();}
  else if(result.feedback==="almost"){fb.className="answer-feedback correct";fb.innerHTML=`👍 Quase! <strong>${correct}</strong>`;SoundFX.almost();}
  else{fb.className="answer-feedback wrong";fb.innerHTML=`${t("correct_answer")} <strong>${correct}</strong>`;SoundFX.wrong();}
  fb.style.display="block";
  SoundFX._isPT(correct)?SoundFX.speakPT(correct):SoundFX.speakEN(correct);
  showNextBtn('btn-next-fill', result.score);
}
function checkWordOrder(){
  if(exerciseAnswered) return; exerciseAnswered=true;
  const phrase=getPhrase();
  const placed=wordOrderPlaced.join(" ");
  const correct=stripEmoji(phrase.answer);
  const result=avaliarResposta(placed,correct);
  const fb=document.getElementById("answer-feedback-order");
  if(result.feedback==="correct"){fb.className="answer-feedback correct";fb.innerHTML=t("correct");SoundFX.correct();}
  else if(result.feedback==="almost"){fb.className="answer-feedback correct";fb.innerHTML=`👍 Quase! <strong>${correct}</strong>`;SoundFX.almost();}
  else{fb.className="answer-feedback wrong";fb.innerHTML=`${t("correct_answer")} <strong>${correct}</strong>`;SoundFX.wrong();}
  fb.style.display="block";
  SoundFX._isPT(correct)?SoundFX.speakPT(correct):SoundFX.speakEN(correct);
  showNextBtn('btn-next-order', result.score);
}

// ── TTS LANGUAGE DETECTION FOR MC OPTIONS ─────────────────────────────────────
// Returns true if the option text should be spoken in Portuguese.
// Uses explicit type, then structural clues, then character/word heuristics.
function _optionIsPT(optText, phrase){
  if(phrase?.type==="translate_pt_en") return false;
  if(phrase?.type==="translate_en_pt") return true;
  const clean=stripEmoji(optText).trim();
  // Accented characters → definitely PT
  if(/[àáâãçèéêëìíîïòóôõöùúûü]/i.test(clean)) return true;
  // Slash translations like "Carga / mercadoria" → PT
  if(clean.includes("/")) return true;
  // Question asks "What does X mean?" or "X means:" → options are PT translations
  if(/(what does|what is the '|' means:|'[^']* means:)/i.test(phrase?.en||"")) return true;
  // Long sentence with common EN pronouns → likely an EN response option
  if(clean.length>20 && /\b(I am|I will|You can|Please|Of course|Not my|Best regards)\b/i.test(clean)) return false;
  // Words array: if option matches a translation field → PT
  for(const w of (phrase?.words||[])){
    if((w.tr||"").length>2 && clean.toLowerCase().includes(w.tr.toLowerCase())) return true;
  }
  return SoundFX._isPT(clean);
}

// ── TTS ────────────────────────────────────────────────────────────────────────
function speakPhrase(rate=0.85){
  const phrase=getPhrase(); if(!phrase) return;
  speechSynthesis.cancel();
  const clean=SoundFX._clean(phrase.en);
  const utt=new SpeechSynthesisUtterance(clean); utt.lang="en-US"; utt.rate=rate;
  const btn=document.getElementById("btn-listen"); btn?.classList.add("playing");
  let wIdx=0;
  utt.onboundary=e=>{if(e.name==="word"){document.querySelectorAll("#phrase-en .phrase-word").forEach((s,i)=>s.classList.toggle("word-speaking",i===wIdx));wIdx++;}};
  utt.onend=()=>{btn?.classList.remove("playing");document.querySelectorAll("#phrase-en .phrase-word").forEach(s=>s.classList.remove("word-speaking"));};
  speechSynthesis.speak(utt);
}
function speakPhraseCard(){ const p=getPhrase(); if(p) SoundFX.speakEN(p.en); }
function speakPhraseCardSlow(){ const p=getPhrase(); if(p) SoundFX.speakEN(p.en, 0.45); }
function speakPhrasePT(){ const p=getPhrase(); if(p&&p.pt) SoundFX.speakPT(p.pt); }

// ── RECORDING ─────────────────────────────────────────────────────────────────
async function startRecording(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    audioChunks=[]; recordedURL=null; spokenWords=[];
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(SR){
      recognition=new SR(); recognition.lang="en-US"; recognition.continuous=true; recognition.interimResults=true;
      const box=document.getElementById("transcript-box"); box.textContent=""; box.style.display="block";
      recognition.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal){t.split(/\s+/).forEach(w=>{const c=w.toLowerCase().replace(/[^a-z]/g,"");if(c&&!spokenWords.includes(c))spokenWords.push(c);});renderPhraseEN(getPhrase(),spokenWords);}else interim+=t;}box.textContent=(spokenWords.join(" ")+" "+interim).trim();};
      recognition.onerror=()=>{}; recognition.start();
    }
    const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
    mediaRecorder=new MediaRecorder(stream,{mimeType:mime});
    mediaRecorder.ondataavailable=e=>{if(e.data.size>0)audioChunks.push(e.data);};
    mediaRecorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(audioChunks,{type:mime});
      if(recordedURL) URL.revokeObjectURL(recordedURL);
      recordedURL=URL.createObjectURL(blob);
      const a=document.getElementById("audio-player"); a.src=recordedURL; a.load();
      document.getElementById("btn-play-recording").disabled=false;
      document.getElementById("recording-status").textContent="✅ Pronto! Ouça sua voz.";
      const transcript=document.getElementById("transcript-box")?.textContent?.trim();
      const phrase=getPhrase();
      if(transcript&&phrase?.en){
        const result=avaliarResposta(transcript,SoundFX._clean(phrase.en));
        setTimeout(()=>showScoreResult(result.score, transcript),600);
      } else document.getElementById("score-panel").style.display="flex";
    };
    mediaRecorder.start(100); isRecording=true;
    document.getElementById("btn-record").style.display="none";
    document.getElementById("btn-stop").style.display="flex";
    document.getElementById("recording-status").textContent="🔴 Gravando...";
  }catch(e){alert("Erro ao acessar o microfone.");}
}
function stopRecording(){if(recognition){try{recognition.stop();}catch(e){}recognition=null;}if(mediaRecorder&&isRecording){mediaRecorder.stop();isRecording=false;document.getElementById("btn-record").style.display="flex";document.getElementById("btn-stop").style.display="none";}}
function playRecording(){const a=document.getElementById("audio-player");if(!a.src||a.src===window.location.href){document.getElementById("recording-status").textContent="⚠️ Grave primeiro!";return;}a.currentTime=0;a.play().catch(()=>{});}
function resetRecorder(){if(recognition){try{recognition.stop();}catch(e){}recognition=null;}if(mediaRecorder&&isRecording){try{mediaRecorder.stop();}catch(e){}}isRecording=false;mediaRecorder=null;audioChunks=[];if(recordedURL){URL.revokeObjectURL(recordedURL);recordedURL=null;}const a=document.getElementById("audio-player");if(a){a.src="";a.load();}const r=document.getElementById("btn-record"),s=document.getElementById("btn-stop");if(r)r.style.display="flex";if(s)s.style.display="none";}

// ── SCORE ─────────────────────────────────────────────────────────────────────
async function submitScore(score){document.getElementById("score-panel").style.display="none";showScoreResult(score);}
function showScoreResult(score, spokenText){
  document.getElementById("score-panel").style.display="none";
  const fb=document.getElementById("pronunciation-feedback");
  const phrase=getPhrase();
  let analysis=null;
  if(spokenText&&phrase?.en){
    analysis=analyzePronunciation(spokenText, SoundFX._clean(phrase.en));
  }

  if(score===10||analysis?.pct>=90){
    fb.className="pronunciation-feedback good";
    fb.innerHTML=`<span class="pf-emoji">🌟</span><div class="pf-text">Perfect!</div><div class="pf-sub">+10 XP</div>`;
    SoundFX.correct(); score=10;
  }else if(score===5||analysis?.pct>=70){
    const wf=analysis?.wordFeedback?.join(" • ")||"";
    fb.className="pronunciation-feedback almost";
    fb.innerHTML=`<span class="pf-emoji">👍</span><div class="pf-text">Almost! ${analysis?.pct||""}%</div><div class="pf-sub">${wf||"+5 XP"}</div>`;
    SoundFX.almost(); score=5;
  }else{
    const wf=analysis?.wordFeedback?.join(" • ")||"Ouça e repita.";
    fb.className="pronunciation-feedback tryagain";
    fb.innerHTML=`<span class="pf-emoji">💪</span><div class="pf-text">Try again! ${analysis?.pct?analysis.pct+"%":""}</div><div class="pf-sub">${wf}</div>`;
    SoundFX.wrong(); score=0;
  }
  fb.style.display="block";
  showNextBtn('btn-next-exercise', score);
}

async function autoAdvance(score){
  const mission=getMission(currentSegmentId,currentPhaseId,currentMissionId);
  const total=mission?.phrases.length||1;

  if(_reviewMode){
    // Modo revisão — sem XP, sem salvar progresso
    if(currentPhraseIndex<total-1){
      currentPhraseIndex++;
      renderMission();
    } else {
      _reviewMode = false;
      showXpToast("✅ Revisão concluída!");
      backToDashboard();
    }
    return;
  }

  const xpGain=10; const newXp=(userData.xp||0)+xpGain;
  userData.xp=newXp; showXpToast(`+${xpGain} XP`);
  trackDailyXP(xpGain);
  trackAnswer(score>=5, true);
  await updateDailyProgress("exercise");
  if(score===10) await updateDailyProgress("perfect");
  await updateDailyProgress("segment");
  if(currentPhraseIndex<total-1){
    currentPhraseIndex++;
    saveProgressSafe(currentUser.uid,{xp:newXp,currentMission:{segmentId:currentSegmentId,phaseId:currentPhaseId,missionId:currentMissionId,phraseIndex:currentPhraseIndex}});
    renderMission();
  } else await completeMission(newXp);
}

function updateNavButtons(nextUnlocked, score){
  // NEXT — single bottom next button only
  document.querySelectorAll("#btn-next-main").forEach(btn=>{
    btn.style.display="block";
    if(nextUnlocked){
      btn.classList.add("visible");
      btn.textContent="Próximo →";
      btn.onclick=()=>{ vibrate(30); autoAdvance(score); };
    } else {
      btn.classList.remove("visible");
      btn.textContent="Responda para avançar →";
      btn.onclick=null;
    }
  });

  // PREV — always show if not first exercise
  const prevBtn=document.getElementById("btn-prev-exercise");
  if(prevBtn){
    if(currentPhraseIndex>0){
      prevBtn.style.display="flex";
      prevBtn.textContent="← Anterior";
      prevBtn.onclick=()=>{ vibrate(20); currentPhraseIndex=Math.max(0,currentPhraseIndex-1); renderMission(); };
    } else {
      prevBtn.style.display="none";
    }
  }
}

function showNextBtn(btnId, score){
  updateNavButtons(true, score);
}

function showLockedNextBtn(){
  updateNavButtons(false, 0);
}


async function nextPhrase(){ await autoAdvance(10); }

async function completeMission(xp){
  const mission=getMission(currentSegmentId,currentPhaseId,currentMissionId);
  const completed=[...new Set(userData.completedMissions||[])]; // dedup
  const key=`${currentSegmentId}_${currentPhaseId}_${currentMissionId}`;
  if(!completed.includes(key)) completed.push(key);
  if(completed.length>400) completed.splice(0, completed.length-400); // keep newest 400
  currentPhraseIndex=0;
  await saveProgressSafe(currentUser.uid,{xp:xp??userData.xp,completedMissions:completed,currentMission:{segmentId:currentSegmentId,phaseId:currentPhaseId,missionId:currentMissionId,phraseIndex:0}},true);
  userData.completedMissions=completed;
  updateStreakOnExercise().catch(()=>{});
  SoundFX.complete();
  if(completed.length===1) showNotifBanner();

  // Verificar level up
  checkLevelUp(xp??userData.xp);

  // Verificar se completou o segmento inteiro
  const totalSegMissions = (getSegment(currentSegmentId)?.phases||[]).reduce((a,p)=>(p.missions||[]).length+a, 0);
  const wasComplete = (completed.filter(m=>m.startsWith(currentSegmentId+"_")).length - 1) >= totalSegMissions;
  if(!wasComplete && checkSegmentComplete(currentSegmentId)){
    setTimeout(()=>showSegmentCelebration(currentSegmentId), 800);
  }

  const lv=levelInfo(xp??userData.xp);
  document.getElementById("complete-mission-name").textContent=stripEmoji(mission?.name||"");
  document.getElementById("complete-xp").textContent=xp??userData.xp;
  document.getElementById("complete-result-level").textContent=lv.label;
  document.getElementById("complete-result-text").textContent=lv.msg;
  const phase=getPhase(currentSegmentId,currentPhaseId);
  const missions=phase?.missions||[];
  const curIdx=missions.findIndex(m=>m.id===currentMissionId);
  const nextMission=missions[curIdx+1];
  const nextBtn=document.getElementById("btn-next-mission");
  if(nextMission){nextBtn.style.display="block";nextBtn.textContent=`Próxima: ${stripEmoji(nextMission.name)} →`;nextBtn.onclick=()=>enterMission(currentSegmentId,currentPhaseId,nextMission.id);}
  else nextBtn.style.display="none";
  showView("view-complete");
  // Show feedback popup after 2s on every 3rd mission
  if(completed.length % 7 === 0){
    setTimeout(()=>showPostMissionFeedback(), 1800);
  }
}

// ── CELEBRAÇÃO DE SEGMENTO COMPLETO ──────────────────────────────────────────
function checkSegmentComplete(segmentId){
  const seg = getSegment(segmentId);
  if(!seg) return false;
  const total = (seg.phases||[]).reduce((a,p)=>(p.missions||[]).length+a, 0);
  const done = (userData.completedMissions||[]).filter(m=>m.startsWith(segmentId+"_")).length;
  return total > 0 && done >= total;
}

function showSegmentCelebration(segmentId){
  const seg = getSegment(segmentId);
  if(!seg) return;

  // Badge do segmento correspondente
  const segBadges = {
    maritimo:{icon:"⚓",badge:"Master Mariner",color:"#4fc3f7"},
    comex:{icon:"🌍",badge:"Global Trader",color:"#81c784"},
    offshore:{icon:"🛢️",badge:"Offshore Pro",color:"#ffb74d"},
    hotelaria:{icon:"🏨",badge:"Concierge d'Excellence",color:"#f48fb1"},
    restaurantes:{icon:"🍽️",badge:"Head Waiter",color:"#ce93d8"},
    aeroporto:{icon:"✈️",badge:"Ground Control",color:"#80cbc4"},
    cruzeiros:{icon:"🛳️",badge:"Cruise Director",color:"#64b5f6"},
    corporativo:{icon:"💼",badge:"C-Suite English",color:"#a5d6a7"},
    saude:{icon:"🏥",badge:"Chief Medical Officer",color:"#ef9a9a"},
    transporte:{icon:"🚛",badge:"Road Commander",color:"#ffcc80"},
    varejo:{icon:"🛍️",badge:"Sales Champion",color:"#b39ddb"},
    turismo_santos:{icon:"🏖️",badge:"Santos Expert",color:"#80deea"},
  };
  const info = segBadges[segmentId] || {icon:seg.icon||"🏆",badge:"Segmento Completo",color:"#ffd700"};

  document.getElementById("seg-cel-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "seg-cel-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);animation:fadeIn .4s ease;";

  overlay.innerHTML = `
    <div class="seg-cel-card">
      <canvas id="seg-cel-canvas" style="position:absolute;inset:0;pointer-events:none;border-radius:24px;"></canvas>
      <div class="seg-cel-glow" style="background:radial-gradient(circle,${info.color}22 0%,transparent 70%);"></div>
      <div class="seg-cel-icon" style="color:${info.color}">${info.icon}</div>
      <div class="seg-cel-title">Segmento Concluído!</div>
      <div class="seg-cel-seg-name" style="color:${info.color}">${seg.name}</div>
      <div class="seg-cel-badge-wrap">
        <div class="seg-cel-badge-label">Badge desbloqueado</div>
        <div class="seg-cel-badge-name" style="border-color:${info.color}44;color:${info.color}">
          ${info.icon} ${info.badge}
        </div>
      </div>
      <div class="seg-cel-xp">+200 XP 🌟</div>
      <button class="seg-cel-btn" style="background:linear-gradient(135deg,${info.color},${info.color}bb)" onclick="document.getElementById('seg-cel-overlay').remove();backToDashboard();">
        🚀 Continuar
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Confetti canvas
  setTimeout(() => {
    const canvas = document.getElementById("seg-cel-canvas");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const particles = Array.from({length:80},()=>({
      x: Math.random()*canvas.width,
      y: Math.random()*canvas.height - canvas.height,
      r: Math.random()*6+3,
      d: Math.random()*2+1,
      color: [info.color,"#ffd700","#ffffff","#a78bfa"][Math.floor(Math.random()*4)],
      tilt: Math.random()*10-5,
      ts: Math.random()*0.1,
    }));
    let frame = 0;
    function draw(){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      particles.forEach(p=>{
        ctx.beginPath();
        ctx.fillStyle=p.color;
        ctx.ellipse(p.x,p.y,p.r,p.r*0.6,p.tilt,0,Math.PI*2);
        ctx.fill();
        p.y += p.d; p.x += Math.sin(frame*p.ts)*1.5;
        if(p.y > canvas.height) { p.y=-10; p.x=Math.random()*canvas.width; }
      });
      frame++;
      if(frame < 180) requestAnimationFrame(draw);
    }
    draw();
  }, 100);

  SoundFX.complete();
  vibrate([100,50,100,50,200,50,300]);
}

// ── LEVEL UP ÉPICO ────────────────────────────────────────────────────────────
let _lastLevel = 0;

function checkLevelUp(newXp){
  const newLevel = calcLevel(newXp);
  const oldLevel = _lastLevel || calcLevel((userData.xp||0) - 1);
  if(newLevel > oldLevel && oldLevel > 0){
    _lastLevel = newLevel;
    setTimeout(()=>showLevelUp(newLevel), 600);
  }
  _lastLevel = newLevel;
}

function showLevelUp(level){
  const titles = [
    "","Aprendiz","Estudante","Explorador","Aventureiro","Navegador",
    "Oficial","Imediato","Capitão","Mestre","Almirante",
    "Lenda","Elite","Expert","Ícone","Campeão",
  ];
  const title = titles[Math.min(level, titles.length-1)] || "Mestre";
  const colors = level<=3?"#4ade80":level<=6?"#60a5fa":level<=9?"#a78bfa":"#ffd700";

  document.getElementById("lvlup-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "lvlup-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9997;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.88);animation:fadeIn .3s ease;";
  overlay.innerHTML = `
    <div class="lvlup-card">
      <div class="lvlup-rays"></div>
      <div class="lvlup-badge" style="border-color:${colors};box-shadow:0 0 40px ${colors}66;">
        <div class="lvlup-num" style="color:${colors}">${level}</div>
        <div class="lvlup-lbl">NÍVEL</div>
      </div>
      <div class="lvlup-title" style="color:${colors}">Level Up! ⚡</div>
      <div class="lvlup-rank">${title}</div>
      <div class="lvlup-sub">Você está evoluindo! Continue assim.</div>
      <button class="lvlup-btn" style="border-color:${colors};color:${colors}" onclick="document.getElementById('lvlup-overlay').remove()">
        Continuar! →
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  SoundFX.complete();
  vibrate([100,50,200,50,100,50,300]);
  setTimeout(()=>document.getElementById("lvlup-overlay")?.remove(), 5000);
}

function buildMissionSummary(){
  // Montar lista de frases aprendidas na missão
  const mission = getMission(currentSegmentId, currentPhaseId, currentMissionId);
  if(!mission?.phrases?.length) return "";
  const learned = mission.phrases.slice(0, 5).map(p => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:18px;flex-shrink:0;">🔤</span>
      <div>
        <div style="font-size:14px;font-weight:700;color:#fff;">${p.en||""}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${p.pt||""}</div>
      </div>
    </div>
  `).join("");
  return learned ? `
    <div style="margin-top:20px;text-align:left;">
      <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">
        📚 O que você aprendeu hoje
      </div>
      ${learned}
    </div>` : "";
}

function showPostMissionFeedback(){
  document.getElementById("post-mission-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="post-mission-modal";
  modal.className="post-mission-modal";
  modal.innerHTML=`
    <div class="pmm-card">
      <button class="pmm-close" onclick="document.getElementById('post-mission-modal').remove()">✕</button>
      <div class="pmm-title">Você está gostando? 😊</div>
      <div class="feedback-stars pmm-stars" id="pmm-stars">
        <span class="feedback-star" data-v="1">⭐</span>
        <span class="feedback-star" data-v="2">⭐</span>
        <span class="feedback-star" data-v="3">⭐</span>
        <span class="feedback-star" data-v="4">⭐</span>
        <span class="feedback-star" data-v="5">⭐</span>
      </div>
      <div class="pmm-actions">
        <button class="pmm-btn pmm-like" onclick="saveFeedback({type:'like'});showXpToast('👍 Obrigado!');document.getElementById('post-mission-modal').remove()">👍 Gostei</button>
        <button class="pmm-btn pmm-comment" onclick="document.getElementById('post-mission-modal').remove();openFeedbackModal('💬 Comentário','comment')">💬 Comentar</button>
        <button class="pmm-btn pmm-bug" onclick="document.getElementById('post-mission-modal').remove();openFeedbackModal('🐛 Reportar bug','bug')">🐛 Bug</button>
      </div>
      <div class="pmm-share-title">Compartilhe seu progresso!</div>
      <div class="pmm-share-row">
        <a href="https://wa.me/?text=${encodeURIComponent('Estou aprendendo inglês com o VIC English App! 🚀 app.viclanguage.com.br')}" target="_blank" class="pmm-share-btn pmm-wa">📱</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://app.viclanguage.com.br')}" target="_blank" class="pmm-share-btn pmm-fb">👥</a>
        <a href="https://www.instagram.com/" target="_blank" class="pmm-share-btn pmm-ig">📸</a>
        <button class="pmm-share-btn pmm-copy" onclick="navigator.clipboard.writeText('https://app.viclanguage.com.br').then(()=>showXpToast('🔗 Link copiado!'))">🔗</button>
      </div>
    </div>`;
  // Wire stars
  modal.querySelectorAll(".feedback-star").forEach(star=>{
    star.addEventListener("click",()=>{
      const v=parseInt(star.dataset.v);
      modal.querySelectorAll(".feedback-star").forEach((s,i)=>s.classList.toggle("active",i<v));
      saveFeedback({type:"rating",value:v});
    });
  });
  document.body.appendChild(modal);
}

function showXpToast(msg){const t=document.getElementById("xp-toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
function backToDashboard(){renderDashboard();showView("view-dashboard");}

// ── MODO REVISÃO ──────────────────────────────────────────────────────────────
// Permite rever missões já completadas sem contar progresso novo
let _reviewMode = false;

function enterReviewMode(segmentId, phaseId, missionId){
  _reviewMode = true;
  // Mostrar banner de revisão
  showXpToast("🔄 Modo revisão — sem XP novo");
  enterMission(segmentId, phaseId, missionId);
}

function getLastCompletedMission(){
  const completed = userData?.completedMissions||[];
  if(!completed.length) return null;
  const last = completed[completed.length-1];
  const parts = last.split("_");
  if(parts.length < 3) return null;
  // formato: segmentId_phaseId_missionId
  const missionId = parts[parts.length-1];
  const phaseId   = parts[parts.length-2];
  const segmentId = parts.slice(0,-2).join("_");
  return {segmentId, phaseId, missionId};
}

function showReviewPanel(){
  const completed = userData?.completedMissions||[];
  if(!completed.length){
    showXpToast("📚 Complete algumas missões primeiro!");
    return;
  }

  document.getElementById("review-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "review-modal";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.85);display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .3s ease;backdrop-filter:blur(4px);";

  // Agrupar missões completadas por segmento
  const bySegment = {};
  completed.forEach(key=>{
    const parts = key.split("_");
    const segId = parts.slice(0,-2).join("_") || parts[0];
    if(!bySegment[segId]) bySegment[segId]=[];
    bySegment[segId].push(key);
  });

  const segmentRows = Object.entries(bySegment).slice(0,6).map(([segId, keys])=>{
    const seg = getSegment(segId);
    if(!seg) return "";
    return `
      <div class="review-seg-row" onclick="reviewSegment('${segId}');document.getElementById('review-modal').remove()">
        <span class="review-seg-icon">${seg.icon||"📚"}</span>
        <div class="review-seg-info">
          <div class="review-seg-name">${seg.name}</div>
          <div class="review-seg-count">${keys.length} missão(ões) completada(s)</div>
        </div>
        <span class="review-seg-arrow">→</span>
      </div>
    `;
  }).join("");

  modal.innerHTML = `
    <div class="review-card">
      <div class="review-handle"></div>
      <div class="review-title">🔄 Revisar missões</div>
      <div class="review-sub">Pratique o que já aprendeu. Sem XP novo — só fixação!</div>
      <div class="review-segs">${segmentRows}</div>
      <button class="review-last-btn" onclick="reviewLastMission();document.getElementById('review-modal').remove()">
        ⚡ Rever última missão
      </button>
      <button class="review-close-btn" onclick="document.getElementById('review-modal').remove()">Fechar</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function reviewLastMission(){
  const last = getLastCompletedMission();
  if(!last){ showXpToast("Nenhuma missão completada ainda!"); return; }
  enterReviewMode(last.segmentId, last.phaseId, last.missionId);
}

function reviewSegment(segmentId){
  const seg = getSegment(segmentId);
  if(!seg) return;
  const completed = userData?.completedMissions||[];
  // Pegar primeira missão completada do segmento
  const first = completed.find(k=>k.startsWith(segmentId+"_"));
  if(!first) return;
  const parts = first.split("_");
  const missionId = parts[parts.length-1];
  const phaseId   = parts[parts.length-2];
  enterReviewMode(segmentId, phaseId, missionId);
}

// ── REFERRAL — Indicar amigo = Pro grátis ────────────────────────────────────
// Lógica: cada novo usuário pode ter um refCode na URL (?ref=CODIGO)
// Quando ele se cadastra, o código é atribuído ao dono → 3 indicações = 30 dias Pro

function getReferralCode(uid){
  // Código único baseado no UID
  return uid.slice(0,8).toUpperCase();
}

function getReferralLink(){
  const uid = currentUser?.uid;
  if(!uid) return "";
  const code = getReferralCode(uid);
  return `https://app.viclanguage.com.br?ref=${code}`;
}

async function checkReferralOnRegister(newUid){
  // Verificar se tem ref na URL
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get("ref");
  if(!refCode || refCode.length < 6) return;

  try{
    // Salvar ref no perfil do novo usuário
    await saveProgress(newUid, { referredBy: refCode });

    // Buscar quem tem esse código e incrementar contagem
    const all = await getAllUsers();
    const referrer = all.find(u=>u.uid.slice(0,8).toUpperCase()===refCode);
    if(!referrer || referrer.uid===newUid) return;

    const refCount = (referrer.referralCount||0)+1;
    const updates = { referralCount: refCount };

    // A cada 3 indicações → 30 dias de Pro grátis
    if(refCount % 3 === 0){
      updates.plan = "pro";
      updates.proActivatedAt = Date.now();
      updates.proSource = "referral";
      // Notificar o referenciador
      showXpToast("🎉 3 indicações! Pro ativado para seu amigo!");
    }

    await saveProgress(referrer.uid, updates);
    console.log(`✅ Referral registrado: ${refCode} agora tem ${refCount} indicações`);
  }catch(e){
    console.warn("Referral error:", e.message);
  }
}

function showReferralPanel(){
  const link = getReferralLink();
  if(!link){ showXpToast("Faça login para indicar amigos!"); return; }

  const refCount = userData?.referralCount||0;
  const needed = 3 - (refCount%3);
  const total = Math.floor(refCount/3);

  document.getElementById("referral-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "referral-modal";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;animation:fadeIn .3s ease;padding:20px;";

  modal.innerHTML = `
    <div class="referral-card">
      <button class="referral-close" onclick="document.getElementById('referral-modal').remove()">✕</button>
      <div class="referral-icon">🎁</div>
      <div class="referral-title">Indique amigos,<br/>ganhe Pro grátis!</div>
      <div class="referral-sub">Cada 3 amigos que se cadastrarem = <strong>30 dias de Pro</strong> para você!</div>

      <div class="referral-progress">
        <div class="referral-prog-bar">
          <div class="referral-prog-fill" style="width:${Math.round(((refCount%3)/3)*100)}%"></div>
        </div>
        <div class="referral-prog-text">${refCount%3}/3 indicações ${total>0?`• ${total} mês(es) Pro ganho(s)`:""}</div>
      </div>

      <div class="referral-link-box" id="ref-link-box">${link}</div>

      <div class="referral-btns">
        <button class="referral-btn-copy" onclick="
          navigator.clipboard.writeText('${link}').then(()=>showXpToast('🔗 Link copiado!'));
        ">📋 Copiar link</button>
        <a class="referral-btn-wa" href="https://wa.me/?text=${encodeURIComponent("Estou usando o VIC English pra aprender inglês profissional! Entra por esse link: "+link)}" target="_blank">
          📱 Enviar no WhatsApp
        </a>
      </div>

      <div class="referral-tip">💡 Funciona para login por Email. Google e anônimo não contam.</div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ── FLASHCARDS ────────────────────────────────────────────────────────────────
function openFlashcards(){
  const list=document.getElementById("fc-deck-list"); list.innerHTML="";
  document.getElementById("fc-deck-selector").style.display="block";
  document.getElementById("fc-player").style.display="none";
  VICTOR_DATA.flashcardDecks.forEach(deck=>{
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`<div class="phase-left"><div class="phase-num">${deck.name}</div><div class="phase-sub">${deck.cards.length} cards</div></div><div class="phase-right">→</div>`;
    div.addEventListener("click",()=>startFlashcardDeck(deck.id));
    list.appendChild(div);
  });
  showView("view-flashcards");
}
function startFlashcardDeck(deckId){
  const deck=VICTOR_DATA.flashcardDecks.find(d=>d.id===deckId); if(!deck) return;
  fcDeckId=deckId; fcCards=shuffle([...deck.cards]); fcIndex=0; fcFlipped=false; fcXP=0;
  document.getElementById("fc-deck-selector").style.display="none";
  document.getElementById("fc-player").style.display="block";
  renderFlashcard();
}
function renderFlashcard(){
  if(fcIndex>=fcCards.length){showXpToast(`🃏 +${fcXP} XP`);openFlashcards();return;}
  const card=fcCards[fcIndex]; fcFlipped=false;
  document.getElementById("fc-counter").textContent=`${fcIndex+1} / ${fcCards.length}`;
  document.getElementById("fc-word").textContent=card.en;
  document.getElementById("fc-pron-pt").textContent=`/${card.pronPT}/`;
  document.getElementById("fc-translation").textContent=card.pt;
  document.getElementById("flashcard").classList.remove("flipped");
}
window.flipCard=()=>{const fc=document.getElementById("flashcard");fc.classList.toggle("flipped");fcFlipped=!fcFlipped;if(fcFlipped)SoundFX.speakEN(fcCards[fcIndex].en);};
window.speakFC=()=>SoundFX.speakEN(fcCards[fcIndex].en);
window.speakFCSlow=()=>SoundFX.speakEN(fcCards[fcIndex].en,0.5);
window.speakFCPT=()=>SoundFX.speakPT(fcCards[fcIndex].pt);
function fcRight(){SoundFX.correct();fcXP+=10;fcIndex++;renderFlashcard();updateDailyProgress("flashcard");}
function fcWrong(){SoundFX.wrong();fcCards.push(fcCards[fcIndex]);fcIndex++;renderFlashcard();}

// ── FREE MEMORY GAME ──────────────────────────────────────────────────────────
// Memory topic groups — each topic has multiple games of max 8 pairs
const MEMORY_TOPICS = [
  { id:"porto",    name:"⚓ Porto & Marítimo",    icon:"⚓" },
  { id:"comex",    name:"🌍 COMEX",               icon:"🌍" },
  { id:"hotelaria",name:"🏨 Hotelaria",           icon:"🏨" },
  { id:"restaurantes",name:"🍽️ Restaurantes",     icon:"🍽️" },
  { id:"aeroporto",name:"✈️ Aeroporto",           icon:"✈️" },
  { id:"cruzeiros",name:"🛳️ Cruzeiros",           icon:"🛳️" },
  { id:"transporte",name:"🚗 Transporte & Uber",  icon:"🚗" },
  { id:"saude",    name:"🏥 Saúde",               icon:"🏥" },
  { id:"offshore", name:"🛢️ Offshore",            icon:"🛢️" },
  { id:"corporativo",name:"💼 Corporativo",        icon:"💼" },
  { id:"varejo",   name:"🛒 Varejo",              icon:"🛒" },
  { id:"homofonas",name:"👂 Homófonas",           icon:"👂" },
  { id:"phrasal",  name:"⚡ Phrasal Verbs",       icon:"⚡" },
  { id:"falsefriends",name:"🤝 False Friends",    icon:"🤝" },
  { id:"gramatica",name:"📖 Gramática",           icon:"📖" },
  { id:"geral",    name:"🌟 Geral",               icon:"🌟" },
];

// Map theme IDs to topic groups
const THEME_TO_TOPIC = {
  maritimo_porto1:"porto", maritimo_porto2:"porto",
  comex_mem1:"comex", comex_mem2:"comex",
  hotel_mem:"hotelaria",
  restaurant_mem:"restaurantes",
  airport_mem:"aeroporto",
  cruise_mem:"cruzeiros",
  transport_mem:"transporte",
  health_mem:"saude",
  offshore_mem:"offshore",
  corporate_mem1:"corporativo", corporate_mem2:"corporativo",
  varejo_mem:"varejo",
  homophones_mem:"homofonas",
  phrasal_verbs_mem:"phrasal",
  false_friends_mem:"falsefriends",
  animais:"geral", frutas:"geral", comidas:"geral",
  objetos:"geral", lugares:"geral", paises:"geral", numeros:"geral",
  there_forms_mem:"gramatica",
};

function openMemoryFree(){
  document.getElementById("mem-theme-selector").style.display="block";
  document.getElementById("mem-board").style.display="none";
  const list=document.getElementById("mem-theme-list"); list.innerHTML="";

  // Group themes by topic
  const topicMap={};
  VICTOR_DATA.memoryThemes.forEach(theme=>{
    const topicId=THEME_TO_TOPIC[theme.id]||"geral";
    if(!topicMap[topicId]) topicMap[topicId]=[];
    topicMap[topicId].push(theme);
  });

  // Also pull pairs from segment missions
  VICTOR_DATA.segments.filter(s=>s.available&&s.phases).forEach(seg=>{
    const pairs=[];
    seg.phases.forEach(ph=>(ph.missions||[]).forEach(m=>(m.phrases||[]).filter(p=>p.type==="memory_match"&&p.pairs).forEach(p=>pairs.push(...p.pairs))));
    if(!pairs.length) return;
    const topicId=seg.id==="maritimo"?"porto":seg.id==="comex"?"comex":seg.id==="hotelaria"?"hotelaria":seg.id==="restaurantes"?"restaurantes":seg.id==="aeroporto"?"aeroporto":seg.id==="cruzeiros"?"cruzeiros":seg.id==="transporte"?"transporte":seg.id==="saude"?"saude":seg.id==="offshore"?"offshore":seg.id==="corporativo"?"corporativo":seg.id==="varejo"?"varejo":seg.id==="gramatica"?"gramatica":"geral";
    if(!topicMap[topicId]) topicMap[topicId]=[];
    // Add segment pairs as synthetic themes (deduplicated, chunked to 8)
    const unique=[...new Map(pairs.map(p=>[p.a,p])).values()];
    for(let i=0;i<unique.length;i+=8){
      topicMap[topicId].push({id:`${seg.id}_seg_${i}`,name:`${seg.icon} ${seg.name}`,pairs:unique.slice(i,i+8),_fromSeg:true});
    }
  });

  // Render topic buttons
  MEMORY_TOPICS.forEach(topic=>{
    const themes=topicMap[topic.id];
    if(!themes||!themes.length) return;
    // Merge all pairs, deduplicate
    const allPairs=[...new Map(themes.flatMap(t=>t.pairs||[]).map(p=>[p.a||p.en,p])).values()];
    if(!allPairs.length) return;
    const gameCount=Math.ceil(allPairs.length/8);
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`
      <div class="phase-left">
        <div class="phase-num">${topic.name}</div>
        <div class="phase-sub">${allPairs.length} pares · ${gameCount} jogo${gameCount>1?"s":""}</div>
      </div>
      <div class="phase-right">→</div>`;
    div.addEventListener("click",()=>openMemorySubGames(topic,allPairs));
    list.appendChild(div);
  });
  showView("view-memory-free");
}

function openMemorySubGames(topic,allPairs){
  const list=document.getElementById("mem-theme-list"); list.innerHTML="";
  document.getElementById("mem-theme-selector").style.display="block";
  document.getElementById("mem-board").style.display="none";

  // Back button
  const back=document.createElement("button"); back.className="btn-back-sm"; back.textContent="← Temas";
  back.addEventListener("click",openMemoryFree); list.appendChild(back);

  const title=document.createElement("div"); title.className="section-label"; title.style.margin="12px 0 8px"; title.textContent=topic.name;
  list.appendChild(title);

  // Chunk into games of 8 pairs
  const gameCount=Math.ceil(allPairs.length/8);
  for(let g=0;g<gameCount;g++){
    const gamePairs=allPairs.slice(g*8,(g+1)*8);
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`
      <div class="phase-left">
        <div class="phase-num">🎮 Jogo ${g+1}</div>
        <div class="phase-sub">${gamePairs.length} pares</div>
      </div>
      <div class="phase-right">→</div>`;
    div.addEventListener("click",()=>startFreeMemoryCustom(gamePairs,`${topic.name} — Jogo ${g+1}`));
    list.appendChild(div);
  }
}

function startFreeMemoryCustom(pairs,label){
  freeMemSelected=[]; freeMemMatched=0; freeMemXP=0;
  document.getElementById("mem-theme-selector").style.display="none";
  document.getElementById("mem-board").style.display="block";
  document.getElementById("mem-pairs-left").textContent=`🃏 ${pairs.length} pares`;
  document.getElementById("mem-score-display").textContent="XP: 0";
  renderFreeMemoryBoard(pairs);
}
function renderFreeMemoryBoard(pairs){
  const grid=document.getElementById("memory-grid-free"); grid.innerHTML="";
  const cards=[...pairs.map(p=>({text:p.en||p.a,lang:"en",pair:p.en||p.a})),...pairs.map(p=>({text:p.pt||p.b,lang:"pt",pair:p.en||p.a}))];
  shuffle(cards).forEach(card=>{
    const div=document.createElement("div"); div.className="mem-card-free"; div.dataset.pair=card.pair; div.dataset.lang=card.lang;
    const display=card.text; // keep emoji for memory aid
    div.innerHTML=`<div class="mcf-inner"><div class="mcf-front">?</div><div class="mcf-back">${display}</div></div>`;
    div.addEventListener("click",()=>handleFreeMemCard(div,pairs.length));
    grid.appendChild(div);
  });
}
function handleFreeMemCard(div,total){
  if(div.classList.contains("flipped")||div.classList.contains("matched")) return;
  if(freeMemSelected.length===2) return;
  div.classList.add("flipped");
  const text=div.querySelector(".mcf-back").textContent;
  div.dataset.lang==="en"?SoundFX.speakEN(stripEmoji(text)):SoundFX.speakPT(stripEmoji(text));
  freeMemSelected.push(div);
  if(freeMemSelected.length===2){
    const [a,b]=freeMemSelected;
    if(a.dataset.pair===b.dataset.pair&&a.dataset.lang!==b.dataset.lang){
      a.classList.add("matched");b.classList.add("matched");SoundFX.correct();freeMemMatched++;freeMemXP+=10;
      document.getElementById("mem-score-display").textContent=`XP: ${freeMemXP}`;
      freeMemSelected=[];
      if(freeMemMatched===total){showXpToast(`🧠 +${freeMemXP} XP`);if(currentUser){userData.xp=(userData.xp||0)+freeMemXP;saveProgressSafe(currentUser.uid,{xp:userData.xp});updateStreakOnExercise().catch(()=>{});};updateDailyProgress("memory");setTimeout(()=>openMemoryFree(),1500);}
    } else {SoundFX.wrong();setTimeout(()=>{a.classList.remove("flipped");b.classList.remove("flipped");freeMemSelected=[];},900);}
  }
}

// ── TRUE / FALSE ──────────────────────────────────────────────────────────────
function openTrueFalse(){
  document.getElementById("tf-selector").style.display="block";
  document.getElementById("tf-board").style.display="none";
  document.getElementById("tf-result").style.display="none";
  const list=document.getElementById("tf-category-list"); list.innerHTML="";
  VICTOR_DATA.trueFalseCategories.forEach(cat=>{
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`<div class="phase-left"><div class="phase-num">${cat.name}</div><div class="phase-sub">${cat.description}</div></div><div class="phase-right">→</div>`;
    div.addEventListener("click",()=>startTrueFalse(cat.id));
    list.appendChild(div);
  });
  showView("view-truefalse");
}
function startTrueFalse(catId){
  tfCategory=VICTOR_DATA.trueFalseCategories.find(c=>c.id===catId); if(!tfCategory) return;
  tfItems=shuffle([...tfCategory.items]); tfIndex=0; tfScore=0;
  document.getElementById("tf-selector").style.display="none";
  document.getElementById("tf-board").style.display="block";
  document.getElementById("tf-result").style.display="none";
  renderTFQuestion();
}
function renderTFQuestion(){
  const q=tfItems[tfIndex];
  document.getElementById("tf-counter").textContent=`${tfIndex+1} / ${tfItems.length}`;
  document.getElementById("tf-score-display").textContent=`+${tfScore} pts`;
  document.getElementById("tf-progress-bar").style.width=`${Math.round((tfIndex/tfItems.length)*100)}%`;
  document.getElementById("tf-category-tag").textContent=tfCategory.name;
  document.getElementById("tf-statement").textContent=q.statement;
  // Show PT translation if available
  const ptEl=document.getElementById("tf-pt-translation");
  if(ptEl) ptEl.textContent=q.pt||"";
  document.getElementById("tf-feedback").style.display="none";
  // enable + reset buttons
  const tBtn=document.getElementById("tf-true"), fBtn=document.getElementById("tf-false");
  tBtn.disabled=false; fBtn.disabled=false;
  tBtn.classList.remove("correct","wrong"); fBtn.classList.remove("correct","wrong");
  // auto-speak
  SoundFX.speakEN(stripEmoji(q.statement));
}
function handleTFAnswer(answer){
  const q=tfItems[tfIndex];
  const correct=answer===q.answer;
  if(correct){tfScore+=10;SoundFX.correct();}else SoundFX.wrong();
  const fb=document.getElementById("tf-feedback");
  fb.className=`tf-feedback ${correct?"correct":"wrong"}`;
  fb.innerHTML=correct?`✅ Correto! +10 pts<br><small>${q.explanation}</small>`:`❌ ${q.answer?"Verdadeiro":"Falso"}!<br><small>${q.explanation}</small>`;
  fb.style.display="block";
  document.getElementById("tf-true").disabled=true; document.getElementById("tf-false").disabled=true;
  document.getElementById(answer?"tf-true":"tf-false").classList.add(correct?"correct":"wrong");
  // show NEXT button
  const nextBtn=document.getElementById("btn-tf-next");
  if(nextBtn) nextBtn.style.display="block";
}
function tfNext(){
  document.getElementById("btn-tf-next").style.display="none";
  tfIndex++;
  if(tfIndex<tfItems.length) renderTFQuestion();
  else showTFResult();
}
function showTFResult(){
  const max=tfItems.length*10, pct=Math.round((tfScore/max)*100);
  document.getElementById("tf-board").style.display="none";
  document.getElementById("tf-result").style.display="block";
  document.getElementById("tf-result-score").textContent=`${tfScore} / ${max} pts — ${pct}%`;
  document.getElementById("tf-result-msg").textContent=pct>=80?"Excelente! 🌟":pct>=50?"Bom trabalho! 👍":"Continue praticando! 💪";
  document.getElementById("tf-result-bar").style.width=`${pct}%`;
  showXpToast(`✅ +${tfScore} XP`);
  if(currentUser){userData.xp=(userData.xp||0)+tfScore;saveProgressSafe(currentUser.uid,{xp:userData.xp});updateStreakOnExercise().catch(()=>{});}
  SoundFX.complete();
}

// ── DIALOGUE GAME ──────────────────────────────────────────────────────────────
function openDialogue(){
  document.getElementById("dlg-selector").style.display="block";
  document.getElementById("dlg-board").style.display="none";
  document.getElementById("dlg-result").style.display="none";
  renderDialogueSegments();
  showView("view-dialogue");
}

function renderDialogueSegments(){
  const list=document.getElementById("dlg-scenario-list"); list.innerHTML="";

  // Group scenarios by segment
  const groups={};
  VICTOR_DATA.dialogueScenarios.forEach(sc=>{
    const seg=sc.segment||"Geral";
    if(!groups[seg]) groups[seg]=[];
    groups[seg].push(sc);
  });

  // Find segment icon
  const segIcon=name=>{
    const s=VICTOR_DATA.segments.find(s=>name.toLowerCase().includes(s.name.toLowerCase().split(" ")[0].toLowerCase()));
    return s?.icon||"💬";
  };

  Object.entries(groups).forEach(([segName, scenarios])=>{
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`
      <div class="phase-left">
        <div class="phase-num">${segIcon(segName)} ${segName}</div>
        <div class="phase-sub">${scenarios.length} cenário${scenarios.length>1?"s":""} disponíve${scenarios.length>1?"is":"l"}</div>
      </div>
      <div class="phase-right">→</div>`;
    div.addEventListener("click",()=>renderDialogueScenarios(segName, scenarios));
    list.appendChild(div);
  });
}

function renderDialogueScenarios(segName, scenarios){
  const list=document.getElementById("dlg-scenario-list"); list.innerHTML="";

  // Back button
  const back=document.createElement("button");
  back.className="btn-back-sm"; back.textContent=t("back_segments");
  back.addEventListener("click",renderDialogueSegments);
  list.appendChild(back);

  const title=document.createElement("div");
  title.className="section-label"; title.style.margin="12px 0 8px";
  title.textContent=segName;
  list.appendChild(title);

  scenarios.forEach(sc=>{
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`
      <div class="phase-left">
        <div class="phase-num">${sc.name}</div>
        <div class="phase-sub">${sc.description}</div>
      </div>
      <div class="phase-right">→</div>`;
    div.addEventListener("click",()=>startDialogue(sc.id));
    list.appendChild(div);
  });
}

function startDialogue(scenarioId){
  dlgScenario=VICTOR_DATA.dialogueScenarios.find(s=>s.id===scenarioId); if(!dlgScenario) return;
  dlgIndex=0; dlgScore=0;
  document.getElementById("dlg-selector").style.display="none";
  document.getElementById("dlg-board").style.display="block";
  document.getElementById("dlg-result").style.display="none";
  document.getElementById("dlg-chat").innerHTML="";
  renderDlgLine();
}
// ── DIALOGUE HELPERS ─────────────────────────────────────────────────────────
async function translateWord(word, el){
  try{
    const clean=(word||"").replace(/[^a-zA-ZÀ-ú\s]/g,"").trim();
    if(!clean||clean.length<2) return;
    const res=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|pt`);
    const data=await res.json();
    const tr=data.responseData?.translatedText;
    if(tr&&tr.toLowerCase()!==clean.toLowerCase()){
      // Remove any existing tooltip
      el.querySelectorAll(".word-tooltip").forEach(t=>t.remove());
      const tip=document.createElement("span");
      tip.className="word-tooltip"; tip.textContent=tr;
      el.style.position="relative";
      el.appendChild(tip);
      setTimeout(()=>tip.remove(),2500);
    }
  }catch(e){ vicLog("tooltip","renderTooltip failed",e); }
}

function makeClickableText(text){
  return (text||"").split(/(\s+)/).map(part=>{
    if(/^\s+$/.test(part)) return part;
    const word=part.replace(/[.,!?;:[\]]/g,"");
    return `<span class="dlg-word" data-word="${word}">${part}</span>`;
  }).join("");
}

function wireWordClicks(container){
  container.querySelectorAll(".dlg-word").forEach(w=>{
    w.addEventListener("click",e=>{
      e.stopPropagation();
      translateWord(w.dataset.word, w);
    });
  });
}

function renderDlgLine(){
  const line=dlgScenario.lines[dlgIndex];
  const total=dlgScenario.lines.length;
  document.getElementById("dlg-counter").textContent=`${dlgIndex+1} / ${total}`;
  document.getElementById("dlg-score").textContent=`+${dlgScore} pts`;
  document.getElementById("dlg-progress-bar").style.width=`${Math.round((dlgIndex/total)*100)}%`;
  document.getElementById("dlg-feedback").style.display="none";

  if(!line.blank){
    addChatBubble(line.role, line.text);
    // Auto-speak immediately
    setTimeout(()=>SoundFX.speakEN(stripEmoji(line.text)), 200);
    document.getElementById("dlg-role").textContent="";
    document.getElementById("dlg-line").innerHTML="";
    document.getElementById("dlg-options").innerHTML="";
    document.getElementById("dlg-card").style.opacity="0.5";
    const words=line.text.split(" ").length;
    const delay=Math.max(2200, words*380);
    setTimeout(()=>{
      dlgIndex++;
      document.getElementById("dlg-card").style.opacity="1";
      if(dlgIndex<dlgScenario.lines.length) renderDlgLine();
      else showDlgResult();
    }, delay);
    return;
  }

  document.getElementById("dlg-card").style.opacity="1";
  document.getElementById("dlg-role").textContent=line.role+":";
  document.getElementById("dlg-line").innerHTML=makeClickableText(line.text);
  document.getElementById("dlg-sound").onclick=()=>SoundFX.speakEN(stripEmoji(line.text.replace("___",line.options[line.correct])));

  // Wire word clicks for translation
  const dlgLineEl=document.getElementById("dlg-line");
  if(dlgLineEl) wireWordClicks(dlgLineEl);

  // PT translation of the full line
  const ptBox=document.getElementById("dlg-line-pt");
  if(ptBox){
    ptBox.textContent="";
    const fullEN=line.text.replace("___","___");
    fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(fullEN.replace("___","..."))}&langpair=en|pt`)
      .then(r=>r.json()).then(d=>{
        if(d.responseData?.translatedText) ptBox.textContent=d.responseData.translatedText;
      }).catch(()=>{});
    // Also show PT speak button
    const ptSpeak=document.getElementById("dlg-sound-pt");
    if(ptSpeak) ptSpeak.onclick=()=>{if(ptBox.textContent) SoundFX.speakPT(ptBox.textContent);};
  }

  const indices=shuffle([...Array(line.options.length).keys()]);
  const newCorrect=indices.indexOf(line.correct);
  const wrap=document.getElementById("dlg-options"); wrap.innerHTML="";
  indices.forEach((origIdx,newIdx)=>{
    const opt=line.options[origIdx];
    const btn=document.createElement("button"); btn.className="dlg-option"; btn.textContent=opt;
    btn.addEventListener("click",()=>{
      const correct=newIdx===newCorrect;
      if(correct){dlgScore+=10;SoundFX.correct();}else SoundFX.wrong();
      wrap.querySelectorAll(".dlg-option").forEach((b,j)=>{
        b.disabled=true;
        if(j===newCorrect) b.classList.add("correct");
        else if(j===newIdx&&!correct) b.classList.add("wrong");
      });
      const fullText=line.text.replace("___",`[${line.options[line.correct]}]`);
      addChatBubble(line.role,fullText,correct);
      // Auto-speak the completed sentence
      SoundFX.speakEN(stripEmoji(fullText.replace(/\[|\]/g,"")));
      const fb=document.getElementById("dlg-feedback");
      fb.className=`dlg-feedback ${correct?"correct":"wrong"}`;
      fb.innerHTML=correct?`${t("correct")} +10 pts`:`✅ Era: <strong>${line.options[line.correct]}</strong>`;
      fb.style.display="block";
      setTimeout(()=>{dlgIndex++;if(dlgIndex<dlgScenario.lines.length)renderDlgLine();else showDlgResult();},2000);
    });
    wrap.appendChild(btn);
  });
}

function addChatBubble(role,text,correct=null){
  const chat=document.getElementById("dlg-chat");
  const staffRoles=["Staff","Agent","Waiter","Guide","Manager","Concierge","Inspector","Control","Supervisor","Officer","OutgoingOp","IncomingOp"];
  const isStaff=staffRoles.includes(role);
  const div=document.createElement("div");
  div.className=`dlg-bubble ${isStaff?"bubble-right":"bubble-left"}${correct===false?" bubble-wrong":""}`;

  // Make words clickable in bubbles too
  const clickableText=text.split(/(\s+)/).map(part=>{
    if(/\s/.test(part)) return part;
    const word=part.replace(/[.,!?;:[\]]/g,"");
    return `<span class="dlg-word" data-word="${word}">${part}</span>`;
  }).join("");

  div.innerHTML=`<span class="dlg-bubble-role">${role}</span><span class="dlg-bubble-text">${clickableText}</span>`;

  // Wire word clicks
  div.querySelectorAll(".dlg-word").forEach(w=>{
    w.addEventListener("click",async e=>{
      e.stopPropagation();
      const word=w.dataset.word;
      if(!word||word.length<2) return;
      try{
        const res=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|pt`);
        const data=await res.json();
        const tr=data.responseData?.translatedText;
        if(tr&&tr.toLowerCase()!==word.toLowerCase()){
          const tip=document.createElement("span");
          tip.className="word-tooltip"; tip.textContent=tr;
          w.style.position="relative";
          w.appendChild(tip);
          setTimeout(()=>tip.remove(),2500);
        }
      }catch(e){ vicLog("tooltip","word click tooltip failed",e); }
    });
  });

  chat.appendChild(div);
  chat.scrollTop=chat.scrollHeight;
}
function showDlgResult(){
  const max=dlgScenario.lines.filter(l=>l.blank).length*10;
  const pct=max?Math.round((dlgScore/max)*100):100;
  document.getElementById("dlg-board").style.display="none";
  document.getElementById("dlg-result").style.display="block";
  document.getElementById("dlg-result-score").textContent=`${dlgScore} / ${max} pts`;
  document.getElementById("dlg-result-msg").textContent=pct>=80?"Conversa fluente! 🌟":pct>=50?"Bom trabalho! 👍":"Pratique mais! 💪";
  showXpToast(`💬 +${dlgScore} XP`);
  if(currentUser){userData.xp=(userData.xp||0)+dlgScore;saveProgressSafe(currentUser.uid,{xp:userData.xp});updateStreakOnExercise().catch(()=>{});}
  updateDailyProgress("dialogue");
  SoundFX.complete();
}

// ── MODAL TAB SWITCH ─────────────────────────────────────────────────────────
window.switchModalTab=function(tab){
  ["info","access","edit"].forEach(t=>{
    const el=document.getElementById(`modal-tab-${t}`);
    if(el) el.style.display=t===tab?"block":"none";
    document.getElementById(`tab-${t}`)?.classList.toggle("active",t===tab);
  });
  if(tab==="access"&&_currentModalUser) renderAccessControl(_currentModalUser);
  if(tab==="edit"&&_currentModalUser) populateEditForm(_currentModalUser);
};

function populateEditForm(u){
  const e=v=>document.getElementById(v);
  if(e("edit-name"))    e("edit-name").value=u.name||"";
  if(e("edit-xp"))      e("edit-xp").value=u.xp||0;
  if(e("edit-streak"))  e("edit-streak").value=u.streak||0;
  if(e("edit-level"))   e("edit-level").value=u.detectedLevel||"a1";
  if(e("admin-edit-msg")) e("admin-edit-msg").textContent="";
}

async function saveAdminEdit(){
  if(!_currentModalUser) return;
  const u=_currentModalUser;
  const msg=document.getElementById("admin-edit-msg");
  msg.textContent="Salvando...";
  try{
    const updates={
      name:document.getElementById("edit-name").value.trim()||u.name,
      xp:parseInt(document.getElementById("edit-xp").value)||0,
      streak:parseInt(document.getElementById("edit-streak").value)||0,
      detectedLevel:document.getElementById("edit-level").value,
    };
    await saveProgress(u.uid,updates);
    Object.assign(u,updates);
    const cached=adminUsers.find(x=>x.uid===u.uid); if(cached) Object.assign(cached,updates);
    msg.textContent="✅ Salvo!";
    msg.style.color="#4ade80";
    renderAdminUsers();
  }catch(e){msg.textContent="❌ Erro: "+e.message; msg.style.color="#ef4444";}
}

async function resetUserProgress(){
  if(!_currentModalUser) return;
  if(!confirm(`Resetar TODO o progresso de ${_currentModalUser.name}? Esta ação não pode ser desfeita.`)) return;
  const msg=document.getElementById("admin-edit-msg");
  msg.textContent="Resetando...";
  try{
    await saveProgress(_currentModalUser.uid,{
      xp:0,streak:0,completedMissions:[],diagnosisAnswers:null,
      currentMission:{segmentId:"maritimo",phaseId:"f1",missionId:"vocab_basico",phraseIndex:0},
      xpHistory:{},
    });
    msg.textContent="✅ Progresso resetado!";
    msg.style.color="#f59e0b";
    await refreshAdminUsers();
  }catch(e){msg.textContent="❌ Erro: "+e.message;}
}

async function deleteUser(){
  if(!_currentModalUser) return;
  const name=_currentModalUser.name||"este usuário";
  if(!confirm(`⚠️ EXCLUIR a conta de ${name}?\n\nIsso vai apagar todos os dados do Firestore. O login Firebase não será removido (requer Admin SDK), mas o perfil será deletado.`)) return;
  const msg=document.getElementById("admin-edit-msg");
  msg.textContent="Excluindo...";
  try{
    const {db}=await import("./firebase.js");
    const {doc,deleteDoc}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await deleteDoc(doc(db,"users",_currentModalUser.uid));
    adminUsers=adminUsers.filter(u=>u.uid!==_currentModalUser.uid);
    document.getElementById("admin-modal").style.display="none";
    renderAdminUsers();
    showXpToast("🗑️ Conta excluída!");
  }catch(e){msg.textContent="❌ Erro: "+e.message; msg.style.color="#ef4444";}
}

async function activatePro(isActive){
  if(!_currentModalUser) return;
  await saveProgress(_currentModalUser.uid,{plan:isActive?"pro":"free"});
  _currentModalUser.plan=isActive?"pro":"free";
  const cached=adminUsers.find(x=>x.uid===_currentModalUser.uid); if(cached) cached.plan=isActive?"pro":"free";
  showXpToast(isActive?"⭐ Pro ativado!":"↩️ Pro removido!");
  renderAdminUsers();
}

// ── PREVIEW MODE — visualizar como qualquer usuário ─────────────────────────
let _previewOriginalData = null; // guarda dados reais do owner

function enterPreviewMode(targetUid=null){
  // Guardar estado real do owner
  _previewOriginalData = JSON.parse(JSON.stringify(userData));

  if(targetUid && targetUid !== currentUser.uid){
    // Visualizar como usuário específico
    const target = adminUsers.find(u=>u.uid===targetUid);
    if(!target){ showXpToast("Usuário não encontrado"); return; }
    userData = { ...target, _adminPreview:true, _previewUid: targetUid };
    showXpToast(`👁️ Visualizando como: ${target.name||"Aluno"}`);
  } else {
    // Visualizar como Pro genérico
    userData = { ...userData, plan:"pro", _adminPreview:true, _previewUid:null };
    showXpToast("👁️ Modo preview — acesso Pro total");
  }

  renderDashboard();
  showView("view-dashboard");
  showAdminPreviewBar();
}

function showAdminPreviewBar(){
  document.getElementById("admin-preview-bar")?.remove();
  const bar = document.createElement("div");
  bar.id = "admin-preview-bar";
  const isSpecific = userData._previewUid;
  const userName = isSpecific ? (adminUsers.find(u=>u.uid===userData._previewUid)?.name||"Aluno") : "Pro";
  bar.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:linear-gradient(90deg,#7c3aed,#5b21b6);
    padding:8px 16px;display:flex;align-items:center;justify-content:space-between;
    font-size:12px;font-weight:700;color:#fff;
    box-shadow:0 2px 12px rgba(124,58,237,0.5);
  `;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span>👁️ PREVIEW</span>
      <span style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:999px;font-size:11px;">
        ${isSpecific ? `como ${userName}` : "como usuário Pro"}
      </span>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="showPreviewUserPicker()" style="
        background:rgba(255,255,255,0.2);border:none;border-radius:999px;
        padding:4px 10px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;
      ">Trocar usuário</button>
      <button onclick="exitPreviewMode()" style="
        background:rgba(255,255,255,0.9);border:none;border-radius:999px;
        padding:4px 10px;color:#5b21b6;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;
      ">← Voltar ao painel</button>
    </div>
  `;
  document.body.prepend(bar);

  // Ajustar padding do app para não ficar atrás da barra
  document.querySelector(".view.active")?.style?.setProperty("padding-top","48px","");
}

function showAdminReturnBtn(){
  document.getElementById("admin-return-btn")?.remove();
  const btn = document.createElement("button");
  btn.id = "admin-return-btn";
  btn.textContent = "← Painel do Professor";
  btn.style.cssText = `
    position:fixed;bottom:84px;left:16px;z-index:500;
    background:linear-gradient(135deg,#5b21b6,#7c3aed);
    border:none;border-radius:999px;
    padding:10px 18px;color:#fff;font-size:13px;font-weight:800;
    cursor:pointer;font-family:inherit;
    box-shadow:0 4px 20px rgba(91,33,182,0.5);
    transition:all 0.2s ease;
  `;
  btn.addEventListener("click",()=>{
    btn.remove();
    loadAdminDashboard();
  });
  document.body.appendChild(btn);
}

function exitPreviewMode(){
  document.getElementById("admin-preview-bar")?.remove();
  if(_previewOriginalData){
    userData = _previewOriginalData;
    _previewOriginalData = null;
  }
  // Remover padding extra
  document.querySelectorAll(".view").forEach(v=>v.style.removeProperty("padding-top"));
  loadAdminDashboard();
}

function showPreviewUserPicker(){
  document.getElementById("preview-picker-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "preview-picker-modal";
  modal.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.88);display:flex;align-items:flex-end;justify-content:center;";

  const users = adminUsers.slice(0,20);
  const list = users.map(u => `
    <div onclick="document.getElementById('preview-picker-modal').remove();enterPreviewMode('${u.uid}')"
      style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background .15s;"
      onmouseover="this.style.background='rgba(124,58,237,0.15)'" onmouseout="this.style.background=''">
      ${renderUserAvatar(u, 38)}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${u.provider==="anonymous"?"👤 Visitante":u.name||"—"} ${u.username?`<span style="font-size:11px;color:rgba(255,255,255,0.4);">@${u.username}</span>`:""}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);">${u.xp||0} XP · Nv${calcLevel(u.xp||0)} · ${u.plan==="pro"?"🟡 Pro":"⬜ Free"}</div>
      </div>
    </div>
  `).join("");

  modal.innerHTML = `
    <div style="background:#1a0d2e;border:1px solid rgba(255,255,255,0.1);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;">
      <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#1a0d2e;">
        <div style="font-size:16px;font-weight:800;">Visualizar como...</div>
        <button onclick="document.getElementById('preview-picker-modal').remove()" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div onclick="document.getElementById('preview-picker-modal').remove();enterPreviewMode(null)"
        style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;background:rgba(201,147,58,0.08);">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#c9933a,#e4b45c);display:flex;align-items:center;justify-content:center;font-size:18px;">⭐</div>
        <div>
          <div style="font-weight:700;font-size:13px;">Usuário Pro genérico</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);">Ver acesso completo sem dados específicos</div>
        </div>
      </div>
      ${list}
    </div>
  `;
  document.body.appendChild(modal);
}

// ── ACCESS CONTROL ────────────────────────────────────────────────────────────
async function renderAccessControl(u){
  const list=document.getElementById("modal-access-list"); if(!list) return;
  list.innerHTML="";
  const manualAccess=u.manualAccess||{};
  VICTOR_DATA.segments.filter(s=>s.available&&s.phases).forEach(seg=>{
    const segHeader=document.createElement("div"); segHeader.className="access-seg-header";
    segHeader.textContent=`${seg.icon} ${seg.name}`;
    list.appendChild(segHeader);
    (seg.phases||[]).forEach(phase=>{
      const key=`${seg.id}_${phase.id}`, isFree=isSegmentFree(seg.id,phase.id);
      let state="default";
      if(manualAccess[key]===true) state="unlocked";
      if(manualAccess[key]===false) state="blocked";
      const row=document.createElement("div"); row.className="access-row";
      row.innerHTML=`<div class="access-row-info"><span class="access-phase-name">${phase.name}</span><span class="access-phase-sub">${phase.subtitle}</span>${isFree?'<span class="access-tag-free">Grátis</span>':''}</div><div class="access-toggles"><button class="access-toggle${state==="unlocked"?" active":""}" data-key="${key}" data-state="unlocked">🔓</button><button class="access-toggle${state==="default"?" active":""}" data-key="${key}" data-state="default">⚙️</button><button class="access-toggle${state==="blocked"?" active":""}" data-key="${key}" data-state="blocked">🔒</button></div>`;
      row.querySelectorAll(".access-toggle").forEach(btn=>{
        btn.addEventListener("click",async()=>{
          const newState=btn.dataset.state, k=btn.dataset.key;
          row.querySelectorAll(".access-toggle").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          const newAccess={...(u.manualAccess||{})};
          if(newState==="default") delete newAccess[k]; else newAccess[k]=newState==="unlocked";
          u.manualAccess=newAccess;
          const cached=adminUsers.find(x=>x.uid===u.uid); if(cached) cached.manualAccess=newAccess;
          try{await saveProgress(u.uid,{manualAccess:newAccess});showXpToast("✅ Salvo!");}catch(e){showXpToast("❌ Erro");}
        });
      });
      list.appendChild(row);
    });
  });
}

// ── FEEDBACK SYSTEM ───────────────────────────────────────────────────────────
let feedbackRating=0;

function initFeedback(){
  // Stars
  document.querySelectorAll(".feedback-star").forEach(star=>{
    star.addEventListener("click",()=>{
      feedbackRating=parseInt(star.dataset.v);
      document.querySelectorAll(".feedback-star").forEach((s,i)=>{
        s.classList.toggle("active",i<feedbackRating);
      });
      if(feedbackRating>=4) showXpToast("🙏 Obrigado pelo feedback!");
      saveFeedback({type:"rating",value:feedbackRating});
    });
  });
  document.getElementById("btn-feedback-like")?.addEventListener("click",()=>{
    saveFeedback({type:"like"}); showXpToast("👍 Obrigado!");
  });
  document.getElementById("btn-feedback-comment")?.addEventListener("click",()=>{
    openFeedbackModal("💬 Deixe seu comentário","comment");
  });
  document.getElementById("btn-feedback-bug")?.addEventListener("click",()=>{
    openFeedbackModal("🐛 Descreva o bug","bug");
  });
  document.getElementById("btn-close-feedback")?.addEventListener("click",()=>{
    document.getElementById("feedback-modal").style.display="none";
  });
  document.getElementById("btn-send-feedback")?.addEventListener("click",sendFeedback);
}

function openFeedbackModal(title,type){
  document.getElementById("feedback-modal-title").textContent=title;
  document.getElementById("feedback-textarea").value="";
  document.getElementById("feedback-textarea").placeholder=type==="bug"?"Descreva o problema em detalhes...":"Escreva seu comentário...";
  document.getElementById("btn-send-feedback").dataset.type=type;
  document.getElementById("feedback-modal").style.display="flex";
}

async function sendFeedback(){
  const text=document.getElementById("feedback-textarea").value.trim();
  const type=document.getElementById("btn-send-feedback").dataset.type;
  if(!text) return;
  await saveFeedback({type,text,rating:feedbackRating});
  document.getElementById("feedback-modal").style.display="none";
  showXpToast(type==="bug"?"🐛 Bug reportado! Obrigado.":"💬 Comentário enviado!");
}

async function saveFeedback(data){
  try{
    const {db}=await import("./firebase.js");
    const {collection,addDoc,serverTimestamp}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await addDoc(collection(db,"feedback"),{
      ...data,
      uid:currentUser?.uid||"anonymous",
      name:userData?.name||"Visitante",
      createdAt:serverTimestamp(),
    });
  }catch(e){console.log("Feedback save error:",e);}
}

// ── ADMIN CUSTOMIZATION ────────────────────────────────────────────────────────
let appConfig={};

async function loadAppConfig(){
  try{
    const {db}=await import("./firebase.js");
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const snap=await getDoc(doc(db,"appConfig","settings"));
    if(snap.exists()) appConfig=snap.data();
    applyAppConfig();
  }catch(e){ vicLog("config","loadAppConfig failed",e); }
}

async function saveAppConfig(updates){
  Object.assign(appConfig,updates);
  try{
    const {db}=await import("./firebase.js");
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await setDoc(doc(db,"appConfig","settings"),appConfig,{merge:true});
    showXpToast("✅ Configuração salva!");
  }catch(e){showXpToast("❌ Erro ao salvar");}
}

function applyAppConfig(){
  if(appConfig.primaryColor) document.documentElement.style.setProperty("--p",appConfig.primaryColor);
  if(appConfig.accentColor)  document.documentElement.style.setProperty("--p-bright",appConfig.accentColor);
  if(appConfig.bgColor)      document.documentElement.style.setProperty("--bg",appConfig.bgColor);
  if(appConfig.slogan)       document.querySelectorAll(".auth-tagline").forEach(e=>e.textContent=appConfig.slogan);
  if(appConfig.sloganPT)     document.querySelectorAll(".auth-tagline-pt").forEach(e=>e.textContent=appConfig.sloganPT);
  if(appConfig.appDesc)      document.querySelectorAll(".auth-app-desc").forEach(e=>e.textContent=appConfig.appDesc);
  if(appConfig.segmentOrder) reorderSegments(appConfig.segmentOrder);
}

function reorderSegments(order){
  if(!order||!order.length) return;
  const segs=VICTOR_DATA.segments;
  VICTOR_DATA.segments=[...order.map(id=>segs.find(s=>s.id===id)).filter(Boolean),...segs.filter(s=>!order.includes(s.id))];
}

function initCustomizePanel(){
  // Color pickers
  const cp=id=>document.getElementById(id);
  if(appConfig.primaryColor&&cp("cust-color-primary")) cp("cust-color-primary").value=appConfig.primaryColor;
  if(appConfig.accentColor&&cp("cust-color-accent")) cp("cust-color-accent").value=appConfig.accentColor;
  if(appConfig.slogan&&cp("cust-slogan")) cp("cust-slogan").value=appConfig.slogan;
  if(appConfig.sloganPT&&cp("cust-slogan-pt")) cp("cust-slogan-pt").value=appConfig.sloganPT;
  if(appConfig.appDesc&&cp("cust-app-desc")) cp("cust-app-desc").value=appConfig.appDesc;

  // Segment order drag list
  const segList=document.getElementById("cust-segments-list");
  if(segList){
    segList.innerHTML="";
    VICTOR_DATA.segments.filter(s=>s.available).forEach(seg=>{
      const item=document.createElement("div"); item.className="cust-drag-item"; item.dataset.id=seg.id;
      item.innerHTML=`<span class="cust-drag-handle">⠿</span><span>${seg.icon} ${seg.name}</span>`;
      segList.appendChild(item);
    });
    enableDragSort(segList);
  }

  // Pro/Free toggles
  const proList=document.getElementById("cust-pro-list");
  if(proList){
    proList.innerHTML="";
    const proSegs=appConfig.proSegments||[];
    VICTOR_DATA.segments.filter(s=>s.available).forEach(seg=>{
      const row=document.createElement("div"); row.className="cust-pro-row";
      const isPro=proSegs.includes(seg.id);
      row.innerHTML=`
        <span>${seg.icon} ${seg.name}</span>
        <label class="toggle-switch">
          <input type="checkbox" data-seg="${seg.id}" ${isPro?"checked":""}>
          <span class="toggle-slider"></span>
        </label>`;
      row.querySelector("input").addEventListener("change",async e=>{
        const s=e.target.dataset.seg, checked=e.target.checked;
        const arr=appConfig.proSegments||[];
        const updated=checked?[...arr,s]:arr.filter(x=>x!==s);
        await saveAppConfig({proSegments:updated});
      });
      proList.appendChild(row);
    });
  }

  // Wire buttons
  document.getElementById("btn-apply-colors")?.addEventListener("click",async()=>{
    await saveAppConfig({
      primaryColor:cp("cust-color-primary").value,
      accentColor:cp("cust-color-accent").value,
      bgColor:cp("cust-color-bg").value,
      bgLightColor:cp("cust-color-bg-light").value,
    });
    applyAppConfig();
  });
  document.getElementById("btn-reset-colors")?.addEventListener("click",async()=>{
    await saveAppConfig({primaryColor:"#7c3aed",accentColor:"#c9933a",bgColor:"#1a0d2e",bgLightColor:"#f0ead4"});
    applyAppConfig();
  });
  document.getElementById("btn-save-texts")?.addEventListener("click",async()=>{
    await saveAppConfig({
      slogan:cp("cust-slogan").value||"Turn English into your advantage",
      sloganPT:cp("cust-slogan-pt").value||"Faça do inglês sua vantagem",
      appDesc:cp("cust-app-desc").value||"Inglês Operacional Profissional",
    });
    applyAppConfig();
  });
  document.getElementById("btn-gen-exercise")?.addEventListener("click",generateAIExercise);
}

function enableDragSort(list){
  let dragging=null;
  list.querySelectorAll(".cust-drag-item").forEach(item=>{
    item.draggable=true;
    item.addEventListener("dragstart",()=>{dragging=item;item.style.opacity="0.5";});
    item.addEventListener("dragend",async()=>{
      item.style.opacity="1"; dragging=null;
      const order=[...list.querySelectorAll(".cust-drag-item")].map(i=>i.dataset.id);
      await saveAppConfig({segmentOrder:order});
      reorderSegments(order);
    });
    item.addEventListener("dragover",e=>{e.preventDefault();if(dragging&&dragging!==item){list.insertBefore(dragging,item);}});
  });
}

async function generateAIExercise(){
  const btn=document.getElementById("btn-gen-exercise");
  const result=document.getElementById("ai-ex-result");
  const segment=document.getElementById("ai-ex-segment").value||"Geral";
  const type=document.getElementById("ai-ex-type").value;
  const level=document.getElementById("ai-ex-level").value;
  const context=document.getElementById("ai-ex-context").value;

  btn.disabled=true; btn.textContent="🤖 Gerando...";
  result.style.display="none";

  const typeLabels={multiple_choice:"múltipla escolha (4 opções)",fill_blank:"complete a frase",translate_pt_en:"tradução PT→EN",word_order:"ordene a frase"};

  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:800,
        messages:[{role:"user",content:`Create an English learning exercise for Brazilian professionals.

SEGMENT: ${segment}
TYPE: ${typeLabels[type]}
LEVEL: ${level}
CONTEXT: ${context||"professional workplace situation in Brazil"}
AUDIENCE: Brazilian workers (port agents, hotel staff, drivers, health workers, etc.)
FOCUS: Real work situations, common mistakes Brazilians make in English

Return ONLY this JSON (no markdown):
{
  "en": "<English sentence or question>",
  "pt": "<Portuguese translation>",
  "type": "${type}",
  ${type==="multiple_choice"?'"options": ["<correct>","<wrong1>","<wrong2>","<wrong3>"], "correct": 0,':''}
  ${type==="fill_blank"?'"answer": "<word to fill>",':''}
  ${type==="translate_pt_en"?'"answer": "<english translation>",':''}
  ${type==="word_order"?'"scrambled": ["<word1>","<word2>","..."], "answer": "<full sentence>",':''}
  "tip": "<brief tip in Portuguese about why Brazilians often get this wrong>",
  "words": [{"w": "<key word>", "cls": "noun/verb/adj", "tr": "<Portuguese translation>"}]
}`}]
      })
    });
    const data=await resp.json();
    const raw=data.content?.[0]?.text||"{}";
    let ex; try{ex=JSON.parse(raw.replace(/```json|```/g,"").trim());}catch(e){ex=null;}

    if(ex){
      result.style.display="block";
      result.innerHTML=`
        <div class="ai-ex-preview">
          <div class="ai-ex-label">Exercício gerado:</div>
          <div class="ai-ex-en">${ex.en}</div>
          <div class="ai-ex-pt">${ex.pt}</div>
          ${ex.options?`<div class="ai-ex-options">${ex.options.map((o,i)=>`<span class="${i===0?"ai-ex-correct":""}">${o}</span>`).join("")}</div>`:""}
          ${ex.tip?`<div class="ai-ex-tip">💡 ${ex.tip}</div>`:""}
          <div class="ai-ex-json">${JSON.stringify(ex,null,2)}</div>
          <button class="btn-primary" onclick="navigator.clipboard.writeText(\`${JSON.stringify(ex)}\`).then(()=>showXpToast('📋 Copiado!'))">📋 Copiar JSON</button>
        </div>`;
    } else result.innerHTML=`<div style="color:#ef4444">Erro ao gerar. Tente novamente.</div>`;
  }catch(e){result.innerHTML=`<div style="color:#ef4444">Erro: ${e.message}</div>`;}
  btn.disabled=false; btn.textContent="🤖 Gerar com IA";
  result.style.display="block";
}

async function loadAdminFeedbacks(){
  const list=document.getElementById("admin-feedbacks-list"); if(!list) return;
  list.innerHTML="Carregando...";
  try{
    const {db}=await import("./firebase.js");
    const {collection,getDocs,orderBy,query,limit}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const q=query(collection(db,"feedback"),orderBy("createdAt","desc"),limit(50));
    const snap=await getDocs(q);
    if(snap.empty){list.innerHTML="<div style='padding:16px;color:#6b7a90'>Nenhum feedback ainda.</div>";return;}
    list.innerHTML=snap.docs.map(d=>{
      const f=d.data();
      const ico=f.type==="bug"?"🐛":f.type==="like"?"👍":f.type==="rating"?"⭐":"💬";
      const val=f.type==="rating"?"★".repeat(f.value||0):f.text||"";
      return `<div class="feedback-admin-item">
        <div class="fai-header"><span>${ico} ${f.name||"Visitante"}</span><span class="fai-type">${f.type}</span></div>
        ${val?`<div class="fai-text">${val}</div>`:""}
      </div>`;
    }).join("");
  }catch(e){list.innerHTML=`<div style="color:#ef4444">Erro: ${e.message}</div>`;}
}

// ── PRO / UPGRADE ─────────────────────────────────────────────────────────────
function showUpgradeScreen(){ showView("view-upgrade"); }

// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────
async function loadAdminDashboard(){ showView("view-admin"); await refreshAdminUsers(); }
async function refreshAdminUsers(){
  document.getElementById("admin-users-list").innerHTML=`<div style="text-align:center;padding:20px;color:#c4a96a">Carregando...</div>`;
  try{adminUsers=await getAllUsers();renderAdminMetrics();renderAdminUsers();}
  catch(e){document.getElementById("admin-users-list").innerHTML=`<div style="color:#ef4444;padding:16px">Erro ao carregar. Verifique regras do Firestore.</div>`;}
}
function renderAdminMetrics(){
  const today=new Date().toISOString().slice(0,10);
  const total=adminUsers.length;
  const activeToday=adminUsers.filter(u=>u.lastLoginDate===today).length;
  const avgXP=total?Math.round(adminUsers.reduce((a,u)=>a+(u.xp||0),0)/total):0;
  const pro=adminUsers.filter(u=>u.plan==="pro").length;
  document.getElementById("adm-total-users").textContent=total;
  document.getElementById("adm-active-today").textContent=activeToday;
  document.getElementById("adm-avg-xp").textContent=avgXP;
  document.getElementById("adm-pro-users").textContent=pro;
}
// Renderizar avatar do usuário (emoji ou foto ou inicial)
function renderUserAvatar(u, size=36){
  const av = u.avatar || null;
  const name = u.provider==="anonymous" ? "👤" : (u.name||"?");
  const photoSrc = (av && (av.startsWith("data:")||av.startsWith("http"))) ? av : (u.photoURL||null);
  if(photoSrc){
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#2a1a4e;"><img src="${photoSrc}" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>`;
  }
  if(av && !av.startsWith("data:") && !av.startsWith("http") && av.length <= 12){ // emoji (incl. ZWJ sequences)
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#2d1b4e,#1a0d2e);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.5)}px;line-height:1;flex-shrink:0;">${av}</div>`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.4)}px;font-weight:800;color:#fff;flex-shrink:0;">${name[0]?.toUpperCase()||"?"}</div>`;
}

function renderAdminUsers(){
  const list=document.getElementById("admin-users-list"); list.innerHTML="";
  const term=adminSearchTerm.toLowerCase();
  const filtered=term?adminUsers.filter(u=>(u.name||"").toLowerCase().includes(term)||(u.email||"").toLowerCase().includes(term)||(u.username||"").toLowerCase().includes(term)):adminUsers;
  if(!filtered.length){list.innerHTML=`<div style="padding:16px;text-align:center;color:#6b7a90">Nenhum aluno encontrado</div>`;return;}
  filtered.forEach(u=>{
    const lv=calcLevel(u.xp||0), plan=u.plan==="pro"?"🟡 Pro":"⬜ Free";
    const lastSeen = u.lastSeen?.toDate ? u.lastSeen.toDate() : (u.lastSeen ? new Date(u.lastSeen) : null);
    const lastSeenStr = lastSeen ? timeSince(lastSeen) : "—";
    const row=document.createElement("div"); row.className="admin-user-row";
    row.style.cssText="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;transition:background .15s;";
    row.innerHTML=`
      ${renderUserAvatar(u, 38)}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${u.provider==="anonymous"?"👤 Visitante":u.name||"—"}
          ${u.username?`<span style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:400;margin-left:4px;">@${u.username}</span>`:""}
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">
          ${u.xp||0} XP · Nv${lv} · ${u.streak||0}🔥 · ${lastSeenStr}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
        <span style="font-size:11px;font-weight:700;${u.plan==="pro"?"color:#ffd700":"color:rgba(255,255,255,0.3)"}">${plan}</span>
        <button class="adm-view-btn" data-uid="${u.uid}" style="padding:4px 10px;font-size:11px;">Ver</button>
      </div>`;
    row.querySelector(".adm-view-btn").addEventListener("click",()=>openUserModal(u.uid));
    list.appendChild(row);
  });
}

function timeSince(date){
  const seconds = Math.floor((new Date() - date) / 1000);
  if(seconds < 60) return "agora";
  if(seconds < 3600) return `${Math.floor(seconds/60)}min`;
  if(seconds < 86400) return `${Math.floor(seconds/3600)}h`;
  if(seconds < 604800) return `${Math.floor(seconds/86400)}d`;
  return `${Math.floor(seconds/604800)}sem`;
}
async function openUserModal(uid){
  const u=adminUsers.find(x=>x.uid===uid)||await getUserById(uid); if(!u) return;
  _currentModalUser=u;
  const uidEl=document.getElementById("modal-uid");
  if(uidEl) uidEl.textContent=`UID: ${u.uid.slice(0,12)}...`;
  const lv=calcLevel(u.xp||0), lvInfo_=levelInfo(u.xp||0), completed=(u.completedMissions||[]);
  // Avatar no modal — usa wrapper para não acumular elementos no DOM
  const avatarWrap = document.getElementById("modal-avatar-wrap");
  if(avatarWrap) avatarWrap.innerHTML = renderUserAvatar(u, 52);

  document.getElementById("modal-name").textContent = u.provider==="anonymous"?"Visitante":u.name||"—";
  document.getElementById("modal-email").textContent = u.username ? `@${u.username} · ${u.email||u.provider||"—"}` : (u.email||u.provider||"—");

  // Stats expandidos
  const gamesTotal = (u.gamesPlayed||0);
  const missionsTotal = completed.length;
  const lastSeen = u.lastSeen?.toDate ? u.lastSeen.toDate() : (u.lastSeen ? new Date(u.lastSeen) : null);
  document.getElementById("modal-stats").innerHTML=`
    <div class="modal-stat"><span>${u.xp||0}</span><small>XP</small></div>
    <div class="modal-stat"><span>Nv ${lv}</span><small>${lvInfo_.label}</small></div>
    <div class="modal-stat"><span>${u.streak||0}</span><small>Streak 🔥</small></div>
    <div class="modal-stat"><span>${missionsTotal}</span><small>Missões</small></div>
    <div class="modal-stat"><span>${gamesTotal}</span><small>Jogos</small></div>
    <div class="modal-stat"><span>${u.writingCompleted||0}</span><small>Redações</small></div>
  `;

  // Segmentos praticados
  const segsDone = [...new Set((completed).map(k=>k.split("_").slice(0,-2).join("_")||k.split("_")[0]))];
  const segsHtml = segsDone.map(s=>{
    const seg = getSegment(s); 
    return seg ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:11px;">${seg.icon||"📚"} ${seg.name}</span>` : "";
  }).filter(Boolean).join("");

  // Diagnóstico detalhado
  const diag = u.diagnosisAnswers||{};
  const diagMotivo = {profissional:"💼 Trabalho", pessoal:"🌍 Pessoal", ambos:"🚀 Ambos"}[diag.motivo] || diag.goal || "—";
  const diagSegments = Array.isArray(diag.segments) ? diag.segments.join(", ") : (diag.segment||"—");
  const diagDiff = {vocabulario:"📝 Vocabulário", pronuncia:"🗣️ Pronúncia", gramatica:"📖 Gramática", escuta:"👂 Escuta"}[diag.difficulty] || diag.difficulty || "—";

  // Atividade recente
  const createdAt = u.createdAt?.toDate ? u.createdAt.toDate() : null;
  const createdStr = createdAt ? createdAt.toLocaleDateString("pt-BR") : "—";
  const lastSeenStr = lastSeen ? lastSeen.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
  const referrals = u.referralCount||0;
  const badges = (u.completedMissions||[]).length > 0 ? "Sim" : "Não";

  document.getElementById("modal-progress").innerHTML=`
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div class="modal-info-row"><span class="modal-info-label">📅 Cadastro</span><strong>${createdStr}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">🕐 Última vez</span><strong>${lastSeenStr}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">📊 Nível</span><strong>${u.detectedLevel?.toUpperCase()||"não testado"}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">💳 Plano</span><strong>${u.plan==="pro"?"Pro ⭐":"Free"}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">🔑 Login</span><strong>${u.provider==="google"?"Google":u.provider==="anonymous"?"Anônimo":"Email"}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">🎯 Objetivo</span><strong>${diagMotivo}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">😣 Dificuldade</span><strong>${diagDiff}</strong></div>
      <div class="modal-info-row"><span class="modal-info-label">📚 Segmentos diag.</span><strong>${diagSegments}</strong></div>
      ${referrals>0?`<div class="modal-info-row"><span class="modal-info-label">🎁 Indicações</span><strong>${referrals}</strong></div>`:""}
      ${segsHtml?`<div style="margin-top:4px;"><div class="modal-info-label" style="margin-bottom:6px;">🗺️ Segmentos praticados</div><div style="display:flex;flex-wrap:wrap;gap:5px;">${segsHtml}</div></div>`:""}
      ${diag.personalNote?`<div style="margin-top:4px;padding:10px;background:rgba(255,255,255,0.04);border-radius:10px;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.5;">💬 "${diag.personalNote}"</div>`:""}
    </div>
  `;
  document.getElementById("btn-gen-pdf").onclick=()=>generatePDF(u);
  window.switchModalTab("info");
  document.getElementById("admin-modal").style.display="flex";
}

// ── PDF ───────────────────────────────────────────────────────────────────────
function generatePDF(u){
  const lv=calcLevel(u.xp||0), lvInfo_=levelInfo(u.xp||0), completed=u.completedMissions||[];
  const date=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const xp=u.xp||0;

  // Calculate skill percentages based on completed missions
  const speaking   =Math.min(100,Math.round((completed.filter(m=>m.includes("pron")||m.includes("fluencia")).length*15)+((xp/800)*25)));
  const writing    =Math.min(100,Math.round((u.writingXP||0)/2+(completed.filter(m=>m.includes("order")||m.includes("word_order")).length*5)));
  const listening  =Math.min(100,Math.round((completed.filter(m=>m.includes("dlg")||m.includes("dialog")||m.includes("situac")).length*12)+10));
  const reading    =Math.min(100,Math.round((completed.filter(m=>m.includes("vocab")||m.includes("mc")).length*6)+10));
  const translating=Math.min(100,Math.round((completed.filter(m=>m.includes("translat")||m.includes("traducao")).length*15)+5));

  const skillBar=(val,color)=>`<div style="background:#e8e0d0;border-radius:999px;height:10px;margin-top:4px"><div style="width:${val}%;background:${color};height:10px;border-radius:999px"></div></div>`;
  const skillColor=(v)=>v>=70?"#22c55e":v>=40?"#f59e0b":"#ef4444";

  // Segment progress
  const segProgress=VICTOR_DATA.segments.filter(s=>s.available).map(seg=>{
    const total=(seg.phases||[]).reduce((a,p)=>a+(p.missions||[]).length,0);
    const done=completed.filter(m=>m.startsWith(seg.id+"_")).length;
    const pct=total?Math.round((done/total)*100):0;
    return {name:`${seg.icon} ${seg.name}`,done,total,pct};
  }).filter(s=>s.done>0);

  // Weakest skill
  const skills=[{n:"Speaking",v:speaking},{n:"Writing",v:writing},{n:"Listening",v:listening},{n:"Reading",v:reading},{n:"Translating",v:translating}];
  const weakest=skills.reduce((a,b)=>a.v<b.v?a:b);
  const strongest=skills.reduce((a,b)=>a.v>b.v?a:b);

  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório VIC English — ${u.name||"Aluno"}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a2e;padding:40px;max-width:720px;margin:0 auto;font-size:14px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c9a849;padding-bottom:16px;margin-bottom:24px}
  .header-left h1{font-size:26px;font-weight:900;color:#1a0d2e;margin:0}
  .header-left p{font-size:12px;color:#6b7a90;margin:2px 0 0}
  .badge{background:#1a0d2e;color:#e4b45c;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700}
  h2{font-size:16px;font-weight:800;color:#1a0d2e;border-bottom:2px solid #e4d5b0;padding-bottom:6px;margin:28px 0 14px;text-transform:uppercase;letter-spacing:0.5px}
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .stat{background:#f7f3ed;border-radius:10px;padding:14px;text-align:center;border:1px solid #e4d5b0}
  .stat span{display:block;font-size:22px;font-weight:900;color:#c9a849}
  .stat small{font-size:10px;color:#6b7a90;text-transform:uppercase;letter-spacing:0.5px}
  .info-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0ebe0;font-size:13px}
  .info-row strong{color:#1a1a2e}
  .skill-row{margin-bottom:14px}
  .skill-header{display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:3px}
  .skill-pct{font-weight:800}
  .highlight-box{background:#f7f3ed;border:1px solid #e4d5b0;border-radius:10px;padding:16px;margin-bottom:14px}
  .highlight-box h3{font-size:13px;text-transform:uppercase;color:#6b7a90;letter-spacing:0.5px;margin:0 0 8px}
  .highlight-box p{font-size:14px;font-weight:600;color:#1a0d2e;margin:0}
  .seg-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0ebe0;font-size:13px}
  .seg-bar{width:120px;background:#e8e0d0;border-radius:999px;height:8px}
  .seg-fill{height:8px;border-radius:999px;background:#c9a849}
  .recommendation{background:#fff8e1;border:1px solid #f0c844;border-radius:10px;padding:14px;margin-top:14px}
  .recommendation h3{font-size:13px;color:#7a5c10;margin:0 0 6px}
  .recommendation p{font-size:13px;color:#444;margin:4px 0}
  .footer{margin-top:40px;text-align:center;font-size:11px;color:#6b7a90;border-top:1px solid #e4d5b0;padding-top:16px}
  @media print{body{padding:20px}button{display:none}}
</style></head><body>

<div class="header">
  <div class="header-left">
    <h1>VIC English</h1>
    <p>Relatório Detalhado de Desempenho</p>
  </div>
  <span class="badge">📅 ${date}</span>
</div>

<h2>Identificação do Aluno</h2>
<div class="info-row"><span>Nome</span><strong>${u.name||"Visitante"}</strong></div>
<div class="info-row"><span>Email</span><strong>${u.email||"—"}</strong></div>
<div class="info-row"><span>Plano</span><strong>${u.plan==="pro"?"Pro ⭐":"Free"}</strong></div>
<div class="info-row"><span>Login</span><strong>${u.provider==="google"?"Google":u.provider==="anonymous"?"Anônimo":"Email"}</strong></div>

<h2>Resumo de Desempenho</h2>
<div class="stats-grid">
  <div class="stat"><span>${xp}</span><small>XP Total</small></div>
  <div class="stat"><span>Nv ${lv}</span><small>Nível</small></div>
  <div class="stat"><span>${u.streak||0} 🔥</span><small>Streak</small></div>
  <div class="stat"><span>${completed.length}</span><small>Missões</small></div>
</div>
<div class="info-row"><span>Nível detectado (teste)</span><strong>${(u.detectedLevel||"—").toUpperCase()}</strong></div>
<div class="info-row"><span>Classificação geral</span><strong>${lvInfo_.label}</strong></div>
<div class="info-row"><span>Objetivo declarado</span><strong>${u.diagnosisAnswers?.goal||"Não informado"}</strong></div>
<div class="info-row"><span>Segmento principal</span><strong>${u.currentMission?.segmentId||"—"}</strong></div>

<h2>Análise de Habilidades</h2>

<div class="skill-row">
  <div class="skill-header"><span>🗣️ Speaking (Conversação)</span><span class="skill-pct" style="color:${skillColor(speaking)}">${speaking}%</span></div>
  ${skillBar(speaking,skillColor(speaking))}
  <div style="font-size:11px;color:#6b7a90;margin-top:3px">Baseado em exercícios de pronúncia e diálogo</div>
</div>

<div class="skill-row">
  <div class="skill-header"><span>✍️ Writing (Escrita)</span><span class="skill-pct" style="color:${skillColor(writing)}">${writing}%</span></div>
  ${skillBar(writing,skillColor(writing))}
  <div style="font-size:11px;color:#6b7a90;margin-top:3px">Baseado em exercícios de escrita e ordenação de frases</div>
</div>

<div class="skill-row">
  <div class="skill-header"><span>👂 Listening (Compreensão)</span><span class="skill-pct" style="color:${skillColor(listening)}">${listening}%</span></div>
  ${skillBar(listening,skillColor(listening))}
  <div style="font-size:11px;color:#6b7a90;margin-top:3px">Baseado em exercícios de diálogo e situações reais</div>
</div>

<div class="skill-row">
  <div class="skill-header"><span>📖 Reading (Leitura)</span><span class="skill-pct" style="color:${skillColor(reading)}">${reading}%</span></div>
  ${skillBar(reading,skillColor(reading))}
  <div style="font-size:11px;color:#6b7a90;margin-top:3px">Baseado em exercícios de vocabulário e múltipla escolha</div>
</div>

<div class="skill-row">
  <div class="skill-header"><span>🔄 Translating (Tradução)</span><span class="skill-pct" style="color:${skillColor(translating)}">${translating}%</span></div>
  ${skillBar(translating,skillColor(translating))}
  <div style="font-size:11px;color:#6b7a90;margin-top:3px">Baseado em exercícios de tradução PT→EN</div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
  <div class="highlight-box">
    <h3>💪 Ponto Forte</h3>
    <p>${strongest.n} — ${strongest.v}%</p>
  </div>
  <div class="highlight-box">
    <h3>⚠️ Precisa Melhorar</h3>
    <p>${weakest.n} — ${weakest.v}%</p>
  </div>
</div>

${segProgress.length?`
<h2>Progresso por Segmento</h2>
${segProgress.map(s=>`
<div class="seg-row">
  <span>${s.name}</span>
  <span style="font-size:12px;color:#6b7a90">${s.done}/${s.total} missões</span>
  <div class="seg-bar"><div class="seg-fill" style="width:${s.pct}%"></div></div>
  <span style="font-size:12px;font-weight:700;color:#c9a849">${s.pct}%</span>
</div>`).join("")}`:""}

<div class="recommendation">
  <h3>📋 Recomendações do Professor</h3>
  <p>• Foco principal: <strong>${weakest.n}</strong> — praticar mais ${weakest.n==="Speaking"?"pronúncia e diálogos":weakest.n==="Writing"?"exercícios de escrita e ordenação":weakest.n==="Listening"?"situações reais e diálogos":"exercícios de tradução e vocabulário"}</p>
  <p>• Nível atual: <strong>${lvInfo_.label}</strong> — ${lvInfo_.msg}</p>
  <p>• Streak atual: <strong>${u.streak||0} dia(s)</strong> — ${(u.streak||0)>=7?"Excelente consistência!":"Praticar diariamente para manter o progresso"}</p>
</div>

<div class="footer">
  <strong>VIC English</strong> — Inglês Operacional Profissional<br>
  viclanguage.com.br | Gerado em ${date}
</div>

<br><button onclick="window.print()" style="padding:12px 24px;background:#1a0d2e;color:#e4b45c;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-top:10px">🖨️ Imprimir / Salvar PDF</button>
</body></html>`;

  const win=window.open("","_blank");
  win.document.write(html);
  win.document.close();
}

// ── PROFILE & SETTINGS ────────────────────────────────────────────────────────
const APP_LINK="https://app.viclanguage.com.br";
let soundsEnabled=true, darkMode=true, fontSize="medium";

function openProfile(){
  try{
    const xp=userData?.xp||0, lv=levelInfo(xp);
    const completed=userData?.completedMissions||[];
    const name=userData?.name||"Aluno";

    // avatar
    const av=document.getElementById("profile-avatar");
    if(av){ loadAvatar(); if(!_cfg.avatar) av.textContent=name[0]?.toUpperCase()||"👤"; }
    const hn=document.getElementById("profile-hero-name"); if(hn) hn.textContent=name;
    const hun=document.getElementById("profile-hero-username");
    if(hun) hun.textContent=userData?.username ? `@${userData.username}` : "";
    const hl=document.getElementById("profile-hero-level"); if(hl) hl.textContent=lv.label;
    const pxp=document.getElementById("ps-xp"); if(pxp) pxp.textContent=xp;
    const daysPracticed=Object.keys(userData?.xpHistory||{}).filter(d=>(userData.xpHistory[d]||0)>0).length;
    const pdays=document.getElementById("ps-days"); if(pdays) pdays.textContent=daysPracticed;
    const pmis=document.getElementById("ps-missions"); if(pmis) pmis.textContent=completed.length;
    const pyday=document.getElementById("ps-xp-yesterday"); if(pyday) pyday.textContent=userData?.xpYesterday||0;

    renderSkillsAnalysis();
    renderCommitment();
    renderBadges();
    renderNextBadge();
    renderActivityCalendar();
    renderXPChart("week");

    const note=userData?.diagnosisAnswers?.personalNote;
    const goalSection=document.getElementById("profile-goal-section");
    const goalText=document.getElementById("profile-goal-text");
    if(goalSection) goalSection.style.display=(note&&note.length>2)?"block":"none";
    if(goalText&&note) goalText.textContent=`"${note}"`;

    const ts=document.getElementById("toggle-sounds"); if(ts) ts.checked=soundsEnabled;
    const td=document.getElementById("toggle-darkmode"); if(td) td.checked=darkMode;
    document.querySelectorAll(".font-size-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.size===fontSize));

    showView("view-profile");
  }catch(e){
    console.error("Profile error:",e);
    showXpToast("❌ Erro ao abrir perfil");
  }
}

const SKILL_DETAILS_DATA = {
  "🗣️ Speaking": {
    desc:"Speaking é a habilidade de se comunicar verbalmente em inglês. É a mais valorizada em entrevistas, atendimento ao cliente e situações de trabalho reais.",
    tips:"• Pratique os exercícios de Pronúncia em cada segmento\n• Ouça frases e repita em voz alta\n• Use o botão 🎤 para gravar sua voz\n• Quanto mais você falar, mais fluente fica",
  },
  "✍️ Writing": {
    desc:"Writing é a habilidade de escrever em inglês com clareza e correção. Essencial para emails profissionais, relatórios e comunicação internacional.",
    tips:"• Use a seção Writing & Translation\n• Peça correção da IA para seus textos\n• Escreva pelo menos 3 frases por dia\n• Leia as correções e entenda os erros",
  },
  "👂 Listening": {
    desc:"Listening é a habilidade de entender inglês falado. Crucial para reuniões, atendimento telefônico e conversas com clientes e colegas estrangeiros.",
    tips:"• Pratique todos os Diálogos de cada segmento\n• Ouça as frases com o botão 🔊 antes de responder\n• Tente entender sem olhar a tradução\n• Assista filmes ou séries em inglês com legenda",
  },
  "📖 Reading": {
    desc:"Reading é a habilidade de ler e compreender textos em inglês. Fundamental para documentos, contratos, emails e instruções técnicas no trabalho.",
    tips:"• Complete todos os exercícios de Vocabulário\n• Leia as frases em inglês antes de ver a tradução\n• Pratique os exercícios de Múltipla Escolha\n• Leia notícias ou artigos curtos em inglês",
  },
  "🔄 Translating": {
    desc:"Translating é a habilidade de traduzir entre português e inglês com precisão e naturalidade. Essencial para agentes portuários, COMEX e atendimento internacional.",
    tips:"• Faça todos os exercícios de Tradução PT→EN\n• Use a seção Writing para traduzir textos reais\n• Compare sua tradução com a versão corrigida\n• Pratique tradução de situações do seu trabalho",
  },
};

function renderSkillsAnalysis(){
  const container=document.getElementById("profile-skills"); if(!container) return;
  const completed=userData.completedMissions||[];
  const xp=userData.xp||0;

  // Calculate skill scores based on completed missions and XP
  const speaking = Math.min(100, Math.round((completed.filter(m=>m.includes("pron")||m.includes("radio")||m.includes("fluencia")).length*15)+((xp/500)*30)));
  const writing  = Math.min(100, Math.round((userData.writingXP||0)/2));
  const listening= Math.min(100, Math.round((completed.filter(m=>m.includes("dlg")||m.includes("dialog")||m.includes("situac")).length*12)+15));
  const reading  = Math.min(100, Math.round((completed.filter(m=>m.includes("vocab")||m.includes("mc")||m.includes("mem")).length*8)+10));
  const translating=Math.min(100,Math.round((completed.filter(m=>m.includes("traducao")||m.includes("translate")).length*15)+10));

  const skills=[
    {name:"🗣️ Speaking",    value:speaking,  tip:t("skill_tip_speaking")},
    {name:"✍️ Writing",     value:writing,   tip:t("skill_tip_writing")},
    {name:"👂 Listening",   value:listening, tip:t("skill_tip_listening")},
    {name:"📖 Reading",     value:reading,   tip:t("skill_tip_reading")},
    {name:"🔄 Translating", value:translating,tip:t("skill_tip_translating")},
  ];



  container.innerHTML=skills.map(s=>{
    const color=s.value>=70?"#22c55e":s.value>=40?"#f59e0b":"#ef4444";
    return `
      <button class="settings-big-btn skill-big-btn" onclick="showSkillDetail('${s.name}', ${s.value})" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <span class="skill-name">${s.name}</span>
          <span class="skill-pct" style="color:${color};font-family:var(--mono);font-size:13px;font-weight:900">${s.value}%</span>
        </div>
        <div class="skill-bar-bg" style="margin-top:8px;width:100%">
          <div class="skill-bar" style="width:${s.value}%;background:${color}"></div>
        </div>
        ${s.value<50?`<div class="skill-tip" style="margin-top:6px;font-size:11px;opacity:0.6;font-style:italic">💡 ${s.tip}</div>`:""}
      </button>
    `;
  }).join("");
}

function renderActivityCalendar(){
  const cal=document.getElementById("activity-calendar"); if(!cal) return;
  cal.innerHTML="";
  const history=userData.xpHistory||{};
  const today=new Date();
  const year=today.getFullYear(), month=today.getMonth();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay(); // 0=Sun

  // Day headers
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>{
    const h=document.createElement("div"); h.className="cal-day-header"; h.textContent=d;
    cal.appendChild(h);
  });

  // Empty cells before first day
  for(let i=0;i<firstDay;i++){
    const empty=document.createElement("div"); empty.className="cal-day cal-day-future";
    cal.appendChild(empty);
  }

  // Days of month
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const xp=history[dateStr]||0;
    const isFuture=d>today.getDate();
    const isToday=d===today.getDate();
    const level=xp===0?0:xp<20?1:xp<50?2:3;

    const box=document.createElement("div");
    box.className=`cal-day cal-xp-${level}${isFuture?" cal-day-future":""}${isToday?" cal-day-today":""}`;
    box.title=`${dateStr}: ${xp} XP`;

    box.innerHTML=`
      <span class="cal-day-num">${d}</span>
      <span class="cal-day-xp">${xp>0?xp:""}</span>
    `;

    if(!isFuture){
      box.addEventListener("click",()=>{
        showXpToast(`📅 ${dateStr}: ${xp} XP`);
      });
    }
    cal.appendChild(box);
  }

  // Wire chart tabs
  document.querySelectorAll(".chart-tab").forEach(tab=>{
    tab.onclick=()=>{
      document.querySelectorAll(".chart-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      renderXPChart(tab.dataset.period);
    };
  });
}

function showDayModal(date,xp){
  showXpToast(`📅 ${date}: ${xp} XP`);
}

function renderXPChart(period){
  const chart=document.getElementById("xp-chart"); if(!chart) return;
  const history=userData.xpHistory||{};
  const today=new Date();
  let days=[], label="";

  if(period==="week"){
    for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
    label="Esta semana";
  } else if(period==="week1"){
    for(let i=13;i>=7;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
    label="Semana passada";
  } else if(period==="week2"){
    for(let i=20;i>=14;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
    label="2 semanas atrás";
  }

  const values=days.map(d=>history[d]||0);
  const maxVal=Math.max(...values,1);
  const weekdays=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  chart.innerHTML=`
    <div class="xp-bars">
      ${values.map((v,i)=>{
        const pct=Math.round((v/maxVal)*100);
        const h=Math.max(4, Math.round((pct/100)*64));
        const d=new Date(days[i]);
        const lbl=weekdays[d.getDay()];
        return `<div class="xp-bar-wrap">
          <div class="xp-bar-val">${v||""}</div>
          <div class="xp-bar" style="height:${h}px;max-height:64px" title="${days[i]}: ${v} XP"></div>
          <div class="xp-bar-label">${lbl}</div>
        </div>`;
      }).join("")}
    </div>
  `;
}

// Track daily XP — call after each exercise
async function trackDailyXP(amount){
  if(!currentUser) return;
  const today=new Date().toISOString().slice(0,10);
  const history=userData.xpHistory||{};
  history[today]=(history[today]||0)+amount;
  userData.xpHistory=history;
  saveProgressSafe(currentUser.uid,{xpHistory:history});
}

window.showSkillDetail=function(name, pct){
  document.getElementById("skill-detail-modal")?.remove();
  const color=pct>=70?"#22c55e":pct>=40?"#f59e0b":"#ef4444";
  const icons={"🗣️ Speaking":"🗣️","✍️ Writing":"✍️","👂 Listening":"👂","📖 Reading":"📖","🔄 Translating":"🔄"};
  const descs={
    "🗣️ Speaking":"Speaking é a habilidade de se comunicar verbalmente. A mais valorizada em entrevistas, atendimento ao cliente e situações reais de trabalho.",
    "✍️ Writing":"Writing é escrever em inglês com clareza. Essencial para emails profissionais, relatórios e comunicação internacional.",
    "👂 Listening":"Listening é entender inglês falado. Crucial para reuniões, atendimento telefônico e conversas com clientes estrangeiros.",
    "📖 Reading":"Reading é ler e compreender textos em inglês. Fundamental para documentos, contratos e emails técnicos de trabalho.",
    "🔄 Translating":"Translating é traduzir entre PT e EN com precisão. Essencial para agentes portuários, COMEX e atendimento internacional."
  };
  const tipss={
    "🗣️ Speaking":"• Pratique os exercícios de Pronúncia\n• Use o botão 🎤 para gravar sua voz\n• Repita as frases em voz alta\n• Ouça e imite a pronúncia americana",
    "✍️ Writing":"• Use a seção Writing & Translation\n• Peça correção da IA\n• Escreva 3 frases por dia em inglês\n• Leia as correções e entenda os erros",
    "👂 Listening":"• Pratique todos os Diálogos\n• Ouça o 🔊 antes de responder\n• Tente entender sem ver a tradução\n• Assista filmes com legenda em inglês",
    "📖 Reading":"• Complete os exercícios de Vocabulário\n• Leia as frases antes de ver a tradução\n• Pratique Múltipla Escolha\n• Leia notícias curtas em inglês",
    "🔄 Translating":"• Faça os exercícios de Tradução PT→EN\n• Use Writing para traduzir textos reais\n• Compare com a versão corrigida\n• Pratique frases do seu trabalho"
  };
  const modal=document.createElement("div");
  modal.id="skill-detail-modal";
  modal.className="skill-detail-modal";
  modal.innerHTML=`
    <div class="skill-detail-card">
      <div class="sdk-icon">${icons[name]||"📊"}</div>
      <div class="sdk-title">${name}</div>
      <div class="sdk-pct" style="color:${color}">${pct}%</div>
      <div class="sdk-desc">${descs[name]||""}</div>
      <div class="sdk-tips" style="white-space:pre-line">${tipss[name]||""}</div>
      <button class="sdk-close" onclick="document.getElementById('skill-detail-modal').remove()">Fechar</button>
    </div>`;
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
};

function renderBadges(){
  const container=document.getElementById("profile-badges-grid"); if(!container) return;
  const earned=userData?.badges||[];
  const stats=getBadgeStats();
  const cats={segmento:"🎯 Segmentos",momento:"⚡ Momento",performance:"🔥 Performance",resiliencia:"⚔️ Resiliência",dominio:"🧠 Domínio",raro:"👑 Raros"};
  let html="";
  Object.entries(cats).forEach(([cat,catLabel])=>{
    const catBadges=BADGES.filter(b=>b.cat===cat);
    html+=`<div class="badge-cat-section"><div class="badge-cat-title">${catLabel}</div><div class="badges-row">`;
    catBadges.forEach(b=>{
      const isEarned=earned.includes(b.id);
      let progress="";
      if(!isEarned){
        const s=stats;
        if(b.id==="streak5"||b.id==="streak15"){const need=b.id==="streak5"?5:15;progress=`${Math.min(s.answerStreak,need)}/${need}`;}
        else if(b.id==="xp250"||b.id==="xp1000"){const need=b.id==="xp250"?250:1000;progress=`${Math.min(s.xp,need)}/${need} XP`;}
        else if(b.id==="daily7"){progress=`${Math.min(s.loginStreak,7)}/7 dias`;}
        else if(b.id==="missions10"){progress=`${Math.min(s.missionsCompleted,10)}/10`;}
        else if(b.id.startsWith("seg_")){
          const {segId,need}=_parseSegBadgeId(b.id);
          const done=s.segMissions?.[segId]||0;
          progress=`${Math.min(done,need)}/${need} missões`;
        }
      }
      html+=`<div class="badge-item ${isEarned?"earned":"locked"}" onclick="showBadgeDetail('${b.id}')" style="cursor:pointer" title="${b.desc}">
        <div class="badge-item-icon-wrap">
          <span class="badge-item-icon ${isEarned?"":"badge-locked-icon"}">${b.icon}</span>
          ${!isEarned?'<span class="badge-lock-overlay">🔒</span>':""}
        </div>
        <div class="badge-item-name">${b.name}</div>
        ${progress&&!isEarned?`<div class="badge-item-progress">${progress}</div>`:""}
      </div>`;
    });
    html+=`</div></div>`;
  });
  container.innerHTML=html;
}

window.showBadgeDetail=function(badgeId){
  const b=BADGES.find(x=>x.id===badgeId); if(!b) return;
  const earned=(userData?.badges||[]).includes(b.id);
  const stats=getBadgeStats();

  // Build progress text
  let progressText="";
  if(!earned){
    if(b.id==="streak3"||b.id==="streak5"||b.id==="streak10"){
      const need=b.id==="streak3"?3:b.id==="streak5"?5:10;
      progressText=`Progresso: ${Math.min(stats.answerStreak,need)}/${need} acertos seguidos`;
    } else if(b.id==="xp100"||b.id==="xp250"||b.id==="xp500"||b.id==="xp1000"){
      const need=parseInt(b.id.replace("xp",""));
      progressText=`Progresso: ${Math.min(stats.xp,need)}/${need} XP`;
    } else if(b.id==="daily3"||b.id==="daily7"){
      const need=b.id==="daily3"?3:7;
      progressText=`Progresso: ${Math.min(stats.loginStreak,need)}/${need} dias seguidos`;
    } else if(b.id==="missions3"||b.id==="missions5"||b.id==="missions10"){
      const need=b.id==="missions3"?3:b.id==="missions5"?5:10;
      progressText=`Progresso: ${Math.min(stats.missionsCompleted,need)}/${need} missões`;
    } else if(b.id.startsWith("seg_")){
      const {segId,need}=_parseSegBadgeId(b.id);
      const done=stats.segMissions?.[segId]||0;
      progressText=`Progresso: ${Math.min(done,need)}/${need} missões em ${segId}`;
    }
  }

  document.getElementById("badge-detail-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="badge-detail-modal";
  modal.className="about-modal";
  modal.innerHTML=`
    <div class="about-card" style="text-align:center;padding:32px 24px">
      <button class="about-close" onclick="document.getElementById('badge-detail-modal').remove()">✕</button>
      <div style="font-size:64px;margin-bottom:12px;filter:${earned?"none":"grayscale(1) opacity(0.4)"}">${b.icon}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#c9933a !important;font-weight:800;margin-bottom:6px">${{momento:"⚡ Momento",performance:"🔥 Performance",resiliencia:"⚔️ Resiliência",dominio:"🧠 Domínio",raro:"👑 Raro"}[b.cat]||""}</div>
      <div style="font-size:20px;font-weight:900;color:#fff !important;margin-bottom:8px">${b.name}</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.65) !important;line-height:1.6;margin-bottom:12px">${b.desc}</div>
      ${earned
        ? `<div style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:10px;color:#4ade80 !important;font-weight:800">✅ Conquistado! +${b.xp} XP</div>`
        : `<div style="background:rgba(255,255,255,0.06);border:1px solid var(--rim2);border-radius:10px;padding:10px">
            <div style="color:rgba(255,255,255,0.5) !important;font-size:12px;margin-bottom:4px">🔒 Como conquistar:</div>
            <div style="color:#e4b45c !important;font-weight:700;font-size:13px">${b.desc}</div>
            ${progressText?`<div style="color:var(--p-light) !important;font-size:12px;margin-top:6px;font-family:var(--mono)">${progressText}</div>`:""}
            <div style="color:#c9933a !important;font-weight:800;margin-top:8px">+${b.xp} XP ao conquistar</div>
          </div>`
      }
    </div>`;
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
  vibrate(20);
};

function renderNextBadge(){
  const strip=document.getElementById("next-badge-strip"); if(!strip) return;
  const earned=userData?.badges||[];
  const stats=getBadgeStats();
  // Find first unearned badge
  const next=BADGES.find(b=>!earned.includes(b.id));
  if(!next){ strip.style.display="none"; return; }
  strip.style.display="flex";
  document.getElementById("nbs-icon").textContent=next.icon;
  document.getElementById("nbs-name").textContent=next.name;
  // Show progress hint
  let prog="";
  if(next.id==="streak5"||next.id==="streak15"){const need=next.id==="streak5"?5:15;prog=`${Math.min(stats.answerStreak,need)}/${need}`;}
  else if(next.id==="xp250"||next.id==="xp1000"){const need=next.id==="xp250"?250:1000;prog=`${Math.min(stats.xp,need)}/${need} XP`;}
  else if(next.id==="daily7"){prog=`${Math.min(stats.loginStreak,7)}/7 dias`;}
  else if(next.id==="missions10"){prog=`${Math.min(stats.missionsCompleted,10)}/10`;}
  document.getElementById("nbs-progress").textContent=prog;
}

window.showServiceDetail=function(service){
  const details={
    app:{icon:"📱",title:"VIC English App",desc:"Treinamento digital de inglês profissional para times e profissionais individuais. Conteúdo focado na sua área de atuação — porto, hotelaria, saúde, transporte e muito mais.",cta:"Entre em contato para valores individuais e para empresas →",link:"https://wa.me/5511943644477?text=Olá! Quero saber mais sobre o VIC English App para minha empresa."},
    incompany:{icon:"🏢",title:"Treinamento In-Company",desc:"Inglês corporativo desenvolvido sob medida para o setor da sua empresa. Trabalhamos com equipes portuárias, hoteleiras, de saúde, offshore e muito mais. Metodologia prática e imediata.",cta:"Agende um orçamento de treinamento →",link:"https://wa.me/5511943644477?text=Olá! Gostaria de um orçamento para treinamento in-company."},
    aulas:{icon:"📚",title:"Aulas Personalizadas",desc:"Aulas individuais ou em grupo, online ou presencial em Santos/SP. Sem livros obrigatórios. Foco em aplicação real e imediata, com metodologia adaptada ao seu nível e objetivo.",cta:"Agende já a sua aula →",link:"https://wa.me/5511943644477?text=Olá! Quero agendar uma aula de inglês."},
    traducao:{icon:"📄",title:"Tradução Profissional",desc:"Tradução de documentos, contratos, materiais corporativos, laudos técnicos e muito mais. Precisão, confidencialidade e entrega no prazo.",cta:"Envie seu documento para tradução →",link:"https://wa.me/5511943644477?text=Olá! Preciso de uma tradução profissional."},
    interpretacao:{icon:"🎙️",title:"Interpretação ao Vivo",desc:"Interpretação simultânea e consecutiva para reuniões, eventos, audiências e conferências. Experiência em ambientes multiculturais nacionais e internacionais.",cta:"Marque sua sessão de interpretação →",link:"https://wa.me/5511943644477?text=Olá! Preciso de interpretação para um evento."},
  };
  const d=details[service]; if(!d) return;
  document.getElementById("service-detail-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="service-detail-modal";
  modal.className="about-modal";
  modal.innerHTML=`
    <div class="about-card">
      <button class="about-close" onclick="document.getElementById('service-detail-modal').remove()">✕</button>
      <div style="font-size:40px;text-align:center;margin-bottom:8px">${d.icon}</div>
      <div class="about-title">${d.title}</div>
      <div class="about-body"><p>${d.desc}</p></div>
      <a href="${d.link}" target="_blank" class="settings-big-btn" style="text-decoration:none;text-align:center;background:linear-gradient(135deg,#c9933a,#e4b45c);color:#1a0d2e !important;font-weight:900;display:block;margin-top:8px">
        ${d.cta}
      </a>
    </div>`;
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
};

window.showCommitmentTips=function(){
  document.getElementById("commitment-tips-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="commitment-tips-modal";
  modal.className="about-modal";
  modal.innerHTML=`
    <div class="about-card">
      <button class="about-close" onclick="document.getElementById('commitment-tips-modal').remove()">✕</button>
      <div class="about-title">🎯 Como se comprometer mais?</div>
      <div class="about-body">
        <div class="about-services">
          <div class="about-service">📅 <strong>Pratique todo dia</strong> — 15 minutos diários valem mais do que 2h por semana. Consistência é tudo!</div>
          <div class="about-service">⏰ <strong>Crie um horário fixo</strong> — escolha um momento do dia só para o inglês. Antes do trabalho ou no intervalo.</div>
          <div class="about-service">🎯 <strong>Complete as Daily Missions</strong> — elas foram criadas para manter você no ritmo sem sobrecarregar.</div>
          <div class="about-service">🔥 <strong>Mantenha seu streak</strong> — cada dia conta. Não quebre a sequência — é motivação comprovada!</div>
          <div class="about-service">🗣️ <strong>Use o microfone</strong> — pronunciar em voz alta acelera a fixação 3x mais que só ler.</div>
          <div class="about-service">💬 <strong>Pratique os diálogos</strong> — simule situações reais do seu trabalho. Quanto mais próximo da realidade, melhor.</div>
          <div class="about-service">📊 <strong>Veja seu progresso</strong> — olhe seu calendário de atividades. Cada quadradinho colorido é um dia vencido!</div>
        </div>
      </div>
    </div>`;
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
};

function renderCommitment(){
  const container=document.getElementById("commitment-card"); if(!container) return;
  const streak=userData.streak||0;
  const dp=getDailyProgress();
  const todayDone=(dp.dailyExercises||0);
  const completed=(userData.completedMissions||[]).length;

  let level,color,msg;
  if(streak>=7&&todayDone>=3){level=t("commitment_high");color="#22c55e";msg=t("commitment_msg_high");}
  else if(streak>=3||todayDone>=2){level=t("commitment_mid");color="#f59e0b";msg=t("commitment_msg_mid");}
  else{level=t("commitment_low");color="#ef4444";msg=t("commitment_msg_low");}

  const xp=userData.xp||0;
  const daysPracticed=(userData.practicedDays||[]).length||0;
  container.innerHTML=`
    <div class="commitment-level" style="color:${color}">${level}</div>
    <div class="commitment-msg">${msg}</div>
    <div class="commitment-stats">
      <div class="commitment-stat"><span>${xp.toLocaleString()}</span><small>${t("stat_xp")}</small></div>
      <div class="commitment-stat"><span>${daysPracticed}</span><small>${t("stat_days")}</small></div>
      <div class="commitment-stat"><span>${completed}</span><small>${t("stat_missions")}</small></div>
    </div>
  `;
}

// Settings actions
function applyFontSize(size){
  fontSize=size;
  document.body.classList.remove("font-xs","font-small","font-medium","font-large","font-xl");
  document.body.classList.add(`font-${size}`);
  document.querySelectorAll(".font-size-btn").forEach(b=>b.classList.toggle("active",b.dataset.size===size));
  _setCfg("fontSize",size);
}

function applyDarkMode(dark){
  darkMode=dark;
  document.body.classList.toggle("light-mode",!dark);
  _setCfg("darkMode",dark?"1":"0");
}

function applySounds(enabled){
  soundsEnabled=enabled;
  _setCfg("sounds",enabled?"1":"0");
}

function shareAppPanel(){
  const panel=document.getElementById("share-panel");
  if(!panel) return;
  const visible=panel.style.display!=="none";
  panel.style.display=visible?"none":"flex";
  if(!visible){
    const msg=encodeURIComponent(`🎯 Aprenda inglês operacional com o VIC English!\n${APP_LINK}`);
    const url=encodeURIComponent(APP_LINK);
    document.getElementById("share-whatsapp").href=`https://wa.me/?text=${msg}`;
    document.getElementById("share-facebook").href=`https://www.facebook.com/sharer/sharer.php?u=${url}`;
    document.getElementById("share-instagram").href=`https://www.instagram.com/`;
    document.getElementById("share-copy").onclick=()=>{
      navigator.clipboard.writeText(APP_LINK).then(()=>showXpToast("🔗 Link copiado!"));
    };
  }
}

// Edit modal
let editField="";
function openEditModal(field,title,current,inputType="text"){
  editField=field;
  document.getElementById("profile-edit-title").textContent=title;
  const inp=document.getElementById("profile-edit-input");
  inp.type=inputType; inp.value=current||""; inp.placeholder=title;
  document.getElementById("profile-edit-msg").textContent="";
  document.getElementById("profile-edit-modal").style.display="flex";
  setTimeout(()=>inp.focus(),100);
}
async function saveEdit(){
  const val=document.getElementById("profile-edit-input").value.trim();
  const msg=document.getElementById("profile-edit-msg");
  if(!val){msg.textContent="❌ Campo vazio.";return;}
  msg.textContent="Salvando...";
  try{
    if(editField==="name"){
      await import("./firebase.js").then(async m=>{
        const {updateProfile}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
        await updateProfile(m.auth.currentUser,{displayName:val});
      });
      userData.name=val;
      await saveProgress(currentUser.uid,{name:val});
      const phn=document.getElementById("profile-hero-name"); if(phn) phn.textContent=val;
      const ghi=document.getElementById("greeting-hi"); if(ghi) ghi.textContent=ghi.textContent.replace(/, .+! 👋$/, `, ${val}! 👋`);
    } else if(editField==="email"){
      msg.textContent="⚠️ Para mudar o email, faça logout e login novamente com o novo email.";
      return;
    } else if(editField==="password"){
      msg.textContent="⚠️ Para mudar a senha, use 'Esqueci minha senha' na tela de login.";
      return;
    }
    msg.textContent="✅ Salvo!";
    setTimeout(()=>document.getElementById("profile-edit-modal").style.display="none",1200);
  }catch(e){msg.textContent="❌ Erro: "+e.message;}
}

// Load saved preferences on startup
function loadPreferences(){
  if(_cfg.fontSize) applyFontSize(_cfg.fontSize);
  if(_cfg.darkMode==="0") applyDarkMode(false);
  if(_cfg.sounds==="0") applySounds(false);
}

// ── AVATAR SYSTEM ─────────────────────────────────────────────────────────────
// Avatares organizados por categoria temática
const AVATAR_CATEGORIES = [
  { label:"⚓ Marítimo & Porto",    emojis:["⚓","🚢","🛳️","🌊","🐋","🦈","🐬","⛵","🪝","🗺️","🔭","🧭"] },
  { label:"🌍 COMEX & Negócios",    emojis:["🌍","💼","📦","🤝","📈","💰","🏦","📊","🌐","✉️","🖊️","🏢"] },
  { label:"🛢️ Offshore & Petróleo", emojis:["🛢️","⛽","🔧","🦺","⚙️","🏗️","🔩","🪛","🛠️","💥","🌅","🤿"] },
  { label:"🏨 Hotelaria & Turismo",  emojis:["🏨","🛎️","🗝️","🌺","🥂","🍾","🛁","🧳","🏖️","🌴","☀️","🎪"] },
  { label:"✈️ Aeroporto & Aviação",  emojis:["✈️","🛫","🛬","🛂","🗃️","🎒","🧳","🌤️","🪂","🚁","🛩️","⛅"] },
  { label:"🍽️ Restaurantes",        emojis:["🍽️","👨‍🍳","👩‍🍳","🥗","🍷","☕","🍰","🧑‍🍳","🥘","🫕","🍣","🧆"] },
  { label:"💼 Corporativo",          emojis:["💼","🧑‍💼","👔","📋","🖥️","📱","🎯","🏆","🥇","👑","🌟","⭐"] },
  { label:"🦸 Super-heróis & Fun",   emojis:["🦸","🦹","🧙","🧝","🤺","🥷","🦊","🐉","🦁","🐯","🦅","🐺"] },
  { label:"😄 Expressões",           emojis:["😎","🤓","🥳","😏","🤑","🥶","🤩","😤","🥸","🤠","🫡","😤"] },
];

const AVATAR_EMOJIS = AVATAR_CATEGORIES.flatMap(c=>c.emojis);

// ── AVATAR PICKER — tabs emoji/foto + preview ────────────────────────────────
function switchAvatarTab(tab){
  document.getElementById("apc-tab-emoji")?.classList.toggle("active", tab==="emoji");
  document.getElementById("apc-tab-photo")?.classList.toggle("active", tab==="photo");
  const emoji = document.getElementById("apc-panel-emoji");
  const photo = document.getElementById("apc-panel-photo");
  if(emoji) emoji.style.display = tab==="emoji" ? "block" : "none";
  if(photo) photo.style.display = tab==="photo" ? "flex" : "none";
}

function updateAvatarPreview(value){
  const preview = document.getElementById("apc-preview");
  if(!preview) return;
  if(value && value.startsWith("data:")){
    preview.innerHTML = `<img src="${value}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>`;
  } else {
    preview.innerHTML = value || "?";
    preview.style.fontSize = "32px";
  }
}

function removeAvatar(){
  _setCfg("avatar", null);
  const av = document.getElementById("profile-avatar");
  const dashAv = document.getElementById("dash-avatar-icon");
  const name = userData?.name || "?";
  if(av) av.textContent = name[0]?.toUpperCase() || "?";
  if(dashAv) dashAv.textContent = name[0]?.toUpperCase() || "👤";
  updateAvatarPreview(name[0]?.toUpperCase() || "?");
  if(currentUser) saveProgressSafe(currentUser.uid, {avatar: null}).catch(()=>{});
  showXpToast("🗑️ Avatar removido");
}

function loadAvatarPicker(){
  const grid = document.getElementById("avatar-emoji-grid");
  if(!grid) return;

  // Renderizar por categorias
  grid.innerHTML = AVATAR_CATEGORIES.map(cat=>`
    <div class="avatar-category-label">${cat.label}</div>
    <div class="avatar-category-row">
      ${cat.emojis.map(e=>`<button class="avatar-emoji-btn" data-emoji="${e}">${e}</button>`).join("")}
    </div>
  `).join("");

  grid.querySelectorAll(".avatar-emoji-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      // Mostrar preview antes de fechar
      updateAvatarPreview(btn.dataset.emoji);
      grid.querySelectorAll(".avatar-emoji-btn").forEach(b=>b.classList.remove("selected"));
      btn.classList.add("selected");
      setTimeout(()=>{
        saveAvatar(btn.dataset.emoji);
        document.getElementById("avatar-picker-modal").style.display="none";
      }, 300);
    });
  });

  // Destacar avatar atual e mostrar preview
  if(_cfg.avatar){
    grid.querySelectorAll(".avatar-emoji-btn").forEach(btn=>{
      btn.classList.toggle("selected", btn.dataset.emoji===_cfg.avatar);
    });
  }
  updateAvatarPreview(_cfg.avatar || userData?.name?.[0]?.toUpperCase() || "?");

  document.getElementById("avatar-picker-modal").style.display="flex";
}

function openAvatarPicker(){
  const grid=document.getElementById("avatar-emoji-grid"); if(!grid) return;
  grid.innerHTML=AVATAR_EMOJIS.map(e=>`<button class="avatar-emoji-btn" data-emoji="${e}">${e}</button>`).join("");
  grid.querySelectorAll(".avatar-emoji-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      saveAvatar(btn.dataset.emoji);
      document.getElementById("avatar-picker-modal").style.display="none";
    });
  });
  document.getElementById("avatar-picker-modal").style.display="flex";
}

function saveAvatar(value){
  _setCfg("avatar",value);
  if(currentUser) saveProgressSafe(currentUser.uid, {avatar: value}).catch(()=>{});
  // Update all avatar displays
  const pa=document.getElementById("profile-avatar");
  const dai=document.getElementById("dash-avatar-icon");
  if(pa) pa.innerHTML=(value.startsWith("data:")||value.startsWith("http"))?`<img src="${value}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"/>`:`<span style="font-size:28px">${value}</span>`;
  if(dai){
    if(value.startsWith("data:")||value.startsWith("http"))
      dai.innerHTML=`<img src="${value}" style="width:100%;height:100%;object-fit:cover;display:block;"/>`;
    else
      dai.textContent=value;
  }
}

function loadAvatar(){
  const saved=_cfg.avatar;
  if(!saved) return;
  const pa=document.getElementById("profile-avatar");
  const dai=document.getElementById("dash-avatar-icon");
  if(pa){
    if(saved.startsWith("data:")||saved.startsWith("http")){
      pa.innerHTML=`<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"/>`;
    } else {
      pa.innerHTML=`<span style="font-size:28px">${saved}</span>`;
    }
  }
  if(dai){
    if(saved.startsWith("data:")||saved.startsWith("http"))
      dai.innerHTML=`<img src="${saved}" style="width:100%;height:100%;object-fit:cover;display:block;"/>`;
    else
      dai.textContent=saved;
  }
}

// ── WRITING & TRANSLATION ─────────────────────────────────────────────────────
let currentWritingTopic=null, writingTopicIndex=0;

function openWriting(){
  _openWritingList(VICTOR_DATA.writingTopics,"✍️ Writing & Translation");
}

function openPreparePresent(){
  _openWritingList(VICTOR_DATA.prepareTopics||[],"🎙️ Prepare & Present");
}

function _openWritingList(topics, titleText){
  document.getElementById("writing-selector").style.display="block";
  document.getElementById("writing-exercise").style.display="none";
  const titleEl=document.querySelector("#view-writing .phases-title");
  if(titleEl) titleEl.textContent=titleText;
  const list=document.getElementById("writing-topic-list"); list.innerHTML="";

  const levelColors={A1:"#22c55e",A2:"#f59e0b",B1:"#c9933a",B2:"#7c3aed"};
  const catLabels={interview:"🎙️ Entrevista",presentation:"📊 Apresentação"};
  let lastCat=null;
  topics.forEach((topic,i)=>{
    if(topic.category&&topic.category!==lastCat){
      lastCat=topic.category;
      const sep=document.createElement("div"); sep.className="writing-section-sep";
      sep.textContent=catLabels[topic.category]||topic.category;
      list.appendChild(sep);
    }
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`
      <div class="phase-left">
        <div class="phase-num">${topic.icon} ${topic.title}</div>
        <div class="phase-sub">${topic.ptTitle}</div>
        <div class="phase-progress-text" style="color:${levelColors[topic.level]||'#c9933a'}">${topic.level}</div>
      </div>
      <div class="phase-right">→</div>
    `;
    div.addEventListener("click",()=>startWritingTopic(i,topics));
    list.appendChild(div);
  });
  showView("view-writing");
}

let _currentWritingTopics=null;
function startWritingTopic(index,topicsArr){
  if(topicsArr) _currentWritingTopics=topicsArr;
  const topics=_currentWritingTopics||VICTOR_DATA.writingTopics;
  writingTopicIndex=index;
  currentWritingTopic=topics[index];
  const t=currentWritingTopic;

  document.getElementById("writing-selector").style.display="none";
  document.getElementById("writing-exercise").style.display="block";
  document.getElementById("writing-feedback").style.display="none";

  const levelColors={A1:"#22c55e",A2:"#f59e0b",B1:"#c9933a",B2:"#7c3aed"};
  document.getElementById("writing-level-badge").textContent=t.level;
  document.getElementById("writing-level-badge").style.background=levelColors[t.level]||"#c9933a";
  document.getElementById("writing-title").textContent=`${t.icon} ${t.title}`;
  document.getElementById("writing-prompt").textContent=t.ptPrompt;
  document.getElementById("writing-example").textContent=t.example;
  // example — always open
  const exEl=document.getElementById("writing-example");
  if(exEl){ exEl.textContent=t.example; exEl.style.display="block"; }

  // tips
  const tipsEl=document.getElementById("writing-tips");
  if(tipsEl) tipsEl.innerHTML=t.tips.map(tip=>`<div class="writing-tip">✅ ${tip}</div>`).join("");

  // textarea
  const ta=document.getElementById("writing-textarea");
  ta.value=""; ta.disabled=false;
  document.getElementById("writing-charcount").textContent="0 palavras";
  document.getElementById("btn-check-writing").disabled=false;
  document.getElementById("btn-check-writing").textContent="🤖 Corrigir com IA";
  const inlineEl=document.getElementById("writing-correction-inline");
  if(inlineEl) inlineEl.style.display="none";

  // next button
  const _wTopics=_currentWritingTopics||VICTOR_DATA.writingTopics;
  const nextBtn=document.getElementById("btn-next-writing");
  if(writingTopicIndex<_wTopics.length-1){
    nextBtn.style.display="block";
    nextBtn.textContent=`Próximo: ${_wTopics[writingTopicIndex+1].icon} ${_wTopics[writingTopicIndex+1].title} →`;
  } else nextBtn.style.display="none";
}

async function checkWriting(){
  if(!isPro()) return showUpgradeScreen();

  const text=document.getElementById("writing-textarea").value.trim();
  if(!text||text.length<20) return showXpToast("✍️ Escreva mais antes de corrigir!");

  const btn=document.getElementById("btn-check-writing");
  btn.disabled=true; btn.textContent="🤖 Analisando...";

  const t=currentWritingTopic;

  try{
    const toneGuide={
      A1:"Be very encouraging. Focus on 2-3 key errors only. Use simple Portuguese.",
      A2:"Be friendly. Point out 3-4 improvements. Keep Portuguese feedback simple.",
      B1:"Be constructive. Analyze grammar, vocabulary and structure. Portuguese feedback.",
      B2:"Be thorough. Analyze grammar, vocabulary, coherence and style. Portuguese feedback."
    };

    const response=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-api-key":localStorage.getItem("vic_anthropic_key")||"",
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true"
      },
      body:JSON.stringify({
        model:"claude-haiku-4-5-20251001",
        max_tokens:1500,
        messages:[{
          role:"user",
          content:`You are an expert English teacher. Student level: ${t.level}. ${toneGuide[t.level]||toneGuide.B1}

TASK: ${t.title} — ${t.prompt}

STUDENT'S TEXT:
"${text}"

Respond ONLY in this exact JSON (no markdown, no backticks):
{
  "score": <1-10>,
  "good": "<2-3 sentences in Portuguese about what was done well>",
  "corrected": "<full corrected version: same content as student's text, only fix grammar/spelling/phrasing, keep the same ideas, appropriate for ${t.level} level>",
  "tips": [
    "<personalized actionable tip in Portuguese, e.g. 'Tente começar com...' or 'Use mais...' or 'Escreva frases mais...' — based on THIS specific text>",
    "<second personalized tip based on THIS text>",
    "<third personalized tip based on THIS text>"
  ]
}
Tips must be specific to the student's actual text, not generic advice.`
        }]
      })
    });

    if(!response.ok){
      if(response.status===401) localStorage.removeItem("vic_anthropic_key");
      btn.disabled=false; btn.textContent="🤖 Corrigir com IA";
      return showXpToast("❌ Erro na correção. Tente novamente.");
    }
    const data=await response.json();
    const raw=data.content?.[0]?.text||"";
    if(!raw){ btn.disabled=false; btn.textContent="🤖 Corrigir com IA"; return showXpToast("❌ Sem resposta da IA. Tente novamente."); }
    let result;
    try{ result=JSON.parse(raw.replace(/```json|```/g,"").trim()); }
    catch(e){ result={score:5,good:"Bom esforço!",tips:[],corrected:text}; }

    // Show inline corrected text below textarea
    const inlineEl=document.getElementById("writing-correction-inline");
    const inlineText=document.getElementById("wci-text");
    if(inlineEl&&inlineText&&result.corrected){
      inlineText.textContent=result.corrected;
      inlineEl.style.display="block";
    }

    // Show full feedback panel
    document.getElementById("writing-feedback").style.display="block";
    document.getElementById("wf-score").textContent=`${result.score}/10`;
    document.getElementById("wf-score").style.color=result.score>=7?"#22c55e":result.score>=5?"#f59e0b":"#ef4444";
    document.getElementById("wf-good").textContent=result.good||"Bom trabalho!";

    // Show personalized tips
    const errorsEl=document.getElementById("wf-errors");
    if(errorsEl){
      if(result.tips&&result.tips.length>0){
        errorsEl.innerHTML=result.tips.map(tip=>`
          <div class="wf-tip-item">💡 ${tip}</div>
        `).join("");
        errorsEl.style.display="block";
      } else {
        errorsEl.innerHTML=`<div class="wf-no-errors">🎉 Texto excelente!</div>`;
        errorsEl.style.display="block";
      }
    }

    document.getElementById("wf-corrected").textContent=result.corrected||text;

    // XP reward
    const xpGain=result.score>=8?30:result.score>=5?20:10;
    userData.xp=(userData.xp||0)+xpGain;
    showXpToast(`✍️ +${xpGain} XP`);
    if(currentUser) saveProgressSafe(currentUser.uid,{xp:userData.xp});
    updateDailyProgress("writing");
    btn.textContent="✅ Corrigido!";
    document.getElementById("writing-feedback").scrollIntoView({behavior:"smooth",block:"start"});

  }catch(e){
    btn.disabled=false; btn.textContent="🤖 Corrigir com IA";
    showXpToast("❌ Erro na correção. Tente novamente.");
  }
}

// ── BADGE SYSTEM ──────────────────────────────────────────────────────────────


// Session stats tracker (resets per session, persisted cumulatively in userData)
let _sessionStats = {
  answerStreak: 0,
  totalAnswers: 0,
  perfectAnswers: 0,
  voiceUsed: 0,
  retries: 0,
};

function _parseSegBadgeId(id){
  const p=id.replace(/^seg_/,"").split("_");
  const need=parseInt(p.pop());
  return {segId:p.join("_"),need};
}

function getBadgeStats(){
  const completed = userData?.completedMissions||[];

  // Single pass: count completed missions per segment
  const segMissions = {};
  completed.forEach(m=>{
    const idx=m.indexOf("_");
    if(idx>0){ const seg=m.slice(0,idx); segMissions[seg]=(segMissions[seg]||0)+1; }
  });

  const segDone = VICTOR_DATA.segments.filter(seg=>{
    const phases = seg.phases||[];
    const total = phases.reduce((a,p)=>(p.missions||[]).length+a,0);
    return total>0 && (segMissions[seg.id]||0)/total>=0.6;
  }).map(s=>s.id);

  return {
    xp: userData?.xp||0,
    loginStreak: userData?.streak||0,
    missionsCompleted: completed.length,
    totalAnswers: (userData?.totalAnswers||0)+_sessionStats.totalAnswers,
    perfectAnswers: (userData?.perfectAnswers||0)+_sessionStats.perfectAnswers,
    voiceUsed: userData?.voiceUsed||0,
    retries: (userData?.retries||0)+_sessionStats.retries,
    answerStreak: userData?.answerStreak||0,
    segmentsDone: segDone,
    segMissions,
    writingCompleted: userData?.writingCompleted||0,
    grammarCompleted: completed.filter(m=>m.startsWith("gramatica_")).length,
  };
}

function checkBadges(){
  const stats = getBadgeStats();
  const earned = userData?.badges||[];
  const newBadges = BADGES.filter(b => !earned.includes(b.id) && b.condition(stats));
  if(!newBadges.length) return;

  // Save ALL newly earned badges silently (including catch-up from other segments)
  const updated = [...earned, ...newBadges.map(b=>b.id)];
  userData.badges = updated;
  if(currentUser) saveProgressSafe(currentUser.uid, {badges:updated});

  // Only SHOW seg_ badges from the active segment — never interrupt with an unrelated segment badge
  const toShow = newBadges.filter(b => {
    if(!b.id.startsWith("seg_")) return true;
    const {segId} = _parseSegBadgeId(b.id);
    return segId === currentSegmentId;
  });
  if(!toShow.length) return;
  showBadgeUnlock(toShow[0]);
}

function showBadgeUnlock(badge){
  document.getElementById("badge-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "badge-overlay";
  overlay.className = "badge-overlay";
  overlay.innerHTML = `
    <div class="badge-unlock-card">
      <div class="badge-unlock-shimmer"></div>
      <div class="badge-cat-label">${{momento:"⚡ Momento",performance:"🔥 Performance",resiliencia:"⚔️ Resiliência",dominio:"🧠 Domínio",raro:"👑 Raro"}[badge.cat]||""}</div>
      <div class="badge-unlock-icon">${badge.icon}</div>
      <div class="badge-unlock-name">${badge.name}</div>
      <div class="badge-unlock-desc">${badge.desc}</div>
      <div class="badge-unlock-xp">+${badge.xp} XP</div>
      <div class="badge-unlock-actions">
        <button class="badge-unlock-btn" onclick="document.getElementById('badge-overlay').remove()">Incrível! 🚀</button>
        <button class="badge-share-btn" onclick="shareBadge(${JSON.stringify(badge).replace(/"/g,'&quot;')})">Compartilhar 📲</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  SoundFX.complete();
  vibrate([60,30,60,30,200]);

  userData.xp=(userData.xp||0)+badge.xp;
  if(currentUser) saveProgressSafe(currentUser.uid,{xp:userData.xp});
  showXpToast(`${badge.icon} +${badge.xp} XP — ${badge.name}`);

  setTimeout(()=>overlay.remove(), 8000);
}

async function shareBadge(badge){
  try{
    // Load logo for branding footer (cached after first load)
    if(!_logoImgCache) _logoImgCache = await new Promise(res => {
      const img = new Image();
      img.onload  = () => res(img);
      img.onerror = () => res(null);
      img.src = "/logo_full_2.png";
    });
    const logoImg = _logoImgCache;

    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    // ── BACKGROUND ───────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0,0,1080,1080);
    bg.addColorStop(0,"#08052a");
    bg.addColorStop(0.5,"#130845");
    bg.addColorStop(1,"#08052a");
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,1080,1080);

    // Purple spotlight top-center
    const spl = ctx.createRadialGradient(540,180,0,540,180,700);
    spl.addColorStop(0,"rgba(124,58,237,0.40)");
    spl.addColorStop(0.55,"rgba(124,58,237,0.10)");
    spl.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = spl; ctx.fillRect(0,0,1080,1080);

    // Pink glow center
    const pg = ctx.createRadialGradient(540,430,0,540,430,460);
    pg.addColorStop(0,"rgba(236,72,153,0.22)");
    pg.addColorStop(0.6,"rgba(236,72,153,0.06)");
    pg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = pg; ctx.fillRect(0,0,1080,1080);

    // ── LIGHT RAYS from center ────────────────────────────────────
    ctx.save(); ctx.translate(540,430);
    for(let i=0;i<12;i++){
      const a = (i/12)*Math.PI*2;
      const rg = ctx.createLinearGradient(0,0,Math.cos(a)*500,Math.sin(a)*500);
      rg.addColorStop(0,"rgba(255,255,255,0.055)");
      rg.addColorStop(1,"rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.moveTo(0,0);
      const w = Math.PI/18;
      ctx.lineTo(Math.cos(a-w)*500, Math.sin(a-w)*500);
      ctx.lineTo(Math.cos(a+w)*500, Math.sin(a+w)*500);
      ctx.closePath();
      ctx.fillStyle = rg; ctx.fill();
    }
    ctx.restore();

    // ── BORDER — purple→pink gradient glow ────────────────────────
    const brd = ctx.createLinearGradient(0,0,1080,1080);
    brd.addColorStop(0,"rgba(124,58,237,0.95)");
    brd.addColorStop(0.5,"rgba(236,72,153,0.95)");
    brd.addColorStop(1,"rgba(124,58,237,0.95)");
    ctx.shadowColor="rgba(124,58,237,0.8)"; ctx.shadowBlur=36;
    ctx.strokeStyle=brd; ctx.lineWidth=7;
    ctx.beginPath(); ctx.roundRect(6,6,1068,1068,50); ctx.stroke();
    ctx.shadowBlur=0;
    // inner soft ring
    ctx.strokeStyle="rgba(255,255,255,0.07)"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(20,20,1040,1040,42); ctx.stroke();

    // ── HEADER PILL ───────────────────────────────────────────────
    const pw=660,ph=60,px=(1080-pw)/2,py=88;
    const pg2 = ctx.createLinearGradient(px,0,px+pw,0);
    pg2.addColorStop(0,"rgba(124,58,237,0.55)");
    pg2.addColorStop(1,"rgba(236,72,153,0.55)");
    ctx.fillStyle=pg2;
    ctx.beginPath(); ctx.roundRect(px,py,pw,ph,30); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.18)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(px,py,pw,ph,30); ctx.stroke();
    ctx.fillStyle="#fff";
    ctx.font="700 27px system-ui,sans-serif";
    ctx.textAlign="center"; ctx.letterSpacing="7px";
    ctx.fillText("CONQUISTA DESBLOQUEADA",540,py+40);
    ctx.letterSpacing="0px";

    // ── GLOW RING behind emoji ────────────────────────────────────
    const cx=540,cy=420;
    // soft halo layers
    [[260,0.10],[210,0.18],[160,0.28]].forEach(([r,a])=>{
      const h = ctx.createRadialGradient(cx,cy,r*0.4,cx,cy,r);
      h.addColorStop(0,`rgba(150,60,240,${a})`);
      h.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=h;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    });
    // circle stroke
    ctx.shadowColor="rgba(124,58,237,0.6)"; ctx.shadowBlur=24;
    ctx.strokeStyle="rgba(180,100,255,0.35)"; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(cx,cy,195,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;

    // ── SPARKLE PARTICLES ─────────────────────────────────────────
    const sparks=[
      {a:0.20,r:218,s:7},{a:0.55,r:212,s:5},{a:0.85,r:222,s:8},
      {a:1.20,r:208,s:5},{a:1.55,r:220,s:6},{a:1.90,r:214,s:7},
      {a:2.30,r:210,s:5},{a:2.70,r:218,s:8},{a:3.10,r:212,s:5},
      {a:3.50,r:208,s:7},{a:3.90,r:220,s:5},{a:4.30,r:214,s:6},
      {a:4.75,r:210,s:7},{a:5.20,r:218,s:5},{a:5.65,r:212,s:6},
    ];
    const sparkColors=["rgba(180,100,255,1)","rgba(236,72,153,1)","rgba(255,215,100,1)"];
    ctx.shadowBlur=12;
    sparks.forEach((sp,i)=>{
      const sx=cx+Math.cos(sp.a)*sp.r, sy=cy+Math.sin(sp.a)*sp.r;
      ctx.shadowColor=sparkColors[i%3];
      ctx.fillStyle="#fff";
      ctx.beginPath(); ctx.arc(sx,sy,sp.s/2,0,Math.PI*2); ctx.fill();
    });
    ctx.shadowBlur=0;

    // ── EMOJI ─────────────────────────────────────────────────────
    ctx.font="200px serif"; ctx.textAlign="center";
    ctx.fillText(badge.icon, cx, cy+68);

    // ── BADGE NAME — gold gradient ────────────────────────────────
    const ng = ctx.createLinearGradient(160,0,920,0);
    ng.addColorStop(0,"#e8a84a"); ng.addColorStop(0.5,"#fff3d0"); ng.addColorStop(1,"#e8a84a");
    ctx.shadowColor="rgba(230,170,60,0.65)"; ctx.shadowBlur=28;
    ctx.fillStyle=ng; ctx.font="800 70px system-ui,sans-serif";
    ctx.fillText(badge.name,540,622);
    ctx.shadowBlur=0;

    // ── DESCRIPTION ───────────────────────────────────────────────
    ctx.fillStyle="rgba(255,255,255,0.58)";
    ctx.font="36px system-ui,sans-serif";
    const dwords=badge.desc.split(" ");
    let dline="",dlines=[],dmaxW=860;
    dwords.forEach(w=>{
      const t=dline?dline+" "+w:w;
      if(ctx.measureText(t).width>dmaxW){dlines.push(dline);dline=w;}
      else dline=t;
    });
    if(dline)dlines.push(dline);
    dlines.forEach((l,i)=>ctx.fillText(l,540,686+i*50));

    // ── XP PILL ───────────────────────────────────────────────────
    const xpTop=686+Math.max(dlines.length,1)*50+28;
    const xpW=272,xpH=74,xpX=(1080-xpW)/2;
    const xpG=ctx.createLinearGradient(xpX,0,xpX+xpW,0);
    xpG.addColorStop(0,"rgba(124,58,237,0.55)"); xpG.addColorStop(1,"rgba(236,72,153,0.55)");
    ctx.fillStyle=xpG; ctx.beginPath(); ctx.roundRect(xpX,xpTop,xpW,xpH,37); ctx.fill();
    ctx.shadowColor="rgba(201,147,58,0.5)"; ctx.shadowBlur=12;
    ctx.strokeStyle="rgba(230,170,60,0.8)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(xpX,xpTop,xpW,xpH,37); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.fillStyle="#f2c87a"; ctx.font="800 44px system-ui,sans-serif";
    ctx.fillText(`+${badge.xp} XP`,540,xpTop+50);

    // ── DIVIDER ───────────────────────────────────────────────────
    const dvY=930;
    const dvG=ctx.createLinearGradient(60,0,1020,0);
    dvG.addColorStop(0,"rgba(255,255,255,0)");
    dvG.addColorStop(0.3,"rgba(124,58,237,0.5)");
    dvG.addColorStop(0.7,"rgba(236,72,153,0.5)");
    dvG.addColorStop(1,"rgba(255,255,255,0)");
    ctx.strokeStyle=dvG; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(60,dvY); ctx.lineTo(1020,dvY); ctx.stroke();

    // ── LOGO + URL ────────────────────────────────────────────────
    if(logoImg){
      const lh=52, lw=Math.round(logoImg.width*(lh/logoImg.height));
      ctx.globalAlpha=0.82;
      ctx.drawImage(logoImg,540-lw/2,dvY+16,lw,lh);
      ctx.globalAlpha=1;
      ctx.fillStyle="rgba(255,255,255,0.28)"; ctx.font="23px system-ui,sans-serif";
      ctx.fillText("app.viclanguage.com.br",540,dvY+82);
    } else {
      ctx.fillStyle="rgba(255,255,255,0.35)"; ctx.font="700 30px system-ui,sans-serif";
      ctx.fillText("VIC English",540,dvY+46);
      ctx.fillStyle="rgba(255,255,255,0.28)"; ctx.font="23px system-ui,sans-serif";
      ctx.fillText("app.viclanguage.com.br",540,dvY+76);
    }

    // Convert to blob and share
    canvas.toBlob(async blob => {
      if(!blob) return;
      const file = new File([blob], "conquista-vic.png", {type:"image/png"});
      if(navigator.canShare?.({files:[file]})){
        try{
          await navigator.share({
            files:[file],
            title: `Conquista: ${badge.name}`,
            text: `Desbloqueei "${badge.name}" no VIC English! ${badge.icon} +${badge.xp} XP`,
          });
        }catch(e){ if(e.name!=="AbortError") _shareDownload(canvas); }
      } else {
        _shareDownload(canvas);
      }
    }, "image/png");
  }catch(e){ vicLog("share","badge share failed",e); }
}

function _shareDownload(canvas){
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "conquista-vic.png";
  a.click();
}

let _streakMissionTriggered = false;
function trackAnswer(isCorrect, isVoice=false){
  _sessionStats.totalAnswers++;
  if(isCorrect){
    _sessionStats.perfectAnswers++;
    _sessionStats.answerStreak = (userData?.answerStreak||0)+1;
    userData.answerStreak = _sessionStats.answerStreak;
    // Streak mission: 5 consecutive correct answers
    if(userData.answerStreak >= 5 && !_streakMissionTriggered){
      _streakMissionTriggered = true;
      updateDailyProgress("streak");
    }
  } else {
    _sessionStats.retries++;
    userData.answerStreak = 0;
    _streakMissionTriggered = false;
  }
  if(isVoice){
    _sessionStats.voiceUsed++;
    updateDailyProgress("voice");
  }
  // Save stats periodically
  if(_sessionStats.totalAnswers%5===0&&currentUser){
    saveProgress(currentUser.uid,{
      totalAnswers:(userData.totalAnswers||0)+_sessionStats.totalAnswers,
      perfectAnswers:(userData.perfectAnswers||0)+_sessionStats.perfectAnswers,
      answerStreak:userData.answerStreak||0,
    });
  }
  // Check for new badges
  checkBadges();
}

// ── VIBRATION ──────────────────────────────────────────

// ── PUSH NOTIFICATIONS ─────────────────────────────────


// ── ONESIGNAL ────────────────────────────────────────────────────────────────
const OS_APP_ID = "0d10ba5b-6831-4a78-aa5f-1b001370a487";

function initOneSignal(){
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal){
    await OneSignal.init({
      appId: OS_APP_ID,
      safari_web_id: "web.onesignal.auto.54eebb47-16d1-4f2f-8c9e-9bb7522bb051",
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });
    // Tag com data da última visita — usado para segmentar lembretes no dashboard
    const today = new Date().toISOString().slice(0,10);
    OneSignal.User.addTag("last_visit", today).catch(()=>{});
    if(currentUser?.uid) OneSignal.User.addTag("uid", currentUser.uid).catch(()=>{});
  });
}

async function requestNotificationPermission(){
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal){
    await OneSignal.Notifications.requestPermission();
  });
}

// Ask for notifications with a full-screen modal after first mission
function showNotifBanner(){
  if(_cfg.notifAsked) return;
  // Delay so the mission-complete celebration plays first
  setTimeout(()=>{
    _setCfg("notifAsked","1");
    const overlay=document.createElement("div");
    overlay.className="notif-modal-overlay";
    overlay.innerHTML=`
      <div class="notif-modal">
        <div class="notif-modal-icon">🔔</div>
        <h2>Receba dicas todo dia</h2>
        <p class="notif-sub">Ative as notificações e não perca seu streak — mesmo com o app fechado.</p>
        <ul class="notif-modal-perks">
          <li><span class="perk-icon">💡</span>Dica diária de inglês: false friends, phrasal verbs e mais</li>
          <li><span class="perk-icon">🔥</span>Lembrete de streak para você nunca quebrar a sequência</li>
          <li><span class="perk-icon">🧠</span>Curiosidades científicas sobre aprender uma nova língua</li>
        </ul>
        <button class="btn-notif-yes" id="btn-notif-yes">Sim, quero receber! 🚀</button>
        <button class="btn-notif-skip">Talvez depois</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".btn-notif-skip").onclick=()=>overlay.remove();
    overlay.querySelector("#btn-notif-yes").onclick=async()=>{
      overlay.remove();
      await requestNotificationPermission();
    };
  }, 1800);
}

function scheduleNotifications(){ /* OneSignal gerencia — noop */ }

// ── PUSH DO PAINEL ADMIN ─────────────────────────────────────────────────────
// O envio manual agora é feito pelo dashboard OneSignal (onesignal.com)
// ou via API REST abaixo:
async function sendPushFromAdmin(){
  const title = document.getElementById("push-title")?.value?.trim();
  const body  = document.getElementById("push-body")?.value?.trim();
  if(!title||!body){ showXpToast("❌ Preencha título e mensagem!"); return; }

  const btn = document.getElementById("btn-send-push");
  if(btn){ btn.disabled=true; btn.textContent="Enviando..."; }

  try{
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic OS_REST_API_KEY", // substitua no dashboard
      },
      body: JSON.stringify({
        app_id: OS_APP_ID,
        included_segments: ["All"],
        headings: { en: title, pt: title },
        contents:  { en: body,  pt: body  },
        url: "https://app.viclanguage.com.br",
      }),
    });
    const data = await res.json();
    if(data.id){
      showXpToast(`✅ Push enviado para ${data.recipients||"todos"} usuários!`);
      if(document.getElementById("push-title")) document.getElementById("push-title").value="";
      if(document.getElementById("push-body"))  document.getElementById("push-body").value="";
    } else {
      showXpToast("❌ Erro: " + (data.errors?.[0]||"desconhecido"));
    }
  }catch(e){
    showXpToast("❌ Erro ao enviar: " + e.message);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent="📣 Enviar para todos"; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOADING SPLASH — aparece quando usuário já está logado (keep me signed in)
// ══════════════════════════════════════════════════════════════════════════════

const LOADING_PHRASES = [
  // Motivacionais com filmes/heróis
  { en:"With great power comes great responsibility.", pt:"Com grandes poderes vêm grandes responsabilidades.", sub:'— Uncle Ben, Spider-Man' },
  { en:"Do or do not. There is no try.", pt:"Faça ou não faça. Tentar não existe.", sub:"— Yoda, Star Wars" },
  { en:"I am Iron Man.", pt:"Eu sou o Homem de Ferro.", sub:"— Tony Stark  |  Be the hero of your career." },
  { en:"Whatever it takes.", pt:"Custe o que custar.", sub:"— Avengers Endgame  |  Your English journey." },
  { en:"To infinity and beyond!", pt:"Ao infinito e além!", sub:"— Buzz Lightyear  |  No limits in learning." },
  { en:"May the Force be with you.", pt:"Que a Força esteja com você.", sub:"— Obi-Wan Kenobi  |  And with your English!" },
  { en:"You shall not pass!", pt:"Você não vai passar!", sub:"— Gandalf  |  Except through this app, every day." },
  { en:"Why so serious?", pt:"Por que tão sério?", sub:"— Joker  |  Learning English can be fun!" },
  { en:"Elementary, my dear Watson.", pt:"Elementar, meu caro Watson.", sub:"— Sherlock Holmes  |  English is elementary." },
  { en:"Just keep swimming.", pt:"Continue nadando.", sub:"— Dory, Finding Nemo  |  Just keep practicing." },
  // Mercado de trabalho
  { en:"Professionals who speak English earn up to 40% more.", pt:"Profissionais que falam inglês ganham até 40% a mais.", sub:"— Source: IBGE / FGV  |  Every mission = real value." },
  { en:"70% of maritime communications worldwide are in English.", pt:"70% das comunicações marítimas no mundo são em inglês.", sub:"— IMO International Standards  |  Are you ready?" },
  { en:"Bilingual professionals are hired 3x faster.", pt:"Profissionais bilíngues são contratados 3x mais rápido.", sub:"— LinkedIn Workforce Report  |  Start your mission." },
  { en:"In Brazil, English fluency can double your salary.", pt:"No Brasil, a fluência em inglês pode dobrar seu salário.", sub:"— Catho Salary Survey  |  Each lesson counts." },
  { en:"95% of international business is conducted in English.", pt:"95% dos negócios internacionais são feitos em inglês.", sub:"— Harvard Business Review  |  Be part of it." },
  // Porto de Santos — dados reais
  { en:"Santos Port handles over 150 million tons of cargo per year.", pt:"O Porto de Santos movimenta mais de 150 milhões de toneladas de carga por ano.", sub:"🚢 Porto de Santos — the largest port in Latin America." },
  { en:"Santos Port employs over 100,000 people directly and indirectly.", pt:"O Porto de Santos emprega mais de 100 mil pessoas direta e indiretamente.", sub:"⚓ Santos  |  Your city. Your opportunity." },
  { en:"More than 60 countries receive cargo from Santos Port every year.", pt:"Mais de 60 países recebem carga do Porto de Santos todo ano.", sub:"🌍 Santos connects Brazil to the world — in English." },
  { en:"Santos handles 28% of all Brazilian foreign trade.", pt:"Santos concentra 28% de todo o comércio exterior brasileiro.", sub:"📦 COMEX, maritime, logistics — all in English." },
  { en:"Santos Port moved R$ 800 billion in goods in 2023.", pt:"O Porto de Santos movimentou R$ 800 bilhões em mercadorias em 2023.", sub:"💰 The biggest port business speaks English." },
  { en:"Over 4,000 vessels dock at Santos Port every year.", pt:"Mais de 4.000 navios atracam no Porto de Santos todo ano.", sub:"⚓ Each ship needs English communication on board." },
  { en:"Santos is the 4th busiest container port in South America.", pt:"Santos é o 4º porto de contêineres mais movimentado da América do Sul.", sub:"🏆 And VIC English is training the people behind it." },
  // Ciência de aprendizagem
  { en:"The brain consolidates language during sleep.", pt:"O cérebro consolida o idioma durante o sono.", sub:"🧠 Neuroscience  |  Practice before bed = wake up fluent." },
  { en:"Spaced repetition is 3x more effective than mass studying.", pt:"A repetição espaçada é 3x mais eficaz que estudar tudo de uma vez.", sub:"📚 Cambridge Research  |  VIC uses this method." },
  { en:"10 minutes a day beats 2 hours on weekends.", pt:"10 minutos por dia valem mais que 2 horas no fim de semana.", sub:"🎯 Harvard Learning Lab  |  Consistency is the superpower." },
  { en:"Bilingual people develop Alzheimer's 5 years later on average.", pt:"Pessoas bilíngues desenvolvem Alzheimer 5 anos mais tarde, em média.", sub:"🧬 Journal of Neurology  |  English is good for your brain!" },
  { en:"Speaking out loud increases retention by 50%.", pt:"Falar em voz alta aumenta a retenção em 50%.", sub:"🗣️ Production Effect Study  |  Try our speaking exercises!" },
  { en:"Learning a language increases grey matter density.", pt:"Aprender um idioma aumenta a densidade da massa cinzenta.", sub:"🧠 Max Planck Institute  |  You literally grow your brain." },
  { en:"Context learning is 4x faster than memorizing word lists.", pt:"Aprender por contexto é 4x mais rápido que decorar listas de palavras.", sub:"💡 VIC English approach  |  Real situations, real results." },
  // Motivacionais diretos
  { en:"Your next promotion might depend on this moment.", pt:"Sua próxima promoção pode depender deste momento.", sub:"⚡ Keep going. Your future self will thank you." },
  { en:"Every world-class professional speaks English.", pt:"Todo profissional de alto nível fala inglês.", sub:"🌐 Join them. One mission at a time." },
  { en:"The best sailors speak the language of the sea.", pt:"Os melhores marinheiros falam a língua do mar.", sub:"⚓ English is the official language of maritime navigation." },
  { en:"Offshore platforms communicate in English 100% of the time.", pt:"Plataformas offshore se comunicam 100% em inglês.", sub:"🛢️ Be ready when the opportunity arrives." },
  { en:"International hotels prefer bilingual staff for every position.", pt:"Hotéis internacionais preferem equipe bilíngue em todas as posições.", sub:"🏨 Your English is your competitive advantage." },
]

const LOADING_TIPS = [
  "Toque no botão 🐢 para ouvir as palavras mais devagar",
  "Use o microfone para praticar a pronúncia",
  "Veja suas conquistas no seu perfil",
  "Complete as missões diárias para manter seu streak",
  "Mude o idioma em Configurações → Idioma",
]

let _splashTimeout = null;

function showLoadingSplash(onDone, minMs = 2200) {
  const phrase = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
  const tip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];

  document.getElementById("loading-splash-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "loading-splash-overlay";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:10000;
    background:linear-gradient(160deg,#1a0d2e 0%,#0d0720 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:40px 32px;text-align:center;
    animation:fadeIn .3s ease;
  `;

  overlay.innerHTML = `
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 50% at 50% 30%,rgba(201,147,58,0.1),transparent);pointer-events:none;"></div>
    <img src="vic_english_logo.png" alt="VIC English"
      style="width:170px;border-radius:24px;margin-bottom:32px;filter:drop-shadow(0 0 30px rgba(201,147,58,0.5)) drop-shadow(0 0 60px rgba(124,58,237,0.3));animation:pulse 2s ease infinite;"/>
    <div style="font-size:20px;font-weight:800;color:#fff;line-height:1.4;margin-bottom:8px;max-width:340px;font-style:italic;">
      "${phrase.en}"
    </div>
    <div style="font-size:14px;color:rgba(255,255,255,0.6);font-weight:500;line-height:1.4;margin-bottom:12px;max-width:320px;font-style:italic;">
      ${phrase.pt}
    </div>
    <div style="font-size:13px;color:#e4b45c;font-weight:600;margin-bottom:36px;opacity:0.85;">
      ${phrase.sub}
    </div>
    <div style="width:200px;height:3px;background:rgba(255,255,255,0.1);border-radius:999px;margin-bottom:20px;overflow:hidden;">
      <div id="splash-progress-bar"
        style="height:100%;background:linear-gradient(90deg,#c9933a,#e4b45c);border-radius:999px;width:0%;transition:width ${(minMs/1000).toFixed(1)}s ease;"></div>
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.35);max-width:280px;line-height:1.5;">
      💡 ${tip}
    </div>
    <div style="position:absolute;bottom:32px;font-size:11px;color:rgba(255,255,255,0.2);font-weight:600;letter-spacing:.5px;text-transform:uppercase;">
      Powered by VIC Language
    </div>
  `;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    const bar = document.getElementById("splash-progress-bar");
    if(bar) bar.style.width = "100%";
  });

  // Safety net: never stay stuck more than 8 seconds regardless of what happens
  clearTimeout(window._splashSafetyTimeout);
  window._splashSafetyTimeout = setTimeout(() => hideLoadingSplash(), 8000);

  clearTimeout(_splashTimeout);
  if(minMs > 0){
    _splashTimeout = setTimeout(() => {
      overlay.style.transition = "opacity .4s ease";
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.remove(); if(onDone) onDone(); }, 400);
    }, minMs);
  }
}

function hideLoadingSplash() {
  clearTimeout(window._splashSafetyTimeout);
  clearTimeout(_splashTimeout);
  const overlay = document.getElementById("loading-splash-overlay");
  if(overlay) {
    overlay.style.transition = "opacity .3s ease";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 300);
  }
}


// ── INIT ──────────────────────────────────────────────────────────────────────
// Clean state machine:
//   NEW USER  → onboarding → auth → (register) → splash → dashboard → diagnosis
//   RETURNING → splash → dashboard
async function _handleAuth(user){
  if(window._sessionTimeout){ clearTimeout(window._sessionTimeout); window._sessionTimeout=null; }
  hideAuthLoading();

  // Hard block: NEVER navigate automatically while onboarding is active.
  // Only the user's button clicks (obNext/obSkip) may change the screen.
  if(_onboardingActive){
    if(user) currentUser = user;
    return;
  }

  // ── No user logged in ─────────────────────────────────────────────────────
  if(!user){
    currentUser=null; userData=null;
    localStorage.removeItem("vic_has_session");
    hideLoadingSplash();
    showView("view-auth");
    return;
  }

  // ── Returning user logged in ──────────────────────────────────────────────
  // Only keep/use the splash if it was already showing (initial app load).
  // After a manual login the auth-loading spinner was already shown — don't add a second screen.
  const splashWasShowing = !!document.getElementById("loading-splash-overlay");
  hideAuthLoading();

  // Block unverified email users (Google logins are pre-verified, guests are local)
  if(!user.emailVerified && !user.isLocalGuest &&
     user.uid !== OWNER_UID &&
     user.providerData?.[0]?.providerId === "password"){
    hideLoadingSplash();
    const addrEl = document.getElementById("verify-email-addr");
    if(addrEl) addrEl.textContent = user.email || "";
    showView("view-verify-email");
    return;
  }

  const t0 = Date.now();
  try{
    if(user.uid===OWNER_UID){ currentUser=user; await loadAdminDashboard(); }
    else{ await loadDashboard(user); }
    if(Notification.permission==="granted") registerFCMToken(user.uid).catch(()=>{});
  }catch(e){
    console.error("loadDashboard error:", e.message);
    try{ await loadDashboard(user); }
    catch(e2){
      hideLoadingSplash();
      showView("view-auth");
      showAuthError("Erro ao carregar. Tente novamente.");
      return;
    }
  }

  if(splashWasShowing){
    // Keep splash for at least 2.5 seconds so user can read the phrase
    const elapsed = Date.now() - t0;
    const remaining = Math.max(0, 2500 - elapsed);
    await new Promise(r => setTimeout(r, remaining));
    hideLoadingSplash();
  }

  // Celebrate successful email verification on first load after clicking link
  if(window._showEmailVerifiedCelebration){
    window._showEmailVerifiedCelebration = false;
    setTimeout(()=>{
      showXpToast("🎉 Email verificado! Bem-vindo(a) ao VIC English!");
    }, 800);
  }
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
let obStep = 0;
const OB_TOTAL = 5;
let _obLocked = false; // debounce: prevents double-fire on touch devices

function startOnboarding(){
  obStep = 0;
  _obLocked = false;
  _onboardingActive = true; // block all automatic navigation
  // Auto-show Android install instructions if on Android
  const isAndroid = /android/i.test(navigator.userAgent);
  if(isAndroid) showInstallOS("android");
  renderObStep();
  showView("view-onboarding");
}

function renderObStep(){
  document.querySelectorAll(".ob-slide").forEach(s=>s.classList.remove("active"));
  document.querySelectorAll(".ob-dot").forEach(d=>d.classList.remove("active"));
  document.getElementById(`ob-slide-${obStep}`)?.classList.add("active");
  document.getElementById(`ob-dot-${obStep}`)?.classList.add("active");
  const btn = document.getElementById("ob-btn-next");
  if(btn){
    const isLast = obStep === OB_TOTAL - 1;
    const key = isLast ? "ob_start" : "ob_next";
    btn.setAttribute("data-i18n", key);
    btn.textContent = t(key);
    btn.setAttribute("onclick", isLast ? "obSkip()" : "obNext()");
  }
  const backBtn = document.getElementById("ob-btn-back");
  if(backBtn) backBtn.style.display = obStep > 0 ? "block" : "none";
}

function obBack(){
  if(_obLocked || obStep === 0) return;
  _obLocked = true;
  setTimeout(() => { _obLocked = false; }, 600);
  obStep--;
  renderObStep();
}

function obNext(){
  if(_obLocked) return;
  _obLocked = true;
  setTimeout(() => { _obLocked = false; }, 600);
  if(obStep < OB_TOTAL - 1){
    obStep++;
    renderObStep();
  }
}

function showInstallOS(os){
  const ios=document.getElementById("ob-install-ios");
  const android=document.getElementById("ob-install-android");
  const btnIos=document.getElementById("ob-os-ios");
  const btnAndroid=document.getElementById("ob-os-android");
  if(os==="ios"){
    if(ios) ios.style.display="flex";
    if(android) android.style.display="none";
    if(btnIos) btnIos.classList.add("active");
    if(btnAndroid) btnAndroid.classList.remove("active");
  } else {
    if(ios) ios.style.display="none";
    if(android) android.style.display="flex";
    if(btnIos) btnIos.classList.remove("active");
    if(btnAndroid) btnAndroid.classList.add("active");
  }
}

function obSkip(){
  _onboardingActive = false; // release the block
  localStorage.setItem("vic_onboarding_done","1");
  if(currentUser){
    // User was already logged in — go straight to dashboard
    if(currentUser.uid === OWNER_UID) loadAdminDashboard();
    else _handleAuth(currentUser); // use normal flow with splash
  } else {
    showView("view-auth");
  }
}

// ── LEADERBOARD ────────────────────────────────────────────────────────────────
let _lbMode = "week";

// ── LEADERBOARD BOTTOM SHEET ─────────────────────────────────────────────────
function openLeaderboard(){
  const sheet = document.getElementById("lb-sheet");
  const overlay = document.getElementById("lb-sheet-overlay");
  if(!sheet || !overlay) return;

  sheet.style.display = "flex";
  overlay.style.display = "block";

  // Animação de entrada
  sheet.style.transform = "translateY(100%)";
  sheet.style.transition = "transform .35s cubic-bezier(0.22,1,0.36,1)";
  requestAnimationFrame(()=>{ sheet.style.transform = "translateY(0)"; });

  loadLeaderboard("week");
}

function closeLeaderboard(){
  const sheet = document.getElementById("lb-sheet");
  const overlay = document.getElementById("lb-sheet-overlay");
  if(!sheet) return;
  sheet.style.transform = "translateY(100%)";
  setTimeout(()=>{
    sheet.style.display = "none";
    overlay.style.display = "none";
  }, 350);
}

async function loadLeaderboard(mode, tabEl){
  _lbMode = mode;
  document.querySelectorAll(".lb-tab").forEach(t=>t.classList.remove("active"));
  if(tabEl) tabEl.classList.add("active");
  else document.getElementById(`lb-tab-${mode}`)?.classList.add("active");

  const listEl = document.getElementById("lb-list");
  const podiumEl = document.getElementById("lb-podium");
  if(listEl) listEl.innerHTML = `<div class="lb-loading">${t("loading")} ⏳</div>`;
  if(podiumEl) podiumEl.style.opacity = "0.4";

  try{
    let all = await getAllUsers();
    // Fallback: at minimum include the current user so ranking is never fully empty
    if(all.length===0 && userData) all = [userData];
    const sorted = [...all].sort((a,b)=>(b.xp||0)-(a.xp||0));
    const top10 = sorted.slice(0,10);

    const topBadge = (u) => {
      const completed = u.completedMissions||[];
      const segs = VICTOR_DATA?.segments||[];
      for(const seg of segs){
        const total = (seg.phases||[]).reduce((a,p)=>(p.missions||[]).length+a,0);
        const done  = completed.filter(m=>m.startsWith(seg.id+"_")).length;
        if(total>0 && done/total>=0.6) return seg.icon||"🏅";
      }
      const xp = u.xp||0;
      if(xp>=2500) return "🏅"; if(xp>=1000) return "💎";
      if(xp>=500)  return "🔱"; if(xp>=250)  return "⚡";
      if(xp>=100)  return "🌟"; return "🌱";
    };

    // Sync current user's local avatar into the fetched list so it renders immediately
    const myEntry = all.find(u => u.uid === currentUser?.uid);
    const localAv = _cfg.avatar || localStorage.getItem("vic_avatar");
    if(myEntry && !myEntry.avatar && localAv){
      myEntry.avatar = localAv;
      saveProgress(currentUser.uid, { avatar: localAv }).catch(()=>{});
    }

    const avHtml = (u, size=52) => {
      const av = u.avatar||null;
      const name = u.provider==="anonymous"?"👤":(u.name||"?");
      if(av && (av.startsWith("data:")||av.startsWith("http")))
        return `<img src="${av}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;"/>`;
      // Emoji: anything that isn't a URL (handles ZWJ sequences like 👨‍🍳 which have length > 4)
      if(av && !av.startsWith("data:") && !av.startsWith("http") && av.length <= 12)
        return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#2d1b4e,#1a0d2e);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.52)}px;line-height:1;">${av}</div>`;
      if(u.photoURL)
        return `<img src="${u.photoURL}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;"/>`;
      return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.42)}px;font-weight:800;color:#fff;">${name[0]?.toUpperCase()||"?"}</div>`;
    };

    // ── Populate podium (top 3) ──────────────────────────────
    if(podiumEl){
      podiumEl.style.opacity = "1";
      podiumEl.style.display = top10.length ? "flex" : "none";
    }
    [1,2,3].forEach(pos => {
      const u = top10[pos-1];
      const avEl   = document.getElementById(`lb-p${pos}-av`);
      const nameEl = document.getElementById(`lb-p${pos}-name`);
      const xpEl   = document.getElementById(`lb-p${pos}-xp`);
      if(!u){
        if(avEl)   avEl.innerHTML = "?";
        if(nameEl) nameEl.textContent = "—";
        if(xpEl)   xpEl.textContent  = "";
        return;
      }
      const avatarSize = pos===1 ? 64 : 52;
      if(avEl)   avEl.innerHTML  = avHtml(u, avatarSize);
      if(nameEl) nameEl.textContent = "@"+(u.username||u.name||"?").slice(0,14);
      if(xpEl)   xpEl.textContent  = (u.xp||0)+" XP";
    });

    // ── List positions 4-10 ──────────────────────────────────
    if(listEl){
      const remaining = top10.slice(3);
      listEl.innerHTML = remaining.map((u, i) => {
        const pos = i+4;
        const isMe = currentUser?.uid === u.uid;
        const badge = topBadge(u);
        const level = calcLevel(u.xp||0);
        const username = "@"+(u.username||u.name||"Aluno").slice(0,18);
        const streak = u.streak||0;
        return `
          <div class="lb-item${isMe?" lb-item-me":""}">
            <div class="lb-item-pos">#${pos}</div>
            <div style="position:relative;flex-shrink:0;">
              <div class="lb-item-avatar">${avHtml(u, 38)}</div>
              <div style="position:absolute;bottom:-2px;right:-4px;font-size:12px;line-height:1;">${badge}</div>
            </div>
            <div class="lb-item-info">
              <div class="lb-item-name">${username}${isMe?' <span style="font-size:10px;background:rgba(201,147,58,0.2);border-radius:999px;padding:1px 6px;color:#e4b45c;font-weight:700;">você</span>':""}</div>
              <div class="lb-item-meta">
                <span>${u.xp||0} XP</span>
                <span class="lb-item-level">Nv ${level}</span>
                ${streak>0?`<span style="color:#f97316">🔥${streak}</span>`:""}
              </div>
            </div>
          </div>`;
      }).join("") || "";
    }

    // ── My real position (only shown if outside top 10) ──────
    if(currentUser){
      const myRealIdx = sorted.findIndex(u=>u.uid===currentUser.uid);
      const myRankEl = document.getElementById("lb-my-rank");
      if(myRankEl){
        if(myRealIdx === -1 || myRealIdx >= 10){
          myRankEl.style.display = "block";
          const displayPos = myRealIdx === -1 ? sorted.length+1 : myRealIdx+1;
          document.getElementById("lb-my-pos").textContent = `#${displayPos}`;
          const myAv = document.getElementById("lb-my-avatar");
          if(myAv) myAv.innerHTML = avHtml(userData||{}, 36);
          document.getElementById("lb-my-name").textContent = "@"+(userData?.username||userData?.name||"Aluno");
          document.getElementById("lb-my-xp").textContent = (userData?.xp||0)+" XP";
        } else {
          myRankEl.style.display = "none";
        }
      }
    }

    const sub = document.getElementById("lb-sheet-sub");
    if(sub) sub.textContent = `Top ${Math.min(sorted.length,10)} · ${t("leaderboard_"+(mode==="week"?"week":"all"))}`;

  }catch(e){
    if(listEl) listEl.innerHTML = `<div class="lb-loading">Erro ao carregar.</div>`;
    console.error("Leaderboard:", e);
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER UPDATE PROMPT
// ══════════════════════════════════════════════════════════════════════════════
function initSWUpdatePrompt(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.addEventListener("updatefound", () => {
      const newSW = reg.installing;
      newSW.addEventListener("statechange", () => {
        if(newSW.state === "installed" && navigator.serviceWorker.controller){
          showUpdatePrompt(newSW);
        }
      });
    });
  });
  // Checar atualização a cada 30 min
  setInterval(() => {
    navigator.serviceWorker.ready.then(reg => reg.update().catch(()=>{}));
  }, 30 * 60 * 1000);
}

function showUpdatePrompt(newSW){
  document.getElementById("update-prompt")?.remove();
  const banner = document.createElement("div");
  banner.id = "update-prompt";
  banner.style.cssText = `
    position:fixed;bottom:80px;left:16px;right:16px;z-index:9990;
    background:linear-gradient(135deg,#1e0f38,#2d1b4e);
    border:1px solid rgba(201,147,58,0.4);border-radius:16px;
    padding:14px 16px;display:flex;align-items:center;gap:12px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:slideUp .3s ease;
  `;
  banner.innerHTML = `
    <div style="font-size:24px">🚀</div>
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:800;color:#fff;">Nova versão disponível!</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);">Atualizar para continuar</div>
    </div>
    <button onclick="applyUpdate()" style="
      background:linear-gradient(135deg,#c9933a,#e4b45c);
      border:none;border-radius:10px;padding:8px 16px;
      color:#1a0d2e;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit;
    ">Atualizar</button>
    <button onclick="document.getElementById('update-prompt').remove()" style="
      background:none;border:none;color:rgba(255,255,255,0.3);font-size:18px;cursor:pointer;
    ">✕</button>
  `;
  document.body.appendChild(banner);
  window._pendingUpdateSW = newSW;
}

function applyUpdate(){
  if(window._pendingUpdateSW){
    window._pendingUpdateSW.postMessage({type:"SKIP_WAITING"});
    window.location.reload();
  }
}

async function forceRefresh(){
  const btn=document.getElementById("btn-force-refresh");
  if(btn){ btn.style.opacity="0.4"; btn.style.pointerEvents="none"; btn.textContent="⏳"; }
  try{
    // Delete all SW caches
    if("caches" in window){
      const keys=await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    // Unregister all service workers so they reinstall fresh
    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
  }catch(e){ vicLog("forceRefresh","cache/SW clear failed",e); }
  window.location.reload(true);
}

// ── MERCADO PAGO — verificar retorno ─────────────────────────────────────────
async function checkMercadoPagoReturn(){
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") || params.get("collection_status");
  const paymentId = params.get("payment_id") || params.get("collection_id");
  if(!status || !paymentId) return;
  window.history.replaceState({}, document.title, window.location.pathname);
  if(status === "approved"){
    localStorage.setItem("vic_pending_pro", JSON.stringify({paymentId, approvedAt: Date.now()}));
    if(currentUser?.uid) await activateProAfterPayment(paymentId);
  } else if(status === "pending" || status === "in_process"){
    setTimeout(()=>showXpToast("⏳ Pagamento em processamento!"), 1000);
  } else if(status === "failure" || status === "rejected"){
    setTimeout(()=>showXpToast("❌ Pagamento não aprovado. Tente novamente."), 1000);
  }
}

async function activateProAfterPayment(paymentId){
  if(!currentUser?.uid) return;
  try{
    await saveProgress(currentUser.uid,{plan:"pro",proActivatedAt:Date.now(),proPaymentId:paymentId});
    if(userData) userData.plan="pro";
    localStorage.removeItem("vic_pending_pro");
    setTimeout(()=>showProActivatedCelebration(), 500);
  }catch(e){ console.error("Erro ao ativar Pro:",e.message); }
}

function showProActivatedCelebration(){
  document.getElementById("pro-celebration-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "pro-celebration-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .3s ease;";
  overlay.innerHTML = `<div style="background:linear-gradient(135deg,#1a0d2e,#2d1b4e);border:2px solid #ffd700;border-radius:24px;padding:40px 32px;text-align:center;max-width:320px;width:90%;box-shadow:0 0 60px rgba(255,215,0,0.3);">
    <div style="font-size:64px;margin-bottom:16px;">🌟</div>
    <div style="font-size:24px;font-weight:800;color:#ffd700;margin-bottom:8px;">Você é PRO agora!</div>
    <div style="font-size:15px;color:#e0d0ff;margin-bottom:24px;line-height:1.5;">Acesso total desbloqueado!<br>Todos os segmentos são seus!</div>
    <button onclick="document.getElementById('pro-celebration-overlay').remove();renderDashboard();" style="background:linear-gradient(135deg,#ffd700,#ffaa00);color:#1a0d2e;border:none;border-radius:12px;padding:14px 32px;font-size:16px;font-weight:800;cursor:pointer;width:100%;">🚀 Começar agora!</button>
  </div>`;
  document.body.appendChild(overlay);
  SoundFX.complete();
}


function init(){
  _domReady = true;

  // ── Safari/iOS: AudioContext precisa ser resumido após interação ─────────────
  document.addEventListener("touchstart", ()=>{
    if(window.AudioContext || window.webkitAudioContext){
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if(ctx.state === "suspended") ctx.resume();
    }
  }, {once: true});

  // ── Aplicar idioma salvo ────────────────────────────────────────────────────
  applyLang();

  // ── Mercado Pago: verificar retorno de pagamento ────────────────────────────
  checkMercadoPagoReturn();

  // ── Email verification return ────────────────────────────────────────────────
  const _urlParams = new URLSearchParams(window.location.search);
  if (_urlParams.get("emailVerified") === "1") {
    window.history.replaceState({}, document.title, window.location.pathname);
    // Reload the current user so emailVerified flag is fresh
    reloadCurrentUser().catch(()=>{});
    // Toast shown after dashboard loads (handled in _handleAuth flow)
    window._showEmailVerifiedCelebration = true;
  }

  // ── Deep links ───────────────────────────────────────────────────────────────
  // app.viclanguage.com.br?seg=maritimo → abre direto no segmento
  // app.viclanguage.com.br?view=profile → abre perfil
  // app.viclanguage.com.br?ref=XXXXX → referral (já tratado)
  const _dlParams = new URLSearchParams(window.location.search);
  const _dlSeg  = _dlParams.get("seg");
  const _dlView = _dlParams.get("view");
  if(_dlSeg || _dlView){
    window._deepLink = { seg: _dlSeg, view: _dlView };
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // ── Safari/iOS: capturar resultado do redirect Google ───────────────────────
  if(typeof handleGoogleRedirectResult === "function"){
    handleGoogleRedirectResult().catch(()=>{});
  }

  // ── Routing inicial ──────────────────────────────────────────────────────────
  const onboardingDone = localStorage.getItem("vic_onboarding_done");
  if(!onboardingDone){
    // First time: show onboarding. _onboardingActive=true blocks all auth navigation.
    startOnboarding();
  } else {
    // Returning user: splash immediately, then auth drives the rest.
    showLoadingSplash(null, 0);
    if(_pendingAuthUser !== undefined) _handleAuth(_pendingAuthUser);
  }

  // auth buttons
  document.getElementById("tab-login").addEventListener("click",()=>switchTab("login"));
  document.getElementById("tab-register").addEventListener("click",()=>switchTab("register"));
  // Restore last email
  const lastEmail=localStorage.getItem("vic_last_email");
  const emailIn=document.getElementById("login-email");
  if(lastEmail&&emailIn) emailIn.value=lastEmail;

  document.getElementById("btn-login").addEventListener("click",handleLogin);
  document.getElementById("btn-register").addEventListener("click",handleRegister);
  document.getElementById("btn-google")?.addEventListener("click",handleGoogle);
  document.getElementById("btn-anon")?.addEventListener("click",handleAnon);
  document.getElementById("btn-forgot-password")?.addEventListener("click",async()=>{
    const email=document.getElementById("login-email").value.trim();
    if(!email) return showAuthError("Digite seu email no campo acima primeiro.");
    try{
      await resetPassword(email);
      showAuthError("✅ Email de redefinição enviado! Verifique sua caixa de entrada.");
    }catch(e){
      showAuthError(translateErr(e.code));
    }
  });
  document.getElementById("btn-logout").addEventListener("click",()=>{
    if(confirm("Tem certeza que quer sair? Você precisará fazer login novamente."))
      logoutUser();
  });
  ["login-email","login-password"].forEach(id=>document.getElementById(id)?.addEventListener("keydown",e=>{if(e.key==="Enter")handleLogin();}));

  initContactFloat();

  // admin
  initFeedback();
  loadAppConfig();

  // Admin main tabs
  document.querySelectorAll(".admin-main-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".admin-main-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      const panel=tab.dataset.panel;
      ["users","customize","feedback","push"].forEach(p=>{
        const el=document.getElementById(`admin-panel-${p}`);
        if(el) el.style.display=p===panel?"block":"none";
      });
      if(panel==="customize") initCustomizePanel();
      if(panel==="feedback") loadAdminFeedbacks();
    });
  });
  document.getElementById("btn-load-feedbacks")?.addEventListener("click",loadAdminFeedbacks);
  document.getElementById("btn-send-push")?.addEventListener("click",sendPushFromAdmin);
  document.getElementById("btn-about-us")?.addEventListener("click",()=>{
    document.getElementById("about-modal").style.display="flex";
  });

  // Admin float button for owner
  const adminFloatBtn=document.getElementById("btn-admin-float");
  if(adminFloatBtn&&currentUser?.uid===OWNER_UID){
    adminFloatBtn.style.display="flex";
    adminFloatBtn.onclick=()=>{ vibrate(30); showView("view-admin"); loadAdminPanel(); };
  }

  // XP card → show history popup
  document.getElementById("stat-xp-card")?.addEventListener("click",()=>showXPHistoryPopup());
  // Streak card → show calendar popup
  document.getElementById("stat-streak-card")?.addEventListener("click",()=>showStreakCalendarPopup());
  document.getElementById("btn-share-header")?.addEventListener("click",()=>{ vibrate(30); shareApp(); });
  startCuriosityTicker();
  requestNotificationPermission();
  scheduleNotifications();

  // FCM: mostrar notificação quando app está aberto (foreground)
  onForegroundMessage(payload => {
    const {title="VIC English 📚", body="Nova mensagem!"} = payload.notification || {};
    showXpToast(`🔔 ${title}: ${body}`);
    // Mostrar notificação nativa mesmo com app aberto
    if(Notification.permission==="granted"){
      try{
        new Notification(title, {
          body,
          icon: "logo_full_2.png",
          badge: "vic_lamp.png",
          tag: "vic-foreground-" + Date.now(),
        });
      }catch(e){ vicLog("fcm","foreground notification failed",e); }
    }
  });

  // Vibrate on all major buttons
  document.addEventListener("click",e=>{
    if(e.target.matches("button,a.settings-big-btn,.quick-btn,.phase-card,.segment-card,.daily-mission-item,.dlg-option,.tf-true,.tf-false,.btn-back,.fc-flip,.btn-start-now")){
      vibrate(25);
    }
  });

  document.getElementById("btn-send-contact")?.addEventListener("click",async()=>{
    const text=document.getElementById("contact-form-text")?.value.trim();
    if(!text) return;
    await saveFeedback({type:"contact",text});
    document.getElementById("contact-form-text").value="";
    showXpToast("📨 Mensagem enviada! Obrigado.");
  });
  document.querySelectorAll("#profile-feedback-stars .feedback-star").forEach(s=>{
    s.addEventListener("click",()=>{
      const v=parseInt(s.dataset.v);
      document.querySelectorAll("#profile-feedback-stars .feedback-star").forEach((st,i)=>st.classList.toggle("active",i<v));
      saveFeedback({type:"rating",value:v});showXpToast("⭐ Obrigado!");
    });
  });
  document.getElementById("btn-profile-like")?.addEventListener("click",()=>{saveFeedback({type:"like"});showXpToast("👍 Obrigado!");});
  document.getElementById("btn-profile-comment")?.addEventListener("click",()=>openFeedbackModal("💬 Comentário","comment"));
  document.getElementById("btn-profile-bug")?.addEventListener("click",()=>openFeedbackModal("🐛 Reportar bug","bug"));

  document.getElementById("toggle-notif")?.addEventListener("change",e=>{
    _setCfg("notifEnabled", e.target.checked?"1":"0");
    const freqRow=document.getElementById("notif-freq-row");
    if(freqRow) freqRow.style.display=e.target.checked?"flex":"none";
    if(e.target.checked) requestNotificationPermission();
  });
  document.getElementById("notif-freq")?.addEventListener("change",e=>{
    _setCfg("notifFreq", e.target.value);
  });
  // Restore notification settings
  const notifToggle=document.getElementById("toggle-notif");
  if(notifToggle&&_cfg.notifEnabled==="0"){
    notifToggle.checked=false;
    const fr=document.getElementById("notif-freq-row");
    if(fr) fr.style.display="none";
  }
  const notifFreqEl=document.getElementById("notif-freq");
  if(notifFreqEl&&_cfg.notifFreq) notifFreqEl.value=_cfg.notifFreq;
  document.getElementById("btn-modal-close")?.addEventListener("click",()=>document.getElementById("admin-modal").style.display="none");
  document.getElementById("admin-search")?.addEventListener("input",e=>{adminSearchTerm=e.target.value;renderAdminUsers();});
  document.getElementById("btn-admin-preview")?.addEventListener("click",enterPreviewMode);

  // ── Admin logout — voltar ao dashboard do owner ───────────────────────────
  document.getElementById("btn-admin-logout")?.addEventListener("click", () => {
    renderDashboard();
    showView("view-dashboard");
    showAdminReturnBtn();
  });
  document.getElementById("btn-admin-signout")?.addEventListener("click", () => {
    logoutUser();
  });
  // Também registrar o botão flutuante do admin
  document.getElementById("btn-admin-float")?.addEventListener("click", () => {
    loadAdminDashboard();
  });
  document.getElementById("btn-activate-pro")?.addEventListener("click",()=>activatePro(true));
  document.getElementById("btn-deactivate-pro")?.addEventListener("click",()=>activatePro(false));
  document.getElementById("btn-save-edit-admin")?.addEventListener("click",saveAdminEdit);
  document.getElementById("btn-reset-progress")?.addEventListener("click",resetUserProgress);
  document.getElementById("btn-delete-user")?.addEventListener("click",deleteUser);

  // diagnosis
  document.querySelectorAll(".diag-option").forEach(btn=>btn.addEventListener("click",()=>handleDiagOption(btn.dataset.value,btn.closest(".diag-step"))));
  document.getElementById("btn-confirm-segments")?.addEventListener("click", confirmSegments);
  document.getElementById("btn-confirm-difficulty")?.addEventListener("click", ()=>{
    if(_selectedDifficulties.length === 0) return;
    diagAnswers.difficulty = _selectedDifficulties.join(",");
    diagAnswers.difficulties = _selectedDifficulties;
    const stepEl = document.getElementById("diag-step-2");
    if(stepEl) stepEl.classList.remove("active");
    diagStep++; renderDiagProgress();
    const next = document.getElementById(`diag-step-${diagStep}`);
    if(next){ next.classList.add("active"); next.scrollIntoView({behavior:"smooth",block:"start"}); }
  });
  document.getElementById("btn-skip-segments")?.addEventListener("click", ()=>{ _selectedSegments=["maritimo"]; diagAnswers.segment="maritimo"; diagAnswers.segments=["maritimo"]; document.getElementById("diag-step-1")?.classList.remove("active"); diagStep=2; renderDiagProgress(); document.getElementById("diag-step-2")?.classList.add("active"); });
  document.getElementById("btn-finish-diag")?.addEventListener("click",finishDiagnosis);
  document.getElementById("btn-diag-voice")?.addEventListener("click",startDiagVoice);
  document.getElementById("btn-finish-diag-note")?.addEventListener("click",finishDiagnosisNote);
  document.getElementById("btn-skip-diag-note")?.addEventListener("click",finishDiagnosisNote);
  document.getElementById("btn-skip-level-test-diag")?.addEventListener("click",async()=>{diagAnswers.levelTestCompleted=false;await finishLevelTest();});

  // level test
  document.getElementById("btn-finish-level-test")?.addEventListener("click",finishLevelTest);
  document.getElementById("btn-skip-level-test")?.addEventListener("click",async()=>{diagAnswers.levelTestCompleted=false;await finishLevelTest();});

  // profile
  document.getElementById("btn-open-profile")?.addEventListener("click",openProfile);
  document.getElementById("btn-back-profile")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-edit-avatar")?.addEventListener("click",openAvatarPicker);
  document.getElementById("btn-close-avatar-picker")?.addEventListener("click",()=>document.getElementById("avatar-picker-modal").style.display="none");
  document.getElementById("avatar-file-input")?.addEventListener("change",e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{saveAvatar(ev.target.result);document.getElementById("avatar-picker-modal").style.display="none";};
    reader.readAsDataURL(file);
  });
  document.getElementById("btn-daily-complete-ok")?.addEventListener("click",()=>{
    document.getElementById("daily-complete-overlay")?.classList.remove("visible");
  });
  document.getElementById("btn-edit-name")?.addEventListener("click",()=>openEditModal("name",t("edit_name_title"),userData?.name||"","text"));
  document.getElementById("btn-edit-email")?.addEventListener("click",()=>openEditModal("email",t("edit_email_title"),userData?.email||"","email"));
  document.getElementById("btn-edit-password")?.addEventListener("click",()=>openEditModal("password",t("edit_pass_title"),"","password"));
  document.getElementById("btn-save-edit")?.addEventListener("click",saveEdit);
  document.getElementById("btn-cancel-edit")?.addEventListener("click",()=>document.getElementById("profile-edit-modal").style.display="none");
  document.getElementById("btn-share-app")?.addEventListener("click",shareAppPanel);
  document.getElementById("toggle-sounds")?.addEventListener("change",e=>applySounds(e.target.checked));
  document.getElementById("toggle-darkmode")?.addEventListener("change",e=>applyDarkMode(e.target.checked));
  document.querySelectorAll(".font-size-btn").forEach(btn=>btn.addEventListener("click",()=>applyFontSize(btn.dataset.size)));
  loadPreferences();

  // dashboard
  document.getElementById("btn-upgrade-dash")?.addEventListener("click",showUpgradeScreen);
  document.getElementById("btn-start-diag")?.addEventListener("click",()=>{
    document.getElementById("diag-invite-banner").style.display="none";
    startLevelTest();
  });
  document.getElementById("btn-skip-diag")?.addEventListener("click",async()=>{
    // mark as skipped so banner doesn't show again
    document.getElementById("diag-invite-banner").style.display="none";
    if(currentUser) await saveProgress(currentUser.uid,{diagnosisAnswers:{skipped:true}});
    userData.diagnosisAnswers={skipped:true};
  });
  // Writing
  document.getElementById("writing-core-banner")?.addEventListener("click",openWriting);
  // Prepare & Present
  document.getElementById("prepare-present-banner")?.addEventListener("click",openPreparePresent);
  document.getElementById("btn-back-writing")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-back-writing-ex")?.addEventListener("click",openWriting);
  document.getElementById("btn-next-writing")?.addEventListener("click",()=>startWritingTopic(writingTopicIndex+1));
  document.getElementById("btn-check-writing")?.addEventListener("click",checkWriting);

  // Speak writing text
  document.getElementById("btn-speak-writing")?.addEventListener("click",()=>{
    const text=document.getElementById("writing-textarea").value.trim();
    if(!text){showXpToast("✍️ Escreva algo primeiro!");return;}
    SoundFX.speakEN(text,0.85);
  });

  // Auto-translate PT→EN
  let translateTimer=null;
  document.getElementById("writing-textarea-pt")?.addEventListener("input",()=>{
    clearTimeout(translateTimer);
    const text=document.getElementById("writing-textarea-pt").value.trim();
    const watText=document.getElementById("wat-text");
    if(!text){if(watText)watText.textContent="—";return;}
    if(watText) watText.textContent="🔄 Traduzindo...";
    translateTimer=setTimeout(async()=>{
      try{
        const res=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pt|en`);
        const data=await res.json();
        const translation=data.responseData?.translatedText||"—";
        if(watText) watText.textContent=translation;
      }catch(e){if(watText)watText.textContent="Erro na tradução.";}
    },600);
  });

  // Use translation button
  document.getElementById("btn-use-translation")?.addEventListener("click",()=>{
    const translated=document.getElementById("wat-text")?.textContent;
    const ta=document.getElementById("writing-textarea");
    if(translated&&translated!=="—"&&translated!=="🔄 Traduzindo..."&&ta){
      ta.value=translated;
      const words=translated.trim().split(/\s+/).filter(w=>w).length;
      document.getElementById("writing-charcount").textContent=`${words} palavra${words!==1?"s":""}`;
    }
  });
  document.getElementById("writing-example-toggle")?.addEventListener("click",()=>{
    const ex=document.getElementById("writing-example");
    const tog=document.getElementById("writing-example-toggle");
    const visible=ex.style.display!=="none";
    ex.style.display=visible?"none":"block";
    tog.textContent=visible?"💡 Ver exemplo":"🔼 Ocultar exemplo";
  });
  document.getElementById("writing-textarea")?.addEventListener("input",()=>{
    const words=document.getElementById("writing-textarea").value.trim().split(/\s+/).filter(w=>w).length;
    document.getElementById("writing-charcount").textContent=`${words} palavra${words!==1?"s":""}`;
  });
  document.getElementById("btn-force-refresh")?.addEventListener("click", forceRefresh);

  async function hardReloadWithCacheClear(){
    vibrate(30);
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        for(const reg of regs) await reg.unregister();
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
    }catch(e){}
    setTimeout(()=>window.location.reload(true), 300);
  }
  document.getElementById("btn-reload-dashboard")?.addEventListener("click",()=>{
    showXpToast("🔄 Atualizando...");
    hardReloadWithCacheClear();
  });
  document.getElementById("btn-reload-auth")?.addEventListener("click",()=>{
    hardReloadWithCacheClear();
  });
  document.getElementById("btn-reload-onboarding")?.addEventListener("click",()=>{
    hardReloadWithCacheClear();
  });
  document.getElementById("btn-start-now")?.addEventListener("click",()=>{
    const hasMissions=(userData.completedMissions||[]).length>0;
    const hasCurrentMission=userData.currentMission?.missionId;
    if(hasMissions && hasCurrentMission){
      openSegmentPhases(currentSegmentId);
    } else if(userData.diagnosisAnswers?.segment){
      openSegmentPhases(userData.diagnosisAnswers.segment);
    }
  });
  document.getElementById("btn-goto-flashcards")?.addEventListener("click",openFlashcards);
  document.getElementById("btn-goto-memory")?.addEventListener("click",openMemoryFree);
  document.getElementById("btn-goto-truefalse")?.addEventListener("click",openTrueFalse);
  document.getElementById("btn-goto-dialogue")?.addEventListener("click",openDialogue);

  // true/false
  document.getElementById("btn-back-truefalse")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-back-tf-board")?.addEventListener("click",openTrueFalse);
  document.getElementById("btn-back-tf-result")?.addEventListener("click",openTrueFalse);
  document.getElementById("tf-true")?.addEventListener("click",()=>handleTFAnswer(true));
  document.getElementById("tf-false")?.addEventListener("click",()=>handleTFAnswer(false));
  document.getElementById("btn-tf-next")?.addEventListener("click",tfNext);
  document.getElementById("btn-tf-again")?.addEventListener("click",()=>startTrueFalse(tfCategory?.id));

  // dialogue
  document.getElementById("btn-back-dialogue")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-back-dlg-board")?.addEventListener("click",openDialogue);
  document.getElementById("btn-back-dlg-result")?.addEventListener("click",openDialogue);
  document.getElementById("btn-dlg-again")?.addEventListener("click",()=>startDialogue(dlgScenario?.id));

  // upgrade
  document.getElementById("btn-back-upgrade")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-back-upgrade-bottom")?.addEventListener("click",backToDashboard);
  // lb-sheet usa closeLeaderboard() diretamente
  document.getElementById("btn-leaderboard")?.addEventListener("click",openLeaderboard);
  const mpBtn=document.getElementById("btn-pay-mp"); if(mpBtn) mpBtn.href=MP_LINK;

  // phases
  document.getElementById("btn-back-phases")?.addEventListener("click",()=>{renderDashboard();showView("view-dashboard");});
  document.getElementById("btn-back-missions")?.addEventListener("click",()=>openSegmentPhases(currentSegmentId));

  // mission sound
  document.getElementById("phrase-sound-inline")?.addEventListener("click",speakPhraseCard);
  document.getElementById("phrase-sound-slow")?.addEventListener("click",speakPhraseCardSlow);
  document.getElementById("phrase-sound-pt")?.addEventListener("click",speakPhrasePT);
  document.getElementById("btn-listen")?.addEventListener("click",()=>speakPhrase(0.85));
  document.getElementById("btn-record")?.addEventListener("click",startRecording);
  document.getElementById("btn-stop")?.addEventListener("click",stopRecording);
  document.getElementById("btn-play-recording")?.addEventListener("click",playRecording);
  document.getElementById("btn-next")?.addEventListener("click",nextPhrase);
  document.getElementById("btn-back")?.addEventListener("click",()=>openMissionsList(currentSegmentId,currentPhaseId));
  document.getElementById("btn-back-complete")?.addEventListener("click",backToDashboard);

  // score
  document.getElementById("score-0")?.addEventListener("click",()=>submitScore(0));
  document.getElementById("score-5")?.addEventListener("click",()=>submitScore(5));
  document.getElementById("score-10")?.addEventListener("click",()=>submitScore(10));

  // exercises
  document.getElementById("btn-check-translate")?.addEventListener("click",checkTranslate);
  document.getElementById("btn-check-fill")?.addEventListener("click",checkFill);
  document.getElementById("btn-check-order")?.addEventListener("click",checkWordOrder);
  document.getElementById("translate-input")?.addEventListener("keydown",e=>{if(e.key==="Enter")checkTranslate();});
  // Next buttons (also wired dynamically via showNextBtn)
  document.getElementById("btn-next-exercise")?.addEventListener("click",()=>{});
  document.getElementById("btn-next-fill")?.addEventListener("click",()=>{});
  document.getElementById("btn-next-order")?.addEventListener("click",()=>{});

  // flashcards
  document.getElementById("btn-back-flashcards")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-back-fc-player")?.addEventListener("click",openFlashcards);
  document.getElementById("fc-right")?.addEventListener("click",fcRight);
  document.getElementById("fc-wrong")?.addEventListener("click",fcWrong);

  // memory
  document.getElementById("btn-back-memory")?.addEventListener("click",backToDashboard);
  document.getElementById("btn-back-mem-board")?.addEventListener("click",openMemoryFree);
}


// ══════════════════════════════════════════════════════════════════════════════
// WINDOW EXPORTS — funções chamadas via onclick no HTML
// app.js é type="module", então funções não são globais por padrão
// ══════════════════════════════════════════════════════════════════════════════
Object.assign(window, {
  // Diagnóstico
  confirmSegments, handleDiagOption, skipDiagnosis,
  // Onboarding
  obNext, obSkip,
  // Idioma
  setLang, applyLang,
  // Leaderboard
  openLeaderboard, closeLeaderboard, loadLeaderboard,
  // Admin
  refreshAdminUsers, exitPreviewMode, showPreviewUserPicker, enterPreviewMode,
  // Avatar
  selectRegAvatar, removeAvatar, switchAvatarTab, loadAvatarPicker,
  // Perfil
  showSkillDetail: window.showSkillDetail,
  showBadgeDetail: window.showBadgeDetail,
  // Update
  applyUpdate,
  // Misc
  switchModalTab: window.switchModalTab,
  backToDashboard, backToDashboard,
  showUpgradeScreen,
  openFlashcards, openMemoryFree, openTrueFalse, openDialogue,
  showReviewPanel, showReferralPanel,
  handleGoogle, handleLogin, handleRegister,
  // Preview
  sendPushFromAdmin,
});


// ── Expor funções globais (módulo ES6 não expõe automaticamente) ─────────────
if(typeof confirmSegments !== 'undefined') window.confirmSegments = confirmSegments;
if(typeof handleDiagOption !== 'undefined') window.handleDiagOption = handleDiagOption;
if(typeof skipDiagnosis !== 'undefined') window.skipDiagnosis = skipDiagnosis;
if(typeof obNext !== 'undefined') window.obNext = obNext;
if(typeof obSkip !== 'undefined') window.obSkip = obSkip;
if(typeof obBack !== 'undefined') window.obBack = obBack;
if(typeof showInstallOS !== 'undefined') window.showInstallOS = showInstallOS;
if(typeof toggleDailyBlock !== 'undefined') window.toggleDailyBlock = toggleDailyBlock;
if(typeof startOnboarding !== 'undefined') window.startOnboarding = startOnboarding;
if(typeof shareBadge !== 'undefined') window.shareBadge = shareBadge;
if(typeof openLeaderboard !== 'undefined') window.openLeaderboard = openLeaderboard;
if(typeof closeLeaderboard !== 'undefined') window.closeLeaderboard = closeLeaderboard;
if(typeof loadLeaderboard !== 'undefined') window.loadLeaderboard = loadLeaderboard;
if(typeof switchAvatarTab !== 'undefined') window.switchAvatarTab = switchAvatarTab;
if(typeof removeAvatar !== 'undefined') window.removeAvatar = removeAvatar;
if(typeof selectRegAvatar !== 'undefined') window.selectRegAvatar = selectRegAvatar;
if(typeof refreshAdminUsers !== 'undefined') window.refreshAdminUsers = refreshAdminUsers;
if(typeof enterPreviewMode !== 'undefined') window.enterPreviewMode = enterPreviewMode;
if(typeof exitPreviewMode !== 'undefined') window.exitPreviewMode = exitPreviewMode;
if(typeof showPreviewUserPicker !== 'undefined') window.showPreviewUserPicker = showPreviewUserPicker;
if(typeof exportAdminCSV !== 'undefined') window.exportAdminCSV = exportAdminCSV;
if(typeof applyUpdate !== 'undefined') window.applyUpdate = applyUpdate;
if(typeof forceRefresh !== 'undefined') window.forceRefresh = forceRefresh;
if(typeof showCommitmentTips !== 'undefined') window.showCommitmentTips = showCommitmentTips;
if(typeof showServiceDetail !== 'undefined') window.showServiceDetail = showServiceDetail;
if(typeof switchModalTab !== 'undefined') window.switchModalTab = switchModalTab;
if(typeof setLang !== 'undefined') window.setLang = setLang;
if(typeof applyLang !== 'undefined') window.applyLang = applyLang;
if(typeof flipCard !== 'undefined') window.flipCard = flipCard;
if(typeof speakFC !== 'undefined') window.speakFC = speakFC;
if(typeof speakFCPT !== 'undefined') window.speakFCPT = speakFCPT;
if(typeof speakFCSlow !== 'undefined') window.speakFCSlow = speakFCSlow;
if(typeof showReferralPanel !== 'undefined') window.showReferralPanel = showReferralPanel;
if(typeof showReviewPanel !== 'undefined') window.showReviewPanel = showReviewPanel;
if(typeof backToDashboard !== 'undefined') window.backToDashboard = backToDashboard;
if(typeof showView !== 'undefined') window.showView = showView;
if(typeof openGlossary !== 'undefined') window.openGlossary = openGlossary;
if(typeof closeGlossary !== 'undefined') window.closeGlossary = closeGlossary;
if(typeof toggleSegments !== 'undefined') window.toggleSegments = toggleSegments;
if(typeof toggleXpStats !== 'undefined') window.toggleXpStats = toggleXpStats;
if(typeof toggleDashSection !== 'undefined') window.toggleDashSection = toggleDashSection;

// ── Email verification screen handlers ────────────────────────────────────────
window.checkEmailVerified = async function(){
  const msg = document.getElementById("verify-msg");
  if(msg) msg.textContent = "Verificando...";
  try{
    const user = await reloadCurrentUser();
    if(user?.emailVerified){
      await _handleAuth(user);
    } else {
      if(msg) msg.textContent = "Email ainda não verificado. Confira sua caixa de entrada.";
    }
  }catch(e){ if(msg) msg.textContent = "Erro ao verificar. Tente novamente."; }
};

window.resendVerifyEmail = async function(){
  const msg = document.getElementById("verify-msg");
  try{
    await resendVerificationEmail();
    if(msg) msg.textContent = "✅ Email reenviado! Confira sua caixa de entrada.";
  }catch(e){ if(msg) msg.textContent = "Erro ao reenviar. Tente em alguns minutos."; }
};

window.backToAuthFromVerify = function(){
  logoutUser().catch(()=>{});
  showView("view-auth");
};

document.addEventListener("DOMContentLoaded",init);
