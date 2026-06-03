// app.js — VIC English v12 — Full fix

import { auth, registerUser, loginUser, loginWithGoogle, loginAnonymous, logoutUser, onAuthChange, getUserData, saveProgress, getAllUsers, getUserById, OWNER_UID } from "./firebase.js";

// Capture auth state before DOM ready
let _pendingAuthUser = undefined;
let _domReady = false;
onAuthChange(user => {
  _pendingAuthUser = user;
  if (_domReady) _handleAuth(user);
});

// ── STATE ──────────────────────────────────────────────────────────────────────
let currentUser=null, userData=null;
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
const calcLevel   = xp     => Math.floor(xp/100)+1;
const stripEmoji  = s      => (s||"").replace(/[\u{1F300}-\u{1FFFF}]/gu,'').replace(/[\u2600-\u27FF]/gu,'').replace(/[#*0-9]\uFE0F?\u20E3/gu,'').replace(/\s+/g,' ').trim();
const cleanEnunciado = t   => stripEmoji(t||"");

// Shuffle array (Fisher-Yates)
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

const LEVEL_TIPS = {
  1: [
    "Próximo passo: complete exercícios de vocabulário para construir sua base.",
    "Chegou a hora de explorar seu primeiro segmento. Escolha o do seu trabalho!",
    "Dica: leia as frases em voz alta — ajuda muito na fixação.",
    "Vamos treinar vocabulário? Cada palavra nova abre uma porta.",
  ],
  2: [
    "Próximo passo: pratique os diálogos do seu segmento para ganhar fluência.",
    "Chegou a hora de treinar Listening — ouça as frases e tente entender sem tradução.",
    "Experimente os exercícios de Speaking para melhorar sua pronúncia.",
    "Vamos treinar tradução? Conecta PT e EN de forma natural.",
    "Dica: repetição é tudo. Refaça as missões que errou.",
  ],
  3: [
    "Próximo passo: foque em pronúncia — use o microfone nos exercícios.",
    "Chegou a hora de explorar um novo segmento profissional.",
    "Vamos treinar Writing? Escrever em inglês fixa o vocabulário 3x mais rápido.",
    "Experimente os exercícios de Speaking com situações reais do seu trabalho.",
    "Dica: pratique os diálogos completos — é o mais próximo da realidade.",
  ],
  4: [
    "Próximo passo: domine um novo segmento profissional.",
    "Chegou a hora de testar seus limites — tente as missões mais avançadas.",
    "Vamos treinar os Phrasal Verbs? São essenciais para soar fluente.",
    "Experimente o Grammar Core — consolida tudo que você já aprendeu.",
  ],
};
function getRandomTip(level){
  const tips = LEVEL_TIPS[Math.min(level,4)] || LEVEL_TIPS[4];
  return tips[Math.floor(Math.random()*tips.length)];
}
function levelInfo(xp){
  const l=calcLevel(xp);
  if(l<=2) return {label:"Iniciante 🌱", msg:getRandomTip(1)};
  if(l<=5) return {label:"Básico 📘",    msg:getRandomTip(2)};
  if(l<=9) return {label:"Intermediário ⭐", msg:getRandomTip(3)};
  return         {label:"Avançado 🏆",   msg:getRandomTip(4)};
}

let _lastView = null;
function showView(id){
  const next=document.getElementById(id);
  if(!next) return;

  const current=document.querySelector(".view.active");
  if(current===next) return;

  // Determine direction
  const views=["view-auth","view-dashboard","view-phases","view-missions-list","view-mission","view-complete","view-flashcards","view-memory-free","view-truefalse","view-dialogue","view-writing","view-profile","view-upgrade","view-admin","view-diagnosis","view-leveltest"];
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
const MP_LINK="https://mpago.la/279pigb";
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
  const last=userData.lastLoginDate||"";
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  let streak=userData.streak||0;
  if(last===today) return;
  // Save yesterday's XP before resetting
  if(last===yesterday){
    streak=streak+1;
    userData.xpYesterday=userData.xpToday||0;
  } else {
    streak=1;
    userData.xpYesterday=0;
  }
  userData.xpToday=0;
  userData.streak=streak;
  userData.lastLoginDate=today;
  await saveProgress(currentUser.uid,{streak,lastLoginDate:today,xpYesterday:userData.xpYesterday,xpToday:0});
}

// ── GREETING ──────────────────────────────────────────────────────────────────
const GREETINGS = ["Hello","Hi","Hey","Hi there","What's up","How's it going","How are you","Good to see you","Welcome back","Great to have you here"];

function buildGreeting(name){
  const h=new Date().getHours();
  const timeEN=h<12?"Good morning":h<18?"Good afternoon":"Good evening";
  const timePT=h<12?"Bom dia":h<18?"Boa tarde":"Boa noite";
  const mots=[
    {en:"Let's get this!",       pt:"Vamos nessa!"},
    {en:"You got this!",         pt:"Você consegue!"},
    {en:"Every word counts!",    pt:"Cada palavra conta!"},
    {en:"Hope things are well!", pt:"Espero que esteja bem!"},
    {en:"One step at a time!",   pt:"Um passo de cada vez!"},
    {en:"Keep going strong!",    pt:"Continue firme!"},
  ];
  const mot=mots[Math.floor(Math.random()*mots.length)];
  const el=id=>document.getElementById(id);
  const greet=GREETINGS[Math.floor(Math.random()*GREETINGS.length)];
  if(el("greeting-hi"))  el("greeting-hi").textContent=`${greet}, ${name}! 👋`;
  if(el("greeting-time-en")) el("greeting-time-en").textContent=`${timeEN} — ${mot.en}`;
  if(el("greeting-time-pt")) el("greeting-time-pt").textContent=`${timePT} — ${mot.pt}`;
  if(el("greeting-motivational")) el("greeting-motivational").style.display="none";
}

function buildDate(){
  const d=new Date();
  const day=d.getDate();
  const suffix=day===1||day===21||day===31?"st":day===2||day===22?"nd":day===3||day===23?"rd":"th";
  const weekday=d.toLocaleDateString("en-US",{weekday:"long"});
  const month=d.toLocaleDateString("en-US",{month:"long"});
  const el=document.getElementById("dash-date");
  if(el) el.innerHTML=`<div class="dash-date-weekday">${weekday}</div><div class="dash-date-day">${month} ${day}${suffix}</div>`;
}

// ── DAILY MISSIONS ─────────────────────────────────────────────────────────────
const DAILY_DEF=[
  {id:"dm1",icon:"🎤",en:"Complete 3 exercises",   pt:"Complete 3 exercícios", target:3, key:"dailyExercises",xp:30,segmentId:"maritimo",  phaseId:"f1"},
  {id:"dm2",icon:"🌟",en:"Score perfect twice",     pt:"Acerte 2 com nota 10", target:2, key:"dailyPerfect",  xp:20,segmentId:"maritimo",  phaseId:"f2"},
  {id:"dm3",icon:"⚓",en:"Train 1 maritime lesson", pt:"1 lição marítima",     target:1, key:"dailyMaritime", xp:15,segmentId:"maritimo",  phaseId:"f1"},
];
function getTodayKey(){ return new Date().toISOString().slice(0,10); }
function getDailyProgress(){
  const today=getTodayKey();
  const saved=userData.dailyProgress||{};
  // Only reset if it's a new day
  if(saved.date!==today){
    // Keep missions if not completed yesterday (they persist)
    const prevComplete=saved.allComplete||false;
    if(prevComplete){
      // Yesterday was completed — fresh start
      return {date:today,dailyExercises:0,dailyPerfect:0,dailyMaritime:0,allComplete:false};
    } else {
      // Yesterday not completed — carry over progress but update date
      return {date:today,dailyExercises:saved.dailyExercises||0,dailyPerfect:saved.dailyPerfect||0,dailyMaritime:saved.dailyMaritime||0,allComplete:false};
    }
  }
  return saved;
}
async function updateDailyProgress(type){
  const dp=getDailyProgress();
  if(type==="exercise") dp.dailyExercises=Math.min((dp.dailyExercises||0)+1,99);
  if(type==="perfect")  dp.dailyPerfect  =Math.min((dp.dailyPerfect||0)+1,  99);
  if(type==="maritime") dp.dailyMaritime =Math.min((dp.dailyMaritime||0)+1,  99);

  // Check if ALL missions newly completed
  const wasComplete=dp.allComplete||false;
  const allDone=DAILY_DEF.every(dm=>(dp[dm.key]||0)>=(dm.target));
  if(allDone&&!wasComplete){
    dp.allComplete=true;
    const bonusXP=DAILY_DEF.reduce((a,dm)=>a+dm.xp,0);
    userData.xp=(userData.xp||0)+bonusXP;
    await saveProgress(currentUser.uid,{xp:userData.xp,dailyProgress:dp});
    userData.dailyProgress=dp;
    showDailyComplete(bonusXP);
  } else {
    userData.dailyProgress=dp;
    await saveProgress(currentUser.uid,{dailyProgress:dp});
  }
  renderDailyMissions();
}

function showDailyComplete(bonusXP){
  const overlay=document.getElementById("daily-complete-overlay");
  const xpEl=document.getElementById("daily-complete-xp");
  if(!overlay) return;
  if(xpEl) xpEl.textContent=`+${bonusXP} XP Bônus 🎁`;
  overlay.style.display="flex";
  SoundFX.complete();
}
function renderDailyMissions(){
  const dp=getDailyProgress();
  const container=document.getElementById("daily-missions-list"); if(!container) return;
  container.innerHTML="";
  let totalDone=0,totalTarget=0;
  DAILY_DEF.forEach(dm=>{
    const current=dp[dm.key]||0, done=current>=dm.target;
    totalDone+=Math.min(current,dm.target); totalTarget+=dm.target;
    const pct=Math.min(Math.round((current/dm.target)*100),100);
    const div=document.createElement("div");
    div.className=`daily-mission-item${done?" completed":""}`;
    div.innerHTML=`<span class="dmi-icon">${dm.icon}</span><div class="dmi-text"><div class="dmi-title">${dm.en}</div><div class="dmi-sub">${dm.pt}</div><div class="dmi-bar-wrap"><div class="dmi-bar" style="width:${pct}%"></div></div><div class="dmi-count">${current}/${dm.target}</div></div><span class="dmi-xp">${done?"✅":"+"+dm.xp+" XP"}</span>`;
    div.addEventListener("click",()=>{
      if(done) return; // already completed
      // Go to the segment phases so person can choose mission
      currentSegmentId=dm.segmentId||"maritimo";
      if(dm.phaseId) currentPhaseId=dm.phaseId;
      openSegmentPhases(dm.segmentId||"maritimo");
    });
    container.appendChild(div);
  });
  const overall=Math.round((totalDone/totalTarget)*100);
  const ob=document.getElementById("daily-overall-bar"), ot=document.getElementById("daily-overall-pct");
  if(ob) ob.style.width=`${overall}%`;
  if(ot) ot.textContent=`${overall}% done today`;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function handleRegister(){
  const name=document.getElementById("reg-name").value.trim();
  const email=document.getElementById("reg-email").value.trim();
  const pw=document.getElementById("reg-password").value;
  const btn=document.getElementById("btn-register");
  if(!name||!email||!pw) return showAuthError("Preencha todos os campos.");
  if(pw.length<6) return showAuthError("Senha mínimo 6 caracteres.");
  btn.disabled=true; btn.textContent="Criando...";
  try{await registerUser(email,pw,name);}
  catch(e){showAuthError(translateErr(e.code));btn.disabled=false;btn.textContent="Criar Conta";}
}
const LOADING_QUOTES=[
  {en:"Your next job opportunity is waiting for you.",pt:"Sua próxima oportunidade de emprego está te aguardando."},
  {en:"Your future self will thank you for this.",pt:"Seu eu do futuro vai te agradecer por isso."},
  {en:"Every word you learn is a door that opens.",pt:"Cada palavra que você aprende é uma porta que se abre."},
  {en:"The only source of knowledge is experience. — Einstein",pt:"A única fonte de conhecimento é a experiência. — Einstein"},
  {en:"Imagination is more important than knowledge. — Einstein",pt:"Imaginação é mais importante que conhecimento. — Einstein"},
  {en:"All our dreams can come true, if we have the courage. — Walt Disney",pt:"Todos os nossos sonhos podem se tornar realidade, se tivermos coragem. — Disney"},
  {en:"It is our choices that show what we truly are. — Dumbledore",pt:"São nossas escolhas que revelam o que realmente somos. — Dumbledore"},
  {en:"Happiness can be found even in the darkest of times. — Dumbledore",pt:"A felicidade pode ser encontrada mesmo nos momentos mais sombrios. — Dumbledore"},
  {en:"Do or do not. There is no try. — Yoda",pt:"Fazer ou não fazer. Tentar não existe. — Yoda"},
  {en:"To infinity and beyond! — Buzz Lightyear",pt:"Para o infinito e além! — Buzz Lightyear"},
  {en:"With great power comes great responsibility. — Uncle Ben",pt:"Com grandes poderes vêm grandes responsabilidades. — Tio Ben"},
  {en:"May the Force be with you. — Star Wars",pt:"Que a Força esteja com você. — Star Wars"},
  {en:"Why so serious? — The Joker",pt:"Por que tão sério? — O Coringa"},
  {en:"English is not just a language. It's your competitive advantage.",pt:"Inglês não é só um idioma. É sua vantagem competitiva."},
  {en:"In Santos, the world passes through the port. Speak their language.",pt:"Em Santos, o mundo passa pelo porto. Fale a língua deles."},
  {en:"Fluency is not a destination. It's a daily habit.",pt:"Fluência não é um destino. É um hábito diário."},
  {en:"The secret of change: focus all energy on building the new. — Socrates",pt:"O segredo da mudança: foque toda energia em construir o novo. — Sócrates"},
  {en:"Just keep swimming. — Dory",pt:"Continue nadando. — Dory"},
  {en:"You don't need to be great to start, but you need to start to be great.",pt:"Você não precisa ser ótimo para começar, mas precisa começar para ser ótimo."},
];

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
  const reset=()=>{btn.disabled=false;btn.textContent="Entrar com Google";hideAuthLoading();};
  btn.disabled=true; btn.textContent="Aguarde...";
  showAuthLoading("Preparando tudo para você! ⭐");
  const t=setTimeout(()=>{hideAuthLoading();reset();showAuthError("Tente novamente.");},5000);
  try{await loginWithGoogle();clearTimeout(t);}
  catch(e){clearTimeout(t);hideAuthLoading();showAuthError("Erro no login Google.");reset();}
}
async function handleAnon(){
  const btn=document.getElementById("btn-anon");
  const reset=()=>{btn.disabled=false;btn.textContent="👤 Entrar sem cadastro";hideAuthLoading();};
  btn.disabled=true; btn.textContent="Entrando...";
  showAuthLoading("Pronto para evoluir? Vamos lá! 💪");
  const t=setTimeout(()=>{hideAuthLoading();reset();showAuthError("Tente novamente.");},5000);
  try{await loginAnonymous();clearTimeout(t);}
  catch(e){clearTimeout(t);hideAuthLoading();showAuthError("Erro.");reset();}
}
function showAuthError(msg){const e=document.getElementById("auth-error");e.textContent=msg;e.style.display="block";setTimeout(()=>e.style.display="none",4000);}
function translateErr(c){return{"auth/email-already-in-use":"Email já cadastrado.","auth/invalid-email":"Email inválido.","auth/weak-password":"Senha muito fraca.","auth/user-not-found":"Usuário não encontrado.","auth/wrong-password":"Senha incorreta.","auth/invalid-credential":"Email ou senha incorretos.","auth/too-many-requests":"Muitas tentativas."}[c]||"Erro. Tente novamente.";}
function switchTab(t){document.querySelectorAll(".auth-tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".auth-form").forEach(x=>x.classList.remove("active"));document.getElementById(`tab-${t}`).classList.add("active");document.getElementById(`form-${t}`).classList.add("active");document.getElementById("auth-error").style.display="none";}

// ── DIAGNOSIS ─────────────────────────────────────────────────────────────────
function startDiagnosis(){
  diagStep=0; diagAnswers={};
  document.querySelectorAll(".diag-step").forEach(s=>s.classList.remove("active"));
  document.getElementById("diag-step-0")?.classList.add("active");
  renderDiagProgress(); showView("view-diagnosis");
}
function renderDiagProgress(){
  const c=document.getElementById("diag-progress"); if(!c) return; c.innerHTML="";
  const total=4; // 3 questions + 1 note
  for(let i=0;i<total;i++){const d=document.createElement("div");d.className=`diag-dot ${i<diagStep?"done":""}`;c.appendChild(d);}
}
function handleDiagOption(val,stepEl){
  stepEl.querySelectorAll(".diag-option").forEach(b=>b.classList.remove("selected"));
  [...stepEl.querySelectorAll(".diag-option")].find(b=>b.dataset.value===val)?.classList.add("selected");
  const keys=["goal","difficulty","segment"];
  diagAnswers[keys[diagStep]]=val;
  setTimeout(()=>{
    stepEl.classList.remove("active"); diagStep++; renderDiagProgress();
    if(diagStep<DIAG_STEPS) document.getElementById(`diag-step-${diagStep}`)?.classList.add("active");
    else document.getElementById("diag-step-3")?.classList.add("active"); // personal note
  },350);
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
  diagAnswers.segment&&getSegment(diagAnswers.segment)&&(currentSegmentId=diagAnswers.segment);
  diagStep++; renderDiagProgress();
  document.getElementById("diag-step-3")?.classList.remove("active");
  document.getElementById("diag-result-level").textContent="Perfil criado! 🎉";
  document.getElementById("diag-result-sub").textContent=`Objetivo: ${diagAnswers.goal||"—"} • Área: ${diagAnswers.segment||"—"}`;
  document.getElementById("diag-step-result")?.classList.add("active");
}
async function finishDiagnosis(){
  if(currentUser){
    await saveProgress(currentUser.uid,{diagnosisAnswers:diagAnswers,currentMission:{segmentId:currentSegmentId,phaseId:"f1",missionId:getSegment(currentSegmentId)?.phases[0]?.missions[0]?.id||"",phraseIndex:0}});
    userData.diagnosisAnswers=diagAnswers;
  }
  startLevelTest();
}

// ── LEVEL TEST ─────────────────────────────────────────────────────────────────
const LEVEL_TEST_Q=[
  {id:"lt1",type:"multiple_choice",title:"Grammar — Present Simple",
   question:"She ___ to work every day by bus.",
   options:["goes","go","going","went"],correct:0,pts:{0:2,1:0,2:0,3:0}},
  {id:"lt2",type:"fill_blank",title:"Structure — Questions",
   question:"___ you like coffee in the morning?",
   placeholder:"Do or Does?",answer:"Do",pts:{correct:2,almost:1,wrong:0}},
  {id:"lt3",type:"multiple_choice",title:"Vocabulary — Daily Life",
   question:"A 'schedule' is best described as:",
   options:["A plan with times and dates","A type of food","A vehicle","A country"],correct:0,pts:{0:2,1:0,2:0,3:0}},
  {id:"lt4",type:"word_order",title:"Sentence Structure",
   question:"Put the words in the correct order:",
   scrambled:["She","has","never","visited","another","country."],
   answer:"She has never visited another country.",pts:{correct:3,almost:1,wrong:0}},
  {id:"lt5",type:"multiple_choice",title:"Grammar — Modal Verbs",
   question:"You ___ wear a seatbelt in a car. It's the law.",
   options:["must","can","may","would"],correct:0,pts:{0:2,1:0,2:0,3:0}},
  {id:"lt6",type:"fill_blank",title:"Grammar — Present Perfect",
   question:"I have already ___ my homework. (finish)",
   placeholder:"Past participle of finish...",answer:"finished",pts:{correct:3,almost:1,wrong:0}},
  {id:"lt7",type:"reading",title:"Reading Comprehension",
   question:'Read and answer:\n\n"Maria woke up late and missed her bus. She called a taxi but it took twenty minutes to arrive. When she finally got to the office, her manager was waiting at the door."\n\nWhy was Maria late to the office?',
   options:["She missed her bus and the taxi was slow","She forgot to set her alarm","The office was far away","Her manager called her"],correct:0,pts:{0:3,1:0,2:0,3:0}},
  {id:"lt8",type:"multiple_choice",title:"Grammar — Past Simple",
   question:"Last night I ___ a great movie with my friends.",
   options:["watched","watch","watching","have watched"],correct:0,pts:{0:2,1:0,2:0,3:0}},
];

function startLevelTest(){
  ltIndex=0; ltScore=0;
  document.getElementById("lt-result").style.display="none";
  document.getElementById("lt-questions-area").style.display="block";
  showView("view-level-test");
  renderLTQuestion();
}
function renderLTQuestion(){
  const q=LEVEL_TEST_Q[ltIndex], total=LEVEL_TEST_Q.length;
  document.getElementById("lt-counter").textContent=`${ltIndex+1} / ${total}`;
  document.getElementById("lt-progress-bar").style.width=`${Math.round((ltIndex/total)*100)}%`;
  document.getElementById("lt-title").textContent=q.title;
  document.getElementById("lt-question").textContent=q.question;
  document.getElementById("lt-feedback").style.display="none";
  ["lt-mc","lt-fill","lt-order"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});

  if(q.type==="multiple_choice"||q.type==="reading"){
    // randomize options
    const indices=[0,1,2,3];
    const shuffled=shuffle(indices);
    const newCorrect=shuffled.indexOf(q.correct);
    const newOptions=shuffled.map(i=>q.options[i]);
    const wrap=document.getElementById("lt-mc"); wrap.innerHTML=""; wrap.style.display="flex";
    newOptions.forEach((opt,i)=>{
      const btn=document.createElement("button"); btn.className="lt-option"; btn.textContent=opt;
      btn.addEventListener("click",()=>{
        wrap.querySelectorAll(".lt-option").forEach((b,j)=>{b.disabled=true;if(j===newCorrect)b.classList.add("correct");else if(j===i&&i!==newCorrect)b.classList.add("wrong");});
        const pts=i===newCorrect?q.pts[0]:0; ltScore+=pts;
        showLTFeedback(i===newCorrect?"correct":"tryagain",newOptions[newCorrect],pts);
      });
      wrap.appendChild(btn);
    });
  }
  if(q.type==="fill_blank"){
    const inp=document.getElementById("lt-fill-input"); inp.value=""; inp.disabled=false; inp.placeholder=q.placeholder||"";
    document.getElementById("lt-fill").style.display="block";
    document.getElementById("lt-fill-check").onclick=()=>{
      if(inp.disabled) return;
      const res=avaliarResposta(inp.value.trim(),q.answer);
      const pts=res.feedback==="correct"?q.pts.correct:res.feedback==="almost"?q.pts.almost:q.pts.wrong;
      ltScore+=pts; inp.disabled=true;
      showLTFeedback(res.feedback,q.answer,pts);
    };
    inp.onkeydown=e=>{if(e.key==="Enter")document.getElementById("lt-fill-check").click();};
    setTimeout(()=>inp.focus(),100);
  }
  if(q.type==="word_order"){
    const wrap=document.getElementById("lt-order"); wrap.style.display="block";
    const zone=document.getElementById("lt-order-zone"); zone.innerHTML="";
    const bank=document.getElementById("lt-order-bank"); bank.innerHTML="";
    let placed=[];
    shuffle(q.scrambled).forEach(w=>{
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
      const pts=res.feedback==="correct"?q.pts.correct:res.feedback==="almost"?q.pts.almost:q.pts.wrong;
      ltScore+=pts; showLTFeedback(res.feedback,q.answer,pts);
    };
  }
}
function showLTFeedback(feedback,correct,pts){
  const fb=document.getElementById("lt-feedback");
  if(feedback==="correct"){fb.className="lt-feedback correct";fb.innerHTML=`✅ Correto! <strong>+${pts} pts</strong>`;SoundFX.correct();}
  else if(feedback==="almost"){fb.className="lt-feedback almost";fb.innerHTML=`👍 Quase! <strong>${correct}</strong> +${pts} pts`;SoundFX.almost();}
  else{fb.className="lt-feedback wrong";fb.innerHTML=`✅ Correto: <strong>${correct}</strong>`;SoundFX.wrong();}
  fb.style.display="block";
  setTimeout(()=>{ltIndex++;if(ltIndex<LEVEL_TEST_Q.length)renderLTQuestion();else showLTResult();},1400);
}
function showLTResult(){
  const maxPts=LEVEL_TEST_Q.reduce((a,q)=>a+Math.max(...Object.values(q.pts)),0);
  const pct=Math.round((ltScore/maxPts)*100);
  let level,label,msg;
  if(pct<=30){level="a1";label="A1 — Iniciante 🌱";msg="Vamos começar do início com calma!";}
  else if(pct<=50){level="a2";label="A2 — Básico 📘";msg="Você tem uma base. Vamos fortalecer!";}
  else if(pct<=72){level="b1";label="B1 — Intermediário ⭐";msg="Bom nível! Foco em fluência profissional.";}
  else{level="b2";label="B2 — Avançado 🏆";msg="Excelente! Refinando comunicação profissional.";}
  diagAnswers.level=level;
  document.getElementById("lt-questions-area").style.display="none";
  document.getElementById("lt-result").style.display="block";
  document.getElementById("lt-result-score").textContent=`${ltScore} / ${maxPts} pts`;
  document.getElementById("lt-result-pct").textContent=`${pct}%`;
  document.getElementById("lt-result-level").textContent=label;
  document.getElementById("lt-result-msg").textContent=msg;
  document.getElementById("lt-result-bar").style.width=`${pct}%`;
  SoundFX.complete();
}
async function finishLevelTest(){
  if(currentUser){
    await saveProgress(currentUser.uid,{diagnosisAnswers:diagAnswers,detectedLevel:diagAnswers.level,currentMission:{segmentId:currentSegmentId,phaseId:"f1",missionId:getSegment(currentSegmentId)?.phases[0]?.missions[0]?.id||"",phraseIndex:0}});
    userData.diagnosisAnswers=diagAnswers; userData.detectedLevel=diagAnswers.level;
  }
  renderDashboard(); showView("view-dashboard");
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard(user){
  console.log("loadDashboard start:", user.uid);
  currentUser=user;
  try{
    console.log("Getting user data...");
    userData=await getUserData(user.uid);
    console.log("userData:", userData?"found":"null");
    if(!userData){
      console.log("Creating new user doc...");
      const name=user.displayName||user.email?.split("@")[0]||"Aluno";
      await saveProgress(user.uid,{
        name, email:user.email||"", xp:0, level:1, streak:0,
        completedMissions:[], plan:"free",
      });
      userData=await getUserData(user.uid);
      console.log("userData after create:", userData?"found":"still null");
    }
    if(!userData){
      userData={uid:user.uid,name:user.displayName||"Aluno",xp:0,streak:0,completedMissions:[],plan:"free"};
    }
    await updateStreak();
    if(userData.currentMission){
      currentSegmentId  =userData.currentMission.segmentId  ||"maritimo";
      currentPhaseId    =userData.currentMission.phaseId    ||"f1";
      currentMissionId  =userData.currentMission.missionId  ||"vocab_basico";
      currentPhraseIndex=userData.currentMission.phraseIndex||0;
    }
    renderDashboard();
    showView("view-dashboard");
    // Show diagnosis to new users (no diagnosisAnswers yet)
    if(!userData.diagnosisAnswers){
      setTimeout(()=>startDiagnosis(),800);
    }
    console.log("Dashboard shown!");
  }catch(e){
    console.error("loadDashboard error:",e.message, e);
    if(!userData) userData={uid:user.uid,name:"Aluno",xp:0,streak:0,completedMissions:[],plan:"free"};
    renderDashboard();
    showView("view-dashboard");
  }
}

const PRO_MESSAGES=[
  {title:"🚀 Acelere seu inglês",        sub:"Só R$ 15/mês — menos que um café por dia!"},
  {title:"💼 Para sua carreira",         sub:"Todo conteúdo profissional por apenas R$ 15"},
  {title:"⭐ Plano PRO — R$ 15/mês",     sub:"Acesso total. Cancela quando quiser."},
  {title:"🔓 Desbloqueie tudo agora",    sub:"Menos que 1 aula particular. Vale muito mais!"},
  {title:"🌍 Inglês sem limites",        sub:"R$ 15/mês — menos de R$ 0,50 por dia 🤯"},
  {title:"📈 Invista na sua carreira",   sub:"Por só R$ 15 você acessa tudo. Faz sentido!"},
];
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
  // False friends
  "🇧🇷 'Actually' não significa 'atualmente' — significa 'na verdade'. Um dos erros mais comuns dos brasileiros!",
  "🇧🇷 'Library' não é livraria — é biblioteca! Livraria em inglês é 'bookstore'.",
  "🇧🇷 'Parents' não são parentes — são seus pais! Parentes são 'relatives'.",
  "🇧🇷 'Push' não é puxar — é empurrar! E 'pull' é puxar. Olha nas portas!",
  // Homophones
  "👂 'There', 'their' e 'they're' soam idênticos — mas significam: lá / deles / eles são.",
  "👂 'To', 'too' e 'two' soam igual — preposição, também, e o número 2.",
  "👂 'Hear' e 'here' soam iguais — ouvir e aqui. Preste atenção no contexto!",
  "👂 'Read' no presente soa /riid/ — no passado, /rɛd/. Mesma escrita, sons diferentes!",
  // Origem germânica
  "🏰 O inglês é uma língua germânica — veio dos Anglos e Saxões que invadiram a Grã-Bretanha no séc. V.",
  "🌲 Palavras do dia a dia como 'water', 'house', 'father', 'mother' vêm do germânico antigo.",
  "⚔️ Após a conquista normanda (1066), o inglês absorveu o francês — por isso tem tantas palavras latinas também.",
  "🌳 O inglês está na mesma família linguística do alemão e do holandês — irmãos linguísticos!",
  "📜 O inglês antigo (Old English) de 1.000 anos atrás é tão diferente que parece outro idioma.",
  // Tipo de língua
  "🔤 O inglês é uma língua analítica — usa poucas terminações verbais. 'I go, you go, he goes' — quase igual!",
  "💡 Diferente do português, o inglês não tem gênero gramatical. 'The car', 'the house' — sempre 'the'!",
  "📝 O inglês é mais direto que o português — vai logo ao verbo: 'I love you' vs 'Eu te amo' (mesma ordem).",
  "🌍 O inglês tem o maior vocabulário do mundo — mais que o dobro do português!",
  // Curiosidades gerais
  "📖 Shakespeare inventou +1.700 palavras: 'lonely', 'bedroom', 'generous', 'obscene', 'crítica'...",
  "🌐 O inglês é língua oficial de 67 países — mais do que qualquer outro idioma no mundo.",
  "🔤 'Set' é a palavra com mais significados em inglês: 430+ definições no dicionário.",
  "💬 'I' é a única letra que é uma palavra completa em inglês — e sempre escrita maiúscula!",
  "🧠 Aprender inglês muda o cérebro — aumenta a massa cinzenta nas áreas de memória e atenção.",
  "🌊 'Tsunami' é japonês, 'jungle' é hindi, 'coffee' é árabe — o inglês absorve palavras do mundo todo!",
  "📅 'Monday' = Moon's day, 'Sunday' = Sun's day, 'Saturday' = Saturn's day. Dias da semana são mitologia!",
  "🎯 Estudar 15 minutos por dia é mais eficiente que 2 horas uma vez por semana. Consistência é tudo!",
  "🔡 'Rhythm' é uma das poucas palavras inglesas sem vogal — e ainda tem 2 sílabas!",
  "🏆 Com apenas 3.000 palavras, você entende 95% dos textos em inglês do dia a dia.",
  // Phrasal verbs
  "🔥 'Give up' = desistir. 'Give in' = ceder. 'Give out' = distribuir. Uma palavra, três significados!",
  "💡 'Look up' = pesquisar/olhar pra cima. 'Look out' = cuidado! 'Look after' = cuidar de.",
  "⚡ 'Turn on' liga. 'Turn off' desliga. 'Turn up' aparece do nada. 'Turn down' recusa.",
  "🎯 'Pick up' pode ser: buscar alguém, aprender algo novo, ou atender o telefone.",
  "🚀 'Run out of' = ficar sem. 'Run into' = encontrar por acaso. 'Run away' = fugir.",
  "🧠 Phrasal verbs são dois verbos que formam um novo significado — diferente do português!",
  "🌊 'Go on' = continuar. 'Go off' = explodir/tocar. 'Go over' = revisar. 'Go through' = passar por.",
  "🎭 'Put off' = adiar. 'Put up with' = tolerar. 'Put on' = vestir. 'Put out' = apagar.",
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
        <div class="streak-total">Streak atual: <strong>${userData.streak||0} dias 🔥</strong></div>
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
  const url="https://vicenglish.netlify.app";
  if(navigator.share){navigator.share({title:"VIC English",text:"Aprenda inglês profissional!",url});}
  else{navigator.clipboard.writeText(url).then(()=>showXpToast("🔗 Link copiado!"));}
}

function renderDashboard(){
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
  document.getElementById("dash-xp").textContent=xp;
  document.getElementById("dash-level").textContent=level;
  document.getElementById("dash-streak").textContent=userData.streak||0;

  // Next badge inline below XP bar
  const earned2=userData.badges||[];
  const nextBadge2=BADGES.find(b=>!earned2.includes(b.id));
  const nbiEl=document.getElementById("next-badge-inline");
  nbiEl?.addEventListener("click",()=>{ vibrate(30); openProfile(); setTimeout(()=>document.getElementById("profile-badges-grid")?.scrollIntoView({behavior:"smooth"}),400); });
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

  const xpInLevel=xp%(level*100)||xp%100;
  const xpForLevel=level*100;
  const pct=Math.min(Math.round((xpInLevel/xpForLevel)*100),100);
  document.getElementById("dash-xp-bar").style.width=`${pct}%`;
  document.getElementById("dash-xp-next").textContent=`${xpForLevel-xpInLevel} XP para o próximo nível`;

  // Show next badge milestone on bar
  const earned=userData.badges||[];
  const nextBadge=BADGES.find(b=>!earned.includes(b.id));
  const milestoneEl=document.getElementById("dash-milestone-marker");
  if(milestoneEl&&nextBadge){
    milestoneEl.textContent=nextBadge.icon;
    milestoneEl.title=`Próxima conquista: ${nextBadge.name}`;
  }
  const lvEl=document.getElementById("greeting-level");
  if(lvEl) lvEl.textContent=`${lv.label} — ${lv.msg}`;

  // Update header avatar
  const avatarIcon=document.getElementById("dash-avatar-icon");
  if(avatarIcon){
    const saved=localStorage.getItem("vic_avatar");
    avatarIcon.textContent=saved||userData.name?.[0]?.toUpperCase()||"👤";
  }

  // User level in header
  const ulEl=document.getElementById("dash-user-level");
  if(ulEl) ulEl.textContent=lv.label.split(" ")[0]+" "+lv.label.split(" ")[1];
  // Start Now — goes to segment phases
  const snBtn=document.getElementById("btn-start-now");
  if(snBtn){ const seg=getSegment(currentSegmentId); snBtn.textContent=`▶ Start Now! ${seg?.icon||""}${seg?.name||""}`; }
  const banner=document.getElementById("pro-banner");
  if(banner) banner.style.display=isPro()?"none":"flex";

  // Show diagnosis banner only if never done
  const diagBanner=document.getElementById("diag-invite-banner");
  if(diagBanner) diagBanner.style.display=userData.diagnosisAnswers?"none":"flex";

  renderSegments();
}

function renderSegments(){
  const c=document.getElementById("segments-grid"); if(!c) return; c.innerHTML="";
  const grammarSeg=VICTOR_DATA.segments.find(s=>s.isGrammarCore);
  const regularSegs=VICTOR_DATA.segments.filter(s=>!s.isGrammarCore);
  regularSegs.forEach(seg=>{
    const div=document.createElement("div");
    div.className=`segment-card ${seg.available?"available":"locked"}`;
    div.innerHTML=`<span class="seg-icon">${seg.icon}</span><span class="seg-name">${seg.name}</span>${seg.comingSoon?'<span class="seg-badge">Em breve</span>':""}`;
    if(seg.available) div.addEventListener("click",()=>openSegmentPhases(seg.id));
    c.appendChild(div);
  });
  if(grammarSeg){
    const gc=document.getElementById("grammar-core-banner");
    if(gc){gc.style.display="block";gc.onclick=()=>openSegmentPhases(grammarSeg.id);}
  }
}

// ── PHASES ────────────────────────────────────────────────────────────────────
function openSegmentPhases(segId){
  const seg=getSegment(segId); if(!seg) return;
  currentSegmentId=segId;
  document.getElementById("phases-title").textContent=`${seg.icon} ${seg.name}`;
  const list=document.getElementById("phases-list"); list.innerHTML="";
  const completed=userData.completedMissions||[];
  (seg.phases||[]).forEach((phase,pi)=>{
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
  currentSegmentId=segId; currentPhaseId=phaseId; currentMissionId=misId; currentPhraseIndex=0;
  resetRecorder(); renderMission(); showView("view-mission");
}

function renderMission(){
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
    if(phrase.pt&&phrase.type!=="translate_en_pt"&&phrase.type!=="translate_pt_en"){
      ptEl.innerHTML=`<span class="phrase-pt-label">🇧🇷</span> ${phrase.pt}`;
    } else {
      ptEl.textContent="";
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
  container.querySelectorAll(".phrase-word").forEach(s=>s.addEventListener("click",()=>{const w=s.dataset.word;if(w)SoundFX.speakEN(w);}));
}

function renderVocab(phrase){
  const el=document.getElementById("vocab-list"); if(!el) return;
  if(!phrase.words?.length){el.style.display="none";return;}
  el.style.display="flex";
  el.innerHTML=phrase.words.map(w=>`<div class="vocab-item" data-word="${w.w}" data-tr="${w.tr}"><span class="vocab-word">${w.w}</span><span class="vocab-class ${w.cls}">${w.cls}</span><span class="vocab-translation">= ${w.tr}</span><span class="vocab-speaker">🔊</span></div>`).join("");
  el.querySelectorAll(".vocab-item").forEach(item=>{
    item.querySelector(".vocab-word")?.addEventListener("click",()=>SoundFX.speakEN(item.dataset.word));
    item.querySelector(".vocab-translation")?.addEventListener("click",()=>SoundFX.speakPT(item.dataset.tr));
    item.querySelector(".vocab-speaker")?.addEventListener("click",()=>SoundFX.speakEN(item.dataset.word));
  });
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
      btn.innerHTML=`<span class="mc-text">${opt}</span><button class="mc-speak-btn" tabindex="-1">🔊</button>`;
      btn.querySelector(".mc-speak-btn").addEventListener("click",e=>{
        e.stopPropagation();
        const clean=stripEmoji(opt);
        // if phrase is translate_pt_en, options are PT; otherwise EN
        const phrase=getPhrase();
        if(phrase?.type==="translate_en_pt"||SoundFX._isPT(clean)) SoundFX.speakPT(clean);
        else SoundFX.speakEN(clean);
      });
      btn.addEventListener("click",()=>{
        if(exerciseAnswered) return; exerciseAnswered=true;
        wrap.querySelectorAll(".mc-option").forEach((b,i)=>{b.disabled=true;if(i===newCorrect)b.classList.add("correct");else if(i===newIdx&&newIdx!==newCorrect)b.classList.add("wrong");});
        const correctText=stripEmoji(phrase.options[phrase.correct]);
        SoundFX._isPT(correctText)?SoundFX.speakPT(correctText):SoundFX.speakEN(correctText);
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
    setTimeout(()=>{const b=document.getElementById("fill-blank-input");if(b){b.textContent="";b.addEventListener("input",()=>document.getElementById("fill-input-hidden").value=b.textContent);b.focus();}},100);
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
  else{fb.className="answer-feedback wrong";fb.innerHTML=`✅ Correto: <small>${correct}</small>`;SoundFX.wrong();}
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
  if(result.feedback==="correct"){fb.className="answer-feedback correct";fb.innerHTML=`🌟 Correto! <strong>${correct}</strong>`;SoundFX.correct();}
  else if(result.feedback==="almost"){fb.className="answer-feedback correct";fb.innerHTML=`👍 Quase! <strong>${correct}</strong>`;SoundFX.almost();}
  else{fb.className="answer-feedback wrong";fb.innerHTML=`✅ Correto: <strong>${correct}</strong>`;SoundFX.wrong();}
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
  if(result.feedback==="correct"){fb.className="answer-feedback correct";fb.innerHTML=`🌟 Correto!`;SoundFX.correct();}
  else if(result.feedback==="almost"){fb.className="answer-feedback correct";fb.innerHTML=`👍 Quase! <strong>${correct}</strong>`;SoundFX.almost();}
  else{fb.className="answer-feedback wrong";fb.innerHTML=`✅ Correto: <strong>${correct}</strong>`;SoundFX.wrong();}
  fb.style.display="block";
  SoundFX._isPT(correct)?SoundFX.speakPT(correct):SoundFX.speakEN(correct);
  showNextBtn('btn-next-order', result.score);
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
  const xpGain=10; const newXp=(userData.xp||0)+xpGain;
  userData.xp=newXp; showXpToast(`+${xpGain} XP`);
  trackDailyXP(xpGain);
  trackAnswer(score>=5);
  await updateDailyProgress("exercise");
  if(score===10) await updateDailyProgress("perfect");
  if(currentSegmentId==="maritimo") await updateDailyProgress("maritime");
  const mission=getMission(currentSegmentId,currentPhaseId,currentMissionId);
  const total=mission?.phrases.length||1;
  if(currentPhraseIndex<total-1){
    currentPhraseIndex++;
    await saveProgress(currentUser.uid,{xp:newXp,currentMission:{segmentId:currentSegmentId,phaseId:currentPhaseId,missionId:currentMissionId,phraseIndex:currentPhraseIndex}});
    renderMission();
  } else await completeMission(newXp);
}

function updateNavButtons(nextUnlocked, score){
  // NEXT — all buttons with class btn-next-exercise
  document.querySelectorAll(".btn-next-exercise").forEach(btn=>{
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
  const completed=userData.completedMissions||[];
  const key=`${currentSegmentId}_${currentPhaseId}_${currentMissionId}`;
  if(!completed.includes(key)) completed.push(key);
  currentPhraseIndex=0;
  await saveProgress(currentUser.uid,{xp:xp??userData.xp,completedMissions:completed,currentMission:{segmentId:currentSegmentId,phaseId:currentPhaseId,missionId:currentMissionId,phraseIndex:0}});
  userData.completedMissions=completed;
  SoundFX.complete();
  if(completed.length===1) showNotifBanner();
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
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://vicenglish.netlify.app')}" target="_blank" class="pmm-share-btn pmm-fb">👥</a>
        <a href="https://www.instagram.com/" target="_blank" class="pmm-share-btn pmm-ig">📸</a>
        <button class="pmm-share-btn pmm-copy" onclick="navigator.clipboard.writeText('https://vicenglish.netlify.app').then(()=>showXpToast('🔗 Link copiado!'))">🔗</button>
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
function fcRight(){SoundFX.correct();fcXP+=10;fcIndex++;renderFlashcard();}
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
      if(freeMemMatched===total){showXpToast(`🧠 +${freeMemXP} XP`);if(currentUser)saveProgress(currentUser.uid,{xp:(userData.xp||0)+freeMemXP}).then(()=>{userData.xp=(userData.xp||0)+freeMemXP;});setTimeout(()=>openMemoryFree(),1500);}
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
  if(currentUser)saveProgress(currentUser.uid,{xp:(userData.xp||0)+tfScore}).then(()=>{userData.xp=(userData.xp||0)+tfScore;});
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
  back.className="btn-back-sm"; back.textContent="← Segmentos";
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
  }catch(e){}
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
      fb.innerHTML=correct?`✅ Correto! +10 pts`:`✅ Era: <strong>${line.options[line.correct]}</strong>`;
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
      }catch(e){}
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
  if(currentUser)saveProgress(currentUser.uid,{xp:(userData.xp||0)+dlgScore}).then(()=>{userData.xp=(userData.xp||0)+dlgScore;});
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

// Preview mode — admin sees app as full Pro user
function enterPreviewMode(){
  const prev={...userData};
  userData={...userData, plan:"pro", _adminPreview:true};
  renderDashboard();
  showView("view-dashboard");
  showXpToast("👁️ Modo preview — acesso total");
  // Add return button
  const retBtn=document.createElement("button");
  retBtn.className="btn-back"; retBtn.textContent="← Voltar ao painel";
  retBtn.style.cssText="position:fixed;top:80px;right:16px;z-index:999;padding:8px 14px;background:#7c3aed;border:none;border-radius:999px;color:#fff;font-weight:700;cursor:pointer;";
  retBtn.onclick=()=>{userData=prev;retBtn.remove();loadAdminDashboard();};
  document.body.appendChild(retBtn);
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
  }catch(e){}
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
function renderAdminUsers(){
  const list=document.getElementById("admin-users-list"); list.innerHTML="";
  const term=adminSearchTerm.toLowerCase();
  const filtered=term?adminUsers.filter(u=>(u.name||"").toLowerCase().includes(term)||(u.email||"").toLowerCase().includes(term)):adminUsers;
  if(!filtered.length){list.innerHTML=`<div style="padding:16px;text-align:center;color:#6b7a90">Nenhum aluno encontrado</div>`;return;}
  filtered.forEach(u=>{
    const lv=calcLevel(u.xp||0), plan=u.plan==="pro"?"🟡 Pro":"⬜ Free";
    const row=document.createElement("div"); row.className="admin-user-row";
    row.innerHTML=`<span class="adm-col adm-name">${u.provider==="anonymous"?"👤 Visitante":u.name||"—"}</span><span class="adm-col">Nv ${lv}</span><span class="adm-col adm-xp">${u.xp||0} XP</span><span class="adm-col">${u.streak||0} 🔥</span><span class="adm-col">${plan}</span><span class="adm-col"><button class="adm-view-btn" data-uid="${u.uid}">Ver</button></span>`;
    row.querySelector(".adm-view-btn").addEventListener("click",()=>openUserModal(u.uid));
    list.appendChild(row);
  });
}
async function openUserModal(uid){
  const u=adminUsers.find(x=>x.uid===uid)||await getUserById(uid); if(!u) return;
  _currentModalUser=u;
  const uidEl=document.getElementById("modal-uid");
  if(uidEl) uidEl.textContent=`UID: ${u.uid.slice(0,12)}...`;
  const lv=calcLevel(u.xp||0), lvInfo_=levelInfo(u.xp||0), completed=(u.completedMissions||[]);
  document.getElementById("modal-avatar").textContent=u.provider==="anonymous"?"👤":(u.name||"?")[0].toUpperCase();
  document.getElementById("modal-name").textContent=u.provider==="anonymous"?"Visitante":u.name||"—";
  document.getElementById("modal-email").textContent=u.email||u.provider||"—";
  document.getElementById("modal-stats").innerHTML=`<div class="modal-stat"><span>${u.xp||0}</span><small>XP</small></div><div class="modal-stat"><span>Nv ${lv}</span><small>${lvInfo_.label}</small></div><div class="modal-stat"><span>${u.streak||0}</span><small>Streak 🔥</small></div><div class="modal-stat"><span>${completed.length}</span><small>Missões</small></div>`;
  document.getElementById("modal-progress").innerHTML=`<div class="modal-prog-label">Diagnóstico: <strong>${u.detectedLevel?.toUpperCase()||"não feito"}</strong></div><div class="modal-prog-label">Segmento: <strong>${u.currentMission?.segmentId||"—"}</strong></div><div class="modal-prog-label" id="modal-prog-label-plan">Plano: <strong>${u.plan==="pro"?"Pro ⭐":"Free"}</strong></div><div class="modal-prog-label">Login: <strong>${u.provider==="google"?"Google":u.provider==="anonymous"?"Anônimo":"Email"}</strong></div>`;
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
const APP_LINK="https://dynamic-speculoos-35ec76.netlify.app/";
let soundsEnabled=true, darkMode=true, fontSize="medium";

function openProfile(){
  try{
    const xp=userData?.xp||0, lv=levelInfo(xp);
    const completed=userData?.completedMissions||[];
    const name=userData?.name||"Aluno";

    // avatar
    const av=document.getElementById("profile-avatar");
    if(av){ loadAvatar(); if(!localStorage.getItem("vic_avatar")) av.textContent=name[0]?.toUpperCase()||"👤"; }
    const hn=document.getElementById("profile-hero-name"); if(hn) hn.textContent=name;
    const hl=document.getElementById("profile-hero-level"); if(hl) hl.textContent=lv.label;
    const pxp=document.getElementById("ps-xp"); if(pxp) pxp.textContent=xp;
    const pstr=document.getElementById("ps-streak"); if(pstr) pstr.textContent=userData?.streak||0;
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
    {name:"🗣️ Speaking",    value:speaking,  tip:"Pratique pronúncia e diálogos"},
    {name:"✍️ Writing",     value:writing,   tip:"Use a seção Writing & Translation"},
    {name:"👂 Listening",   value:listening, tip:"Pratique diálogos e situações reais"},
    {name:"📖 Reading",     value:reading,   tip:"Complete mais missões de vocabulário"},
    {name:"🔄 Translating", value:translating,tip:"Faça exercícios de tradução"},
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
  await saveProgress(currentUser.uid,{xpHistory:history});
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
  const cats={momento:"⚡ Momento",performance:"🔥 Performance",resiliencia:"⚔️ Resiliência",dominio:"🧠 Domínio",raro:"👑 Raros"};
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
  if(streak>=7&&todayDone>=3){level="🔥 Alto";color="#22c55e";msg="Você está praticando com consistência! Continue assim.";}
  else if(streak>=3||todayDone>=2){level="⚡ Médio";color="#f59e0b";msg="Bom ritmo! Tente praticar todos os dias para subir o nível.";}
  else{level="💤 Baixo";color="#ef4444";msg="Tente fazer pelo menos 3 exercícios por dia para evoluir mais rápido.";}

  container.innerHTML=`
    <div class="commitment-level" style="color:${color}">${level}</div>
    <div class="commitment-msg">${msg}</div>
    <div class="commitment-stats">
      <div class="commitment-stat"><span>${streak}</span><small>dias seguidos</small></div>
      <div class="commitment-stat"><span>${todayDone}</span><small>hoje</small></div>
      <div class="commitment-stat"><span>${completed}</span><small>missões totais</small></div>
    </div>
  `;
}

// Settings actions
function applyFontSize(size){
  fontSize=size;
  document.body.classList.remove("font-xs","font-small","font-medium","font-large","font-xl");
  document.body.classList.add(`font-${size}`);
  document.querySelectorAll(".font-size-btn").forEach(b=>b.classList.toggle("active",b.dataset.size===size));
  localStorage.setItem("vic_fontSize",size);
}

function applyDarkMode(dark){
  darkMode=dark;
  document.body.classList.toggle("light-mode",!dark);
  localStorage.setItem("vic_darkMode",dark?"1":"0");
}

function applySounds(enabled){
  soundsEnabled=enabled;
  localStorage.setItem("vic_sounds",enabled?"1":"0");
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
      document.getElementById("profile-hero-name").textContent=val;
      document.getElementById("dash-username").textContent=val;
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
  const fs=localStorage.getItem("vic_fontSize");
  const dm=localStorage.getItem("vic_darkMode");
  const sn=localStorage.getItem("vic_sounds");
  if(fs) applyFontSize(fs);
  if(dm==="0") applyDarkMode(false);
  if(sn==="0") applySounds(false);
}

// ── AVATAR SYSTEM ─────────────────────────────────────────────────────────────
const AVATAR_EMOJIS=["😊","🦁","🐯","🦊","🐺","🦅","⚓","🚀","🌟","💪","🎯","🏆","🌊","🐋","🎓","👨‍✈️","👩‍✈️","🧑‍💼","👨‍🍳","👩‍🍳","🧑‍🔧","🌍","✈️","🛳️","🛢️","🏨","🍽️","🏖️","📖","✍️","🧠","🥸","👽","💩","👹","🐗","🐷","🐉","🦖","🕷️","🐜","🦧","😏","😎","🥳","🤓","🫶","🎨","⚽","🏅","🎮","🧿","🪄","🎰","🕹️","🪬","🎷","📚","💸","⌛","🧑‍🎓","🥶","🤑","🫠","🏹","🥞","🛸","🌚","🌞","🔥","💜","💚"];

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
  localStorage.setItem("vic_avatar",value);
  // Update all avatar displays
  const pa=document.getElementById("profile-avatar");
  const dai=document.getElementById("dash-avatar-icon");
  if(pa) pa.innerHTML=value.length>2?`<img src="${value}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:`<span style="font-size:28px">${value}</span>`;
  if(dai) dai.textContent=value.length<=2?value:(userData.name?.[0]?.toUpperCase()||"👤");
}

function loadAvatar(){
  const saved=localStorage.getItem("vic_avatar");
  if(!saved) return;
  const pa=document.getElementById("profile-avatar");
  const dai=document.getElementById("dash-avatar-icon");
  if(pa){
    if(saved.startsWith("data:")||saved.startsWith("http")){
      pa.innerHTML=`<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
    } else {
      pa.innerHTML=`<span style="font-size:28px">${saved}</span>`;
    }
  }
  if(dai&&saved.length<=2) dai.textContent=saved;
}

// ── WRITING & TRANSLATION ─────────────────────────────────────────────────────
let currentWritingTopic=null, writingTopicIndex=0;

function openWriting(){
  document.getElementById("writing-selector").style.display="block";
  document.getElementById("writing-exercise").style.display="none";
  const list=document.getElementById("writing-topic-list"); list.innerHTML="";

  const levelColors={A1:"#22c55e",A2:"#f59e0b",B1:"#c9933a",B2:"#7c3aed"};
  VICTOR_DATA.writingTopics.forEach((topic,i)=>{
    const div=document.createElement("div"); div.className="phase-card unlocked";
    div.innerHTML=`
      <div class="phase-left">
        <div class="phase-num">${topic.icon} ${topic.title}</div>
        <div class="phase-sub">${topic.ptTitle}</div>
        <div class="phase-progress-text" style="color:${levelColors[topic.level]||'#c9933a'}">${topic.level}</div>
      </div>
      <div class="phase-right">→</div>
    `;
    div.addEventListener("click",()=>startWritingTopic(i));
    list.appendChild(div);
  });
  showView("view-writing");
}

function startWritingTopic(index){
  writingTopicIndex=index;
  currentWritingTopic=VICTOR_DATA.writingTopics[index];
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
  const nextBtn=document.getElementById("btn-next-writing");
  if(writingTopicIndex<VICTOR_DATA.writingTopics.length-1){
    nextBtn.style.display="block";
    nextBtn.textContent=`Próximo: ${VICTOR_DATA.writingTopics[writingTopicIndex+1].icon} ${VICTOR_DATA.writingTopics[writingTopicIndex+1].title} →`;
  } else nextBtn.style.display="none";
}

async function checkWriting(){
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
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
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
  "errors": [
    {
      "original": "<exact wrong phrase from student text>",
      "corrected": "<how it should be written>",
      "explanation": "<1 sentence in Portuguese: why wrong and what the rule is>"
    }
  ],
  "corrected": "<full natural corrected version in English, appropriate for ${t.level} level>"
}
Maximum 5 errors. Focus on most important ones. If no errors, use empty array.`
        }]
      })
    });

    const data=await response.json();
    const raw=data.content?.[0]?.text||"{}";
    let result;
    try{ result=JSON.parse(raw.replace(/```json|```/g,"").trim()); }
    catch(e){ result={score:7,good:"Bom esforço!",errors:[],corrected:text}; }

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

    // Show errors with explanations
    const errorsEl=document.getElementById("wf-errors");
    if(errorsEl){
      if(result.errors&&result.errors.length>0){
        errorsEl.innerHTML=result.errors.map(e=>`
          <div class="wf-error-item">
            <div class="wf-error-original">❌ <span>${e.original}</span></div>
            <div class="wf-error-corrected">✅ ${e.corrected}</div>
            <div class="wf-error-explanation">💡 ${e.explanation}</div>
          </div>
        `).join("");
        errorsEl.style.display="block";
      } else {
        errorsEl.innerHTML=`<div class="wf-no-errors">🎉 Nenhum erro encontrado!</div>`;
        errorsEl.style.display="block";
      }
    }

    document.getElementById("wf-corrected").textContent=result.corrected||text;

    // XP reward
    const xpGain=result.score>=8?30:result.score>=5?20:10;
    userData.xp=(userData.xp||0)+xpGain;
    showXpToast(`✍️ +${xpGain} XP`);
    if(currentUser) saveProgress(currentUser.uid,{xp:userData.xp});
    btn.textContent="✅ Corrigido!";
    document.getElementById("writing-feedback").scrollIntoView({behavior:"smooth",block:"start"});

  }catch(e){
    btn.disabled=false; btn.textContent="🤖 Corrigir com IA";
    showXpToast("❌ Erro na correção. Tente novamente.");
  }
}

// ── BADGE SYSTEM ──────────────────────────────────────────────────────────────

const BADGES = [
  // ⚡ MOMENTO — Day 1
  {id:"first_mission",  cat:"momento",    icon:"🕷️", name:"With Great Power Comes Great Responsibility",        desc:"Completou sua primeira missão.",             condition:s=>s.missionsCompleted>=1,       xp:30},
  {id:"first_perfect",  cat:"momento",    icon:"🪄", name:"Wingardium Leviosa!",         desc:"Primeira resposta perfeita.",                condition:s=>s.perfectAnswers>=1,          xp:20},
  {id:"first_voice",    cat:"momento",    icon:"🎙️", name:"May the Force Be With You",   desc:"Usou o microfone pela primeira vez.",        condition:s=>s.voiceUsed>=1,               xp:25},

  // 🔥 PERFORMANCE — Days 2-6 (gradual)
  {id:"streak3",        cat:"performance",icon:"💪", name:"Super Soldier",               desc:"3 acertos seguidos — digno do soro do Rogers.",condition:s=>s.answerStreak>=3,          xp:30},
  {id:"streak5",        cat:"performance",icon:"🔥", name:"I Volunteer as Tribute",      desc:"5 acertos seguidos — Katniss aprovaria.",    condition:s=>s.answerStreak>=5,            xp:50},
  {id:"xp100",          cat:"performance",icon:"🌩️","name":"Thor's Hammer",             desc:"100 XP — só os dignos chegam aqui!",         condition:s=>s.xp>=100,                    xp:20},
  {id:"missions3",      cat:"performance",icon:"🟢", name:"Hulk Smash!",                 desc:"3 missões — HULK INGLÊS!",                   condition:s=>s.missionsCompleted>=3,       xp:40},
  {id:"streak10",       cat:"performance",icon:"⚡", name:"I Am Iron Man",               desc:"10 seguidos — Tony Stark aprova.",           condition:s=>s.answerStreak>=10,           xp:100},
  {id:"xp250",          cat:"performance",icon:"💰", name:"Show Me The Money!",          desc:"250 XP — Jerry Maguire ficaria feliz.",      condition:s=>s.xp>=250,                    xp:30},

  // ⚔️ RESILIÊNCIA — Days 7-14
  {id:"daily3",         cat:"resiliencia",icon:"🛡️", name:"Avengers, Assemble!",         desc:"3 dias seguidos — o time está se formando.", condition:s=>s.loginStreak>=3,             xp:50},
  {id:"missions5",      cat:"resiliencia",icon:"🌀", name:"I'll Be Back",                desc:"5 missões — The Terminator não desiste.",    condition:s=>s.missionsCompleted>=5,       xp:60},
  {id:"daily7",         cat:"resiliencia",icon:"🌟", name:"Wakanda Forever",             desc:"7 dias seguidos — T'Challa ficaria orgulhoso!",condition:s=>s.loginStreak>=7,          xp:100},
  {id:"missions10",     cat:"resiliencia",icon:"🏆", name:"One Ring to Rule Them All",   desc:"10 missões — digno do Monte Doom!",          condition:s=>s.missionsCompleted>=10,      xp:120},
  {id:"xp500",          cat:"resiliencia",icon:"🔱", name:"King of the Seven Seas",      desc:"500 XP — Aquaman reconhece seu domínio.",    condition:s=>s.xp>=500,                    xp:60},

  // 🧠 DOMÍNIO — Days 15+
  {id:"maritime_dom",   cat:"dominio",    icon:"⚓", name:"The Name is Bond...",          desc:"Dominou o Marítimo — licença para navegar.", condition:s=>s.segmentsDone.includes("maritimo"),  xp:200},
  {id:"comex_dom",      cat:"dominio",    icon:"🌍", name:"King of COMEX",               desc:"Dominou COMEX — o mundo é seu mercado.",     condition:s=>s.segmentsDone.includes("comex"),     xp:200},
  {id:"xp1000",         cat:"dominio",    icon:"💎", name:"Infinity Gauntlet",           desc:"1000 XP — poder do universo nas mãos!",      condition:s=>s.xp>=1000,                   xp:150},
  {id:"polyglot",       cat:"raro",       icon:"⭐", name:"The One",                     desc:"3+ segmentos — 'There is no spoon.' — Neo",  condition:s=>s.segmentsDone.length>=3,     xp:400},
];

// Session stats tracker (resets per session, persisted cumulatively in userData)
let _sessionStats = {
  answerStreak: 0,
  totalAnswers: 0,
  perfectAnswers: 0,
  voiceUsed: 0,
  retries: 0,
};

function getBadgeStats(){
  const completed = userData?.completedMissions||[];
  const segDone = VICTOR_DATA.segments.filter(seg=>{
    const phases = seg.phases||[];
    const total = phases.reduce((a,p)=>(p.missions||[]).length+a,0);
    const done = completed.filter(m=>m.startsWith(seg.id+"_")).length;
    return total>0 && done/total>=0.6;
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
    writingCompleted: userData?.writingCompleted||0,
    grammarCompleted: completed.filter(m=>m.startsWith("gramatica_")).length,
  };
}

function checkBadges(){
  const stats = getBadgeStats();
  const earned = userData?.badges||[];
  const newBadges = BADGES.filter(b => !earned.includes(b.id) && b.condition(stats));
  if(!newBadges.length) return;

  // Save to userData
  const updated = [...earned, ...newBadges.map(b=>b.id)];
  userData.badges = updated;
  if(currentUser) saveProgress(currentUser.uid, {badges:updated});

  // Show first new badge (queue others)
  newBadges.forEach((b,i) => setTimeout(()=>showBadgeUnlock(b), i*2500));
}

function showBadgeUnlock(badge){
  // Remove any existing overlay
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
      <button class="badge-unlock-btn" onclick="document.getElementById('badge-overlay').remove()">Incrível! 🚀</button>
    </div>`;
  document.body.appendChild(overlay);
  SoundFX.complete();

  // Award XP
  userData.xp=(userData.xp||0)+badge.xp;
  if(currentUser) saveProgress(currentUser.uid,{xp:userData.xp});
  showXpToast(`${badge.icon} +${badge.xp} XP — ${badge.name}`);

  // Auto close after 6 seconds
  setTimeout(()=>overlay.remove(), 6000);
}

function trackAnswer(isCorrect, isVoice=false){
  _sessionStats.totalAnswers++;
  if(isCorrect){
    _sessionStats.perfectAnswers++;
    _sessionStats.answerStreak = (userData?.answerStreak||0)+1;
    userData.answerStreak = _sessionStats.answerStreak;
  } else {
    _sessionStats.retries++;
    userData.answerStreak = 0;
  }
  if(isVoice) _sessionStats.voiceUsed++;
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
function vibrate(ms=30){
  try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){}
}

// ── PUSH NOTIFICATIONS ─────────────────────────────────
const NOTIF_MESSAGES = [
  // Movie/character quotes + CTA
  {title:"🕷️ \"With great power comes great responsibility.\"", body:"O poder do inglês te espera. Abre uma missão agora!"},
  {title:"⚡ \"May the Force be with you.\"", body:"Que a força do inglês esteja com você. Um exercício hoje?"},
  {title:"🪄 \"It is our choices that show what we truly are.\"", body:"Escolha praticar agora. Tem um badge esperando por você! 🏆"},
  {title:"🦇 \"Why do we fall? So we can learn to pick ourselves up.\"", body:"Não importa onde parou — volta agora e sobe seu streak! 🔥"},
  {title:"💡 \"Knowledge is power.\"", body:"E o inglês é a chave. Bora aprender algo novo hoje?"},
  {title:"🧠 \"The mind is everything.\"", body:"Treine a sua. Uma missão agora e você sai na frente! 🎯"},
  {title:"🌟 \"You become what you believe.\"", body:"Acredita que você fala inglês. Agora vem provar! 💪"},
  {title:"🚀 \"This is your moment. Take it.\"", body:"Seu badge mais próximo está a poucos XP. Vai buscar!"},
  {title:"👑 \"You were made for more.\"", body:"Mais do que você imagina. Abre o VIC English e prova! 🌍"},
  {title:"🍋 \"If life gives you lemons, upgrade them to a business.\"", body:"Upgrada seu inglês primeiro. Missão rápida te espera!"},
  {title:"✨ \"Messy progress is still progress.\"", body:"Não precisa ser perfeito. Só precisa aparecer. Bora!"},
  {title:"💪 \"You survived Monday. You can do anything.\"", body:"Literalmente. Então faz um exercício. Fácil demais pra você!"},
  {title:"😏 \"Look at you being consistent. Who are you?\"", body:"Aumente seu streak mais um dia. Você já está no ritmo! 🔥"},
  {title:"🏅 \"Not bad for someone who almost quit.\"", body:"Você tá aqui. Isso já é vitória. Vem buscar mais um badge!"},
  {title:"🎯 \"You came. You tried. You didn't quit.\"", body:"E isso é tudo. Mais uma missão e o streak continua!"},
  {title:"👀 \"Still here? That's elite behavior.\"", body:"Comportamento de elite merece XP de elite. Vem pegar!"},
  {title:"💥 From 'I can't' to 'watch me'", body:"Abre o app. Faz uma missão. Manda ver! 🚀"},
  {title:"🔥 \"Power lies where men believe it lies.\"", body:"O poder do inglês tá onde você acreditar. Começa agora!"},
  {title:"⏰ Ei, tá na hora!", body:"O mercado de trabalho não espera. Bora praticar inglês! 💼"},
  {title:"🏆 Tem um badge esperando por você!", body:"Você tá pertinho. Abre o app e vai buscar! 🎯"},
  {title:"🌍 O mercado te aguarda!", body:"Quem fala inglês se destaca. Você já está no caminho! 📈"},
  {title:"⚡ Para de enrolar!", body:"15 minutinhos. Um exercício. Teu futuro agradece. Bora!"},
  {title:"😴 Ei, seu streak tá dormindo...", body:"Não deixa ele morrer! Um exercício agora resolve tudo. 🔥"},
  {title:"🎓 Profissionais bilíngues ganham até 50% mais.", body:"Você já tá investindo nisso. Mais um passo hoje?"},
];


async function requestNotificationPermission(){
  if(!("Notification" in window)) return;
  if(Notification.permission==="granted"){ scheduleNotifications(); return; }
  if(Notification.permission!=="denied"){
    const perm=await Notification.requestPermission();
    if(perm==="granted") scheduleNotifications();
  }
}

function scheduleNotifications(){
  if(!("Notification" in window)||Notification.permission!=="granted") return;
  if(localStorage.getItem("vic_notif_enabled")==="0") return;

  const freq=parseInt(localStorage.getItem("vic_notif_freq")||"3");
  const minHours=24/freq; // e.g. 3x/day = every 8h
  const last=parseInt(localStorage.getItem("vic_last_notif")||"0");
  const now=Date.now();
  const hoursSinceLast=(now-last)/(3600*1000);

  if(hoursSinceLast>=minHours){
    const idx=Math.floor(Math.random()*NOTIF_MESSAGES.length);
    const msg=NOTIF_MESSAGES[idx];
    try{
      new Notification(msg.title,{
        body: msg.body,
        icon: "new_logo_big.png",
        badge: "vic_lamp.png",
        tag: "vic-english-"+idx,
        requireInteraction: false,
      });
      localStorage.setItem("vic_last_notif", String(now));
    }catch(e){}
  }
  localStorage.setItem("vic_last_visit", String(now));
}

// Ask for notifications with friendly banner after first mission
function showNotifBanner(){
  if(!("Notification" in window)||Notification.permission!=="default") return;
  if(localStorage.getItem("vic_notif_asked")) return;
  localStorage.setItem("vic_notif_asked","1");
  const banner=document.createElement("div");
  banner.className="notif-banner";
  banner.innerHTML=`<span style="font-size:22px">🔔</span><div style="flex:1"><div style="font-weight:800;color:#fff">Ativar lembretes?</div><div style="font-size:12px;opacity:0.6">Receba frases motivacionais de filmes + lembretes diários</div></div><button style="padding:8px 16px;background:var(--p);border:none;border-radius:999px;color:#fff;font-weight:800;cursor:pointer;font-family:var(--font)" onclick="requestNotificationPermission();this.closest('.notif-banner').remove()">Ativar</button><button style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;padding:4px 8px" onclick="this.closest('.notif-banner').remove()">✕</button>`;
  const daily=document.querySelector(".daily-block");
  daily?.parentNode?.insertBefore(banner, daily);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function _handleAuth(user){
  console.log("_handleAuth called, user:", user?.uid||"null");
  hideAuthLoading();
  try{
    if(user){
      console.log("User logged in:", user.uid);
      if(user.uid===OWNER_UID){ currentUser=user; await loadAdminDashboard(); }
      else await loadDashboard(user);
    } else {
      console.log("No user — showing auth");
      currentUser=null; userData=null;
      showView("view-auth");
    }
  }catch(e){
    console.error("Auth error:",e.message, e);
    hideAuthLoading();
    showView("view-auth");
  }
}

function init(){
  _domReady = true;

  // Start by showing auth view
  showView("view-auth");

  // If auth already fired before DOM was ready, handle it now
  if(_pendingAuthUser !== undefined) _handleAuth(_pendingAuthUser);

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
  document.getElementById("btn-logout").addEventListener("click",()=>logoutUser());
  ["login-email","login-password"].forEach(id=>document.getElementById(id)?.addEventListener("keydown",e=>{if(e.key==="Enter")handleLogin();}));

  // admin
  initFeedback();
  loadAppConfig();

  // Admin main tabs
  document.querySelectorAll(".admin-main-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".admin-main-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      const panel=tab.dataset.panel;
      ["users","customize","feedback"].forEach(p=>{
        const el=document.getElementById(`admin-panel-${p}`);
        if(el) el.style.display=p===panel?"block":"none";
      });
      if(panel==="customize") initCustomizePanel();
      if(panel==="feedback") loadAdminFeedbacks();
    });
  });
  document.getElementById("btn-load-feedbacks")?.addEventListener("click",loadAdminFeedbacks);
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
    localStorage.setItem("vic_notif_enabled", e.target.checked?"1":"0");
    const freqRow=document.getElementById("notif-freq-row");
    if(freqRow) freqRow.style.display=e.target.checked?"flex":"none";
    if(e.target.checked) requestNotificationPermission();
  });
  document.getElementById("notif-freq")?.addEventListener("change",e=>{
    localStorage.setItem("vic_notif_freq", e.target.value);
  });
  // Restore notification settings
  const notifEnabled=localStorage.getItem("vic_notif_enabled");
  const notifToggle=document.getElementById("toggle-notif");
  if(notifToggle&&notifEnabled==="0"){
    notifToggle.checked=false;
    const fr=document.getElementById("notif-freq-row");
    if(fr) fr.style.display="none";
  }
  const notifFreq=localStorage.getItem("vic_notif_freq");
  const notifFreqEl=document.getElementById("notif-freq");
  if(notifFreqEl&&notifFreq) notifFreqEl.value=notifFreq;
  document.getElementById("btn-modal-close")?.addEventListener("click",()=>document.getElementById("admin-modal").style.display="none");
  document.getElementById("admin-search")?.addEventListener("input",e=>{adminSearchTerm=e.target.value;renderAdminUsers();});
  document.getElementById("btn-admin-preview")?.addEventListener("click",enterPreviewMode);
  document.getElementById("btn-activate-pro")?.addEventListener("click",()=>activatePro(true));
  document.getElementById("btn-deactivate-pro")?.addEventListener("click",()=>activatePro(false));
  document.getElementById("btn-save-edit-admin")?.addEventListener("click",saveAdminEdit);
  document.getElementById("btn-reset-progress")?.addEventListener("click",resetUserProgress);
  document.getElementById("btn-delete-user")?.addEventListener("click",deleteUser);

  // diagnosis
  document.querySelectorAll(".diag-option").forEach(btn=>btn.addEventListener("click",()=>handleDiagOption(btn.dataset.value,btn.closest(".diag-step"))));
  document.getElementById("btn-finish-diag")?.addEventListener("click",finishDiagnosis);
  document.getElementById("btn-diag-voice")?.addEventListener("click",startDiagVoice);
  document.getElementById("btn-finish-diag-note")?.addEventListener("click",finishDiagnosisNote);
  document.getElementById("btn-skip-diag-note")?.addEventListener("click",finishDiagnosisNote);
  document.getElementById("btn-skip-level-test-diag")?.addEventListener("click",async()=>{diagAnswers.level="a1";await finishLevelTest();});

  // level test
  document.getElementById("btn-finish-level-test")?.addEventListener("click",finishLevelTest);
  document.getElementById("btn-skip-level-test")?.addEventListener("click",async()=>{diagAnswers.level="a1";await finishLevelTest();});

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
    document.getElementById("daily-complete-overlay").style.display="none";
  });
  document.getElementById("btn-edit-name")?.addEventListener("click",()=>openEditModal("name","Novo nome",userData?.name||"","text"));
  document.getElementById("btn-edit-email")?.addEventListener("click",()=>openEditModal("email","Novo email",userData?.email||"","email"));
  document.getElementById("btn-edit-password")?.addEventListener("click",()=>openEditModal("password","Nova senha","","password"));
  document.getElementById("btn-save-edit")?.addEventListener("click",saveEdit);
  document.getElementById("btn-cancel-edit")?.addEventListener("click",()=>document.getElementById("profile-edit-modal").style.display="none");
  document.getElementById("btn-share-app")?.addEventListener("click",shareAppPanel);
  document.getElementById("toggle-sounds")?.addEventListener("change",e=>applySounds(e.target.checked));
  document.getElementById("toggle-darkmode")?.addEventListener("change",e=>applyDarkMode(e.target.checked));
  document.querySelectorAll(".font-size-btn").forEach(btn=>btn.addEventListener("click",()=>applyFontSize(btn.dataset.size)));
  loadPreferences();

  // dashboard
  document.getElementById("btn-upgrade-dash")?.addEventListener("click",showUpgradeScreen);
  document.getElementById("btn-start-diag")?.addEventListener("click",()=>startDiagnosis());
  document.getElementById("btn-skip-diag")?.addEventListener("click",async()=>{
    // mark as skipped so banner doesn't show again
    document.getElementById("diag-invite-banner").style.display="none";
    if(currentUser) await saveProgress(currentUser.uid,{diagnosisAnswers:{skipped:true}});
    userData.diagnosisAnswers={skipped:true};
  });
  // Writing
  document.getElementById("writing-core-banner")?.addEventListener("click",openWriting);
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
  document.getElementById("btn-reload-dashboard")?.addEventListener("click",async()=>{
    if(!currentUser) return;
    showXpToast("🔄 Atualizando...");
    userData=await getUserData(currentUser.uid);
    if(userData){ renderDashboard(); showXpToast("✅ Atualizado!"); }
  });
  document.getElementById("btn-start-now")?.addEventListener("click",()=>openSegmentPhases(currentSegmentId));
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

document.addEventListener("DOMContentLoaded",init);
