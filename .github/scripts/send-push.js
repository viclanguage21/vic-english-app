// VIC English — Push Notifications rotativas por slot
// 6x por dia via GitHub Actions — mensagens variadas, científicas e motivacionais

const APP_ID  = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const POOLS = {

  // ── 08h BRT — BOM DIA: frases de personagens + ciência + motivação ──────────
  "08": [
    { t:"'Do or do not. There is no try.' — Yoda 🟢",
      b:"Não tente aprender inglês — aprenda. Uma missão por dia. Abre o VIC English!" },
    { t:"'With great power comes great responsibility.' — Tio Ben 🕷️",
      b:"Seu inglês é esse poder. E vem com grandes oportunidades. Começa hoje!" },
    { t:"'Just keep swimming.' — Dory 🐠",
      b:"Continue praticando, sempre. Mesmo nos dias difíceis. Abre o VIC English!" },
    { t:"'It always seems impossible until it's done.' — Mandela ✊",
      b:"Inglês fluente parece impossível no começo. Depois vira hábito. Começa agora!" },
    { t:"🧠 Ciência comprova:", b:"15 min de inglês por dia são mais eficazes que 2h uma vez por semana. Hoje é seu dia!" },
    { t:"💰 Dado real:", b:"Inglês fluente pode dobrar seu salário no Brasil. Cada missão é um passo a mais." },
    { t:"🧬 Seu cérebro agradece:", b:"Praticar inglês cria novas conexões neurais. Literalmente fica mais inteligente!" },
    { t:"'To infinity and beyond!' — Buzz Lightyear 🚀",
      b:"Seu inglês não tem limite. Mas precisa de consistência. Bom dia — abre o VIC!" },
    { t:"'I'll be back.' — Schwarzenegger 💪",
      b:"Volta pra praticar. Seu streak te espera. Bom dia, profissional!" },
    { t:"'Life is like a box of chocolates.' — Forrest Gump 🍫",
      b:"Sua carreira também é cheia de surpresas. Prepare-se com inglês. Bom dia!" },
    { t:"🏆 Manhã de campeão:", b:"70% das vagas internacionais exigem inglês. Você está se preparando. Abre o VIC!" },
    { t:"'May the Force be with you.' — Star Wars ⚔️",
      b:"Que o inglês esteja com você hoje. Uma missão antes do trabalho!" },
    { t:"🔬 Neurociência diz:", b:"Bilíngues têm o Alzheimer atrasado em até 5 anos. Seu cérebro muda com o inglês!" },
    { t:"'The journey of a thousand miles begins with a single step.' — Lao Tzu 🌿",
      b:"Seu primeiro passo hoje: abrir o VIC English. Bom dia!" },
    { t:"💼 Sabia que...", b:"Profissionais bilíngues são promovidos 2x mais rápido em multinacionais. Vai começar?" },
  ],

  // ── 10h30 BRT — DICA DO DIA: false friends, ciência, etimologia, homofonas ──
  "10": [
    { t:"🚨 FALSE FRIEND", b:"'Actually' não significa 'atualmente' — significa 'na verdade'! Um dos erros mais comuns dos brasileiros." },
    { t:"🚨 FALSE FRIEND", b:"'Pretend' não é pretender — é fingir! 'She's pretending to be asleep.' Cuidado!" },
    { t:"🚨 FALSE FRIEND", b:"'Embarrassed' não é embaraçado — é envergonhado! 'I'm so embarrassed!' = Que vergonha!" },
    { t:"🚨 FALSE FRIEND", b:"'Terrific' não é terrível — é incrível/ótimo! 'That's terrific news!' = Que notícia ótima!" },
    { t:"🚨 FALSE FRIEND", b:"'Eventually' não é eventualmente — é 'no final / por fim'. 'Eventually I understood.' = Por fim entendi." },
    { t:"🚨 FALSE FRIEND", b:"'Sensible' não é sensível — é sensato! Sensível em inglês é 'sensitive'." },
    { t:"🚨 FALSE FRIEND", b:"'College' não é colégio — é faculdade/universidade! Colégio = high school." },
    { t:"🚨 FALSE FRIEND", b:"'Library' não é livraria — é biblioteca! Livraria = bookstore. Não erre na entrevista!" },
    { t:"👂 HOMÓFONAS", b:"'Week' e 'Weak' soam iguais — semana e fraco. 'This week I feel weak.' Sacou?" },
    { t:"👂 HOMÓFONAS", b:"'Bare' e 'Bear' soam iguais — nu/exposto e urso. Inglês é cheio de armadilhas!" },
    { t:"👂 HOMÓFONAS", b:"'Weather' e 'Whether' soam iguais — clima e se (condição). Presta atenção no contexto!" },
    { t:"🔇 LETRA MUDA", b:"'Knife, Know, Knee, Knight' — o K antes de N é sempre mudo! /naif/ /nəʊ/ /niː/ /naɪt/" },
    { t:"🔬 Ciência do idioma:", b:"O inglês tem mais de 1 milhão de palavras — mas você precisa de só 3.000 para 95% do uso diário!" },
    { t:"🏰 Etimologia", b:"'Salary' vem do latim 'sal' (sal) — romanos pagavam soldados com sal. Daí 'salary'!" },
    { t:"🎤 PRONÚNCIA", b:"O TH tem 2 sons: 'the/this/that' é /ð/ sonoro. 'think/three/throw' é /θ/ surdo. Pratique!" },
    { t:"🏰 Etimologia", b:"'Goodbye' vem de 'God be with ye' — uma bênção medieval que virou despedida!" },
    { t:"🧠 Linguística", b:"Inglês é uma língua analítica — quase sem conjugação verbal. 'I go, you go, he goes.' Simples!" },
    { t:"🚨 FALSE FRIEND", b:"'Push' não é puxar — é empurrar! E 'Pull' é puxar. Olha nas portas dos estabelecimentos!" },
    { t:"📖 Curiosidade", b:"'Set' tem 430+ definições — a palavra com mais significados em qualquer dicionário do mundo!" },
    { t:"🚨 FALSE FRIEND", b:"'Parents' não são parentes — são seus pais! Parentes em inglês é 'relatives'." },
  ],

  // ── 12h BRT — ALMOÇO: dados de carreira, frases rápidas ────────────────────
  "12": [
    { t:"⚡ Pausa do almoço?", b:"Uma missão no VIC English leva menos de 5 min. Mais produtivo que o TikTok!" },
    { t:"💼 Dado de carreira:", b:"Mais de 1,5 bilhão de pessoas falam inglês. Cada missão conecta você a esse mundo." },
    { t:"🍽️ Enquanto almoça:", b:"'Lunch' (almoço) vem do espanhol 'lonja' (fatia de presunto). Inglês absorve tudo!" },
    { t:"⚡ 5 minutos de inglês", b:"valem mais que 1 hora de arrependimento. Uma missão rápida antes de voltar ao trabalho?" },
    { t:"🧠 Ciência do intervalo:", b:"Pausas curtas com atividade mental aumentam produtividade no resto do dia. Uma missão?" },
    { t:"'Elementary, my dear Watson.' — Sherlock 🔍",
      b:"Inglês fluente parece elementar quando você pratica todo dia. Abre o VIC!" },
    { t:"💰 Mercado de trabalho:", b:"Vagas com inglês avançado pagam em média 61% a mais no Brasil. Missão de hoje?" },
    { t:"🍴 Hora do almoço =", b:"hora de praticar! Uma frase do seu setor profissional. Abre o VIC English!" },
    { t:"🌍 Você sabia?", b:"Inglês é a língua oficial de 67 países — mais do que qualquer outro idioma no mundo." },
    { t:"⚡ 'Be the change.' — Gandhi",
      b:"Seja o profissional bilíngue que o Brasil precisa. Uma missão agora. Abre o VIC!" },
    { t:"🧬 Seu cérebro no almoço:", b:"Aprender algo novo depois de comer é até 20% mais eficaz. Agora é a hora!" },
    { t:"💼 Dica profissional:", b:"'Per your request' = conforme solicitado. 'Please find attached' = segue em anexo. Use!" },
  ],

  // ── 15h BRT — TARDE: phrasal verbs, ciência, frases de personagens ──────────
  "15": [
    { t:"💡 PHRASAL VERB", b:"'Give up' = desistir. 'Give in' = ceder. 'Give out' = distribuir. Uma palavra, 3 destinos!" },
    { t:"💡 PHRASAL VERB", b:"'Turn on' liga. 'Turn off' desliga. 'Turn up' aparece do nada. 'Turn down' recusa." },
    { t:"💡 PHRASAL VERB", b:"'Pick up' = buscar alguém, aprender algo novo, ou atender o telefone. Contexto é rei!" },
    { t:"💡 PHRASAL VERB", b:"'Run out of' = ficar sem. 'Run into' = encontrar por acaso. 'Run away' = fugir." },
    { t:"💡 PHRASAL VERB", b:"'Stand out' = se destacar. Você vai se destacar no mercado com inglês. Pratique!" },
    { t:"💡 PHRASAL VERB", b:"'Break down' = quebrar/entrar em colapso. 'Break out' = escapar. 'Break through' = superar!" },
    { t:"💡 PHRASAL VERB", b:"'Look up' = pesquisar. 'Look out' = cuidado! 'Look after' = cuidar de. 'Look into' = investigar." },
    { t:"🔬 Ciência do aprendizado:", b:"Repetição espaçada é 2x mais eficaz que estudar muito de uma vez. O VIC faz isso por você!" },
    { t:"🧠 Neurolinguística:", b:"Pessoas bilíngues têm mais matéria cinzenta no córtex pré-frontal — área de tomada de decisão!" },
    { t:"'You shall not pass!' — Gandalf 🧙",
      b:"Sem inglês, muitas oportunidades ficam bloqueadas. Quebra essa barreira. Abre o VIC!" },
    { t:"'Why so serious?' — Coringa 🃏",
      b:"Aprender inglês pode ser divertido! Phrasal verbs, false friends, curiosidades. Abre o VIC!" },
    { t:"🔬 Dado científico:", b:"Crianças bilíngues desenvolvem mais empatia — alternar idiomas treina ver perspectivas diferentes!" },
    { t:"💼 Inglês do trabalho:", b:"'On the same page' = alinhados. 'Touch base' = contato rápido. 'Circle back' = retomar depois." },
    { t:"'The only way to do great work is to love what you do.' — Steve Jobs 💻",
      b:"Ame o processo de aprender inglês. Cada missão é um passo no trabalho dos seus sonhos." },
    { t:"🧬 Neuroplasticidade:", b:"Seu cérebro muda fisicamente quando você aprende uma nova língua. Hoje ele muda de novo!" },
    { t:"💡 PHRASAL VERB", b:"'Put off' = adiar. 'Put up with' = tolerar. 'Put on' = vestir. 'Put out' = apagar. Use já!" },
    { t:"📅 Curiosidade histórica:", b:"Após 1066, o inglês absorveu o francês — por isso tem 'beef' (bœuf) mas a vaca é 'cow'!" },
    { t:"🎯 James Clear — Atomic Habits:", b:"'Você não sobe ao nível dos seus objetivos, cai ao nível dos seus hábitos.' Pratique todo dia." },
    { t:"'It's not who I am underneath, but what I do that defines me.' — Batman 🦇",
      b:"O que define seu inglês é o que você pratica, não o que você planeja. Abre o VIC!" },
    { t:"💡 PHRASAL VERB", b:"'Set up' = montar/configurar. 'Set off' = partir. 'Set out' = sair com objetivo. Diferença importa!" },
  ],

  // ── 19h BRT — STREAK: urgência, hábito, ciência da consistência ─────────────
  "19": [
    { t:"🔥 Seu streak está esperando!", b:"Você ainda não praticou hoje. Uma missão agora e o dia está salvo!" },
    { t:"⚡ 19h no VIC English", b:"A hora mais importante do dia para quem quer crescer na carreira. Abre o app!" },
    { t:"🧠 Neurociência do hábito:", b:"21 dias de prática diária criam um hábito automático. Qual é o seu dia hoje?" },
    { t:"🎯 James Clear diz:", b:"'Cada ação é um voto para o tipo de pessoa que você quer se tornar.' Vote em inglês hoje!" },
    { t:"🔥 Duolingo mandaria isso:", b:"'Don't break the streak!' O VIC também manda. Pratique antes das 23h59!" },
    { t:"'I am inevitable.' — Thanos ♾️",
      b:"Sua fluência em inglês também é inevitável — se você praticar todo dia. Abre o VIC!" },
    { t:"⭐ Uma missão = um hábito", b:"Pesquisa de Harvard: quem mantém streaks tem 3x mais chance de atingir seus objetivos." },
    { t:"💪 Não quebre a corrente!", b:"Jerry Seinfeld sobre hábitos: 'Don't break the chain.' Seu inglês também não pode parar!" },
    { t:"🔥 Faltam horas!", b:"O dia ainda não acabou. Mas está acabando. Abre o VIC English e mantém seu streak!" },
    { t:"'In every day, there are 1,440 minutes.' — Les Brown ⏰",
      b:"Você precisa de só 5 desses para uma missão. Vai deixar passar em branco?" },
    { t:"⚡ Olha a ciência:", b:"Dopamina é liberada quando você completa uma tarefa. Uma missão = prazer real no cérebro!" },
    { t:"🎯 Seu futuro eu agradece", b:"cada dia que você não desistiu. Pratica uma missão agora." },
    { t:"'Keep moving forward.' — Walt Disney 🏰",
      b:"Continue. Uma missão por dia. Seu inglês cresce sem você perceber." },
    { t:"🔥 Streak em jogo!", b:"Profissionais que praticam inglês todo dia chegam à fluência em 8 meses. Hoje conta!" },
    { t:"'Impossible is just an opinion.' — Paulo Coelho ✍️",
      b:"Inglês fluente não é impossível — é questão de tempo e consistência. Pratica hoje!" },
  ],

  // ── 21h30 BRT — ÚLTIMA CHANCE: urgência + ciência do sono ───────────────────
  "21": [
    { t:"⚠️ Última chance do dia!", b:"Seu streak está em risco. Uma missão antes de dormir — menos de 3 minutos!" },
    { t:"🌙 Ciência do sono:", b:"Seu cérebro consolida o que aprendeu enquanto dorme. Pratica inglês agora — fixa melhor!" },
    { t:"⏰ 23h59 é o limite.", b:"Depois, o streak se vai. Abre o VIC English agora — uma missão rápida!" },
    { t:"'I'll be back.' — Schwarzenegger 🤖",
      b:"O dia volta amanhã. Mas o streak pode não voltar. Última chance — abre o VIC!" },
    { t:"🌙 Antes de dormir:", b:"Revisão noturna fixa memória 2x mais rápido. Uma missão agora e você aprende dormindo!" },
    { t:"⚠️ Alerta de streak!", b:"Você tem um streak ativo. Não quebre agora. Uma missão e está salvo!" },
    { t:"🔬 Neurologia do sono:", b:"Hipocampo processa memórias durante o sono REM. O que você pratica agora, amanhã você lembra!" },
    { t:"'Just one more.' — todo gamer 🎮",
      b:"Só uma missão mais no VIC English. Depois pode dormir. Bora!" },
    { t:"⏰ O relógio não para.", b:"Mas você pode. Depois de uma missão de inglês. Última chamada!" },
    { t:"🌙 Boa noite em inglês =", b:"'Good night!' Mas antes de dizer isso — uma missão? Mantenha seu streak!" },
    { t:"⚠️ Último aviso:", b:"Amanhã você vai querer ter praticado hoje. Abre o VIC English. Agora!" },
    { t:"'You can sleep when you're dead.' — dito popular 😅",
      b:"Brincadeira! Mas uma missãozinha antes de dormir não faz mal. Abre o VIC!" },
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
    chrome_web_icon:  "https://app.viclanguage.com.br/logo_full_2.png",
    chrome_web_badge: "https://app.viclanguage.com.br/vic_lamp.png",
    web_buttons: [
      { id:"open", text:"Abrir VIC English 🚀", url:"https://app.viclanguage.com.br" }
    ],
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
    console.log(`✅ Enviado | Slot ${slot}h | Destinatários: ${data.recipients} | ID: ${data.id}`);
    console.log(`   Título: ${title}`);
  } else {
    console.error("❌ Erro:", JSON.stringify(data.errors || data));
    process.exit(1);
  }
}

// Determina slot pelo horário UTC atual convertido para BRT (UTC-3)
const utcHour = new Date().getUTCHours();
const brtHour = ((utcHour - 3) + 24) % 24;
const slot    = String(brtHour).padStart(2, "0");

let pool = POOLS[slot];

// Se não há pool para este horário (ex: disparo manual fora dos horários programados),
// escolhe um pool aleatório para que o teste manual sempre envie algo.
if (!pool) {
  const allPools = Object.values(POOLS);
  pool = allPools[Math.floor(Math.random() * allPools.length)];
  console.log(`ℹ️  Slot ${slot}h BRT fora dos horários — usando pool aleatório para teste.`);
}

const msg = pick(pool);
console.log(`📲 Slot ${slot}h BRT → disparando mensagem...`);
send(msg.t, msg.b);
