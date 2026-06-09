// VIC English — OneSignal push rotativo por horário
// Chamado pelo GitHub Actions 6x por dia

const APP_ID  = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const POOLS = {
  "08": [
    { t:"Bom dia, profissional! 🌅", b:"5 minutos de inglês antes do trabalho fazem toda a diferença." },
    { t:"☀️ Novo dia, nova missão!", b:"Que tal começar o dia praticando uma frase em inglês?" },
    { t:"Bom dia! 🎯", b:"Uma missão rápida agora deixa seu dia mais produtivo." },
    { t:"🌄 Você sabia?", b:"15 min de inglês por dia mudam sua carreira em 1 ano. Comece agora!" },
    { t:"☀️ Bom dia!", b:"Abra o VIC English e comece o dia no modo profissional." },
    { t:"🌅 Inglês fluente começa com consistência.", b:"Hoje é mais um dia. Abre o VIC English!" },
    { t:"Bom dia! ⚡", b:"Seu concorrente está praticando agora. E você?" },
    { t:"🌄 Cada manhã é uma chance.", b:"Aprenda algo novo em inglês hoje. Vamos lá!" },
    { t:"☀️ Acordou?", b:"Então é hora de praticar! Uma missão rápida te espera no VIC English." },
    { t:"🌅 Profissionais bilíngues ganham até 30% mais.", b:"Comece hoje. Uma missão por dia já faz diferença." },
  ],
  "10": [
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Actually' não significa 'atualmente' — significa 'na verdade'!" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Pretend' não é pretender — é fingir! 'I'm pretending to work.'" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Library' não é livraria — é biblioteca! Livraria = bookstore." },
    { t:"👂 HOMÓFONAS EM INGLÊS", b:"'Sea' e 'see' soam iguais — mar e ver. Você sabia?" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Eventually' não é eventualmente — significa 'no final / por fim'!" },
    { t:"🔇 LETRA MUDA", b:"'Knife', 'know', 'knee' — o K antes de N é sempre mudo em inglês!" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Fabric' não é fábrica — é tecido/pano! Fábrica = factory." },
    { t:"👂 HOMÓFONAS EM INGLÊS", b:"'Bare' e 'bear' soam iguais — nu/exposto e urso!" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Sympathetic' não é simpático — é compreensivo/empático!" },
    { t:"🎤 PRONÚNCIA", b:"O TH tem 2 sons: 'the/this' é /ð/ (sonoro), 'think/three' é /θ/ (surdo)!" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Sensible' não é sensível — é sensato! Sensível = sensitive." },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Terrific' não é terrível — é ótimo/incrível! 'That's terrific!'" },
    { t:"👂 HOMÓFONAS EM INGLÊS", b:"'Week' e 'weak' soam iguais — semana e fraco!" },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'College' não é colégio — é faculdade! Colégio = high school." },
    { t:"🚨 FALSE FRIEND DO DIA", b:"'Embarrassed' não é embaraçado — é envergonhado/constrangido!" },
  ],
  "12": [
    { t:"⚡ Pausa do almoço?", b:"Que tal uma missão rápida no VIC English? Menos de 5 minutos!" },
    { t:"🍽️ Hora do almoço!", b:"Enquanto espera o pedido, pratica uma frase do seu setor." },
    { t:"⏰ Almoço + inglês", b:"Combinação perfeita para crescer na carreira. Abre o VIC English!" },
    { t:"🥗 Pausa merecida!", b:"Usa 5 minutos para uma missão de inglês agora." },
    { t:"🍴 Não deixe a tarde chegar", b:"...sem praticar inglês. Agora é a hora!" },
    { t:"⚡ Antes de voltar ao trabalho", b:"Uma missão rápida no VIC English. Você consegue!" },
    { t:"🕛 Meio-dia no VIC English!", b:"Bora praticar uma frase do seu setor. Abre o app!" },
    { t:"🍽️ Almoço quase pronto?", b:"Uma missão de inglês enquanto espera. 3 minutinhos só!" },
  ],
  "15": [
    { t:"💡 PHRASAL VERB DO DIA", b:"'Give up' = desistir. 'Give in' = ceder. 'Give out' = distribuir!" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Pick up' = buscar, aprender, ou atender o telefone. Contexto é tudo!" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Turn on' liga. 'Turn off' desliga. 'Turn up' aparece do nada!" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Run out of' = ficar sem. 'Run into' = encontrar por acaso!" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Look up' = pesquisar. 'Look out' = cuidado! 'Look after' = cuidar de." },
    { t:"📖 CURIOSIDADE", b:"'Set' tem 430+ significados — a palavra com mais definições do dicionário!" },
    { t:"💼 INGLÊS DO TRABALHO", b:"'ASAP' = As Soon As Possible. 'FYI' = For Your Information. Use no email!" },
    { t:"🏰 ETIMOLOGIA", b:"'Goodbye' vem de 'God be with ye' — uma bênção medieval encurtada!" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Break down' = quebrar/ter colapso. 'Break out' = escapar/surgir!" },
    { t:"📅 CURIOSIDADE", b:"Monday = Moon's day. Friday = Freya's day. Os dias são mitologia nórdica!" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Stand out' = se destacar. 'Stand up' = dar um bolo. 'Stand for' = representar!" },
    { t:"💼 INGLÊS DO TRABALHO", b:"'Touch base' = entrar em contato brevemente. 'Let's touch base tomorrow.'" },
    { t:"💡 PHRASAL VERB DO DIA", b:"'Put off' = adiar. 'Put up with' = tolerar. 'Put out' = apagar fogo!" },
    { t:"📖 CURIOSIDADE", b:"Shakespeare inventou +1.700 palavras: 'lonely', 'bedroom', 'generous'..." },
    { t:"💼 INGLÊS DO TRABALHO", b:"'On the same page' = alinhados. 'Are we on the same page?' Use em reuniões!" },
  ],
  "19": [
    { t:"🔥 Seu streak está em risco!", b:"Você ainda não praticou hoje. Abra o VIC English agora!" },
    { t:"🎯 Faltam poucas horas!", b:"Uma missão rápida mantém seu streak vivo. Menos de 5 minutos!" },
    { t:"⚡ Hora de praticar!", b:"19h — o melhor momento do dia para uma missão de inglês. Bora!" },
    { t:"🔥 Não perca sua sequência!", b:"Uma missão agora e seu streak continua. Você consegue!" },
    { t:"🎯 Seu inglês profissional", b:"...não pode esperar. Abre o VIC English e pratica uma missão!" },
    { t:"⭐ Você está a uma missão", b:"de manter seu streak vivo. Vai perder essa chance?" },
    { t:"🔥 Consistência é o segredo.", b:"Hoje é mais um dia para provar isso. Abre o VIC English!" },
    { t:"💪 Sua carreira agradece", b:"cada dia que você pratica inglês. Não pare agora!" },
    { t:"⚡ 19h no VIC English!", b:"Hora de praticar antes de relaxar. Uma missão rápida te espera." },
    { t:"🎯 Profissionais bilíngues", b:"praticam todo dia. Você vai ser um deles. Começa agora!" },
  ],
  "21": [
    { t:"⚠️ Última chance do dia!", b:"Seu streak está esperando. Uma missão antes de dormir?" },
    { t:"🌙 Antes de dormir...", b:"Uma missão rápida? Menos de 3 minutos. Amanhã você agradece!" },
    { t:"⏰ Quase meia-noite!", b:"Não deixe o dia acabar sem praticar inglês. Última chance!" },
    { t:"⚠️ Alerta de streak!", b:"Você ainda não praticou hoje. Última chamada — abre o VIC English!" },
    { t:"🌙 Uma missão antes de dormir.", b:"Pequena, rápida, poderosa. Não deixa o dia passar em branco!" },
    { t:"⚠️ O dia quase acabou!", b:"3 minutos de inglês agora salvam seu streak. Não perde não!" },
    { t:"🌙 Boa noite = Good night!", b:"Mas antes — pratica uma missão no VIC English?" },
    { t:"⚠️ Último aviso do dia:", b:"Seu streak precisa de você agora. Abre o app!" },
  ],
};

function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

async function send(title, body) {
  const payload = {
    app_id: APP_ID,
    included_segments: ["All"],
    headings: { en: title, pt: title },
    contents:  { en: body,  pt: body  },
    url: "https://app.viclanguage.com.br",
    web_push_topic: "vic-daily",
    web_buttons: [{ id:"open", text:"Abrir VIC English", url:"https://app.viclanguage.com.br" }],
  };

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.id) {
    console.log(`✅ Enviado para ${data.recipients} usuários | ID: ${data.id}`);
  } else {
    console.error("❌ Erro:", JSON.stringify(data.errors || data));
    process.exit(1);
  }
}

// Determina slot pelo horário UTC atual
const utcHour = new Date().getUTCHours();
// BRT = UTC-3
const brtHour = ((utcHour - 3) + 24) % 24;
const slot = String(brtHour).padStart(2, "0");

const pool = POOLS[slot];
if (!pool) {
  console.log(`Sem pool para slot ${slot}h BRT (${utcHour}h UTC) — nada enviado.`);
  process.exit(0);
}

const msg = pick(pool);
console.log(`Slot ${slot}h BRT → "${msg.t}"`);
send(msg.t, msg.b);
