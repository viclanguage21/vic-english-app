// VIC English — Push Notifications rotativas por slot
// 6x por dia via GitHub Actions — mensagens variadas, científicas e motivacionais

const APP_ID  = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const POOLS = {

  // ── 08h BRT — BOM DIA: frases de personagens + ciência + motivação ──────────
  "08": [
    { t:"'Do or do not. There is no try.' — Yoda 🟢",
      b:"Não tente aprender inglês — aprenda. Pequenas sessões diárias constroem a fluência." },
    { t:"'With great power comes great responsibility.' — Tio Ben 🕷️",
      b:"Seu inglês é esse poder. E vem com grandes oportunidades profissionais." },
    { t:"'Just keep swimming.' — Dory 🐠",
      b:"Continue praticando, sempre. Mesmo nos dias difíceis. É assim que os fluentes chegaram lá." },
    { t:"'It always seems impossible until it's done.' — Mandela ✊",
      b:"Inglês fluente parece impossível no começo. Depois vira hábito natural." },
    { t:"🧠 Ciência comprova:",
      b:"15 min de inglês por dia são mais eficazes que 2h uma vez por semana. Consistência bate intensidade." },
    { t:"💰 Dado real:",
      b:"Inglês fluente pode dobrar seu salário no Brasil. Cada sessão é um passo concreto nessa direção." },
    { t:"🧬 Seu cérebro agradece:",
      b:"Praticar inglês cria novas conexões neurais. Literalmente fica mais inteligente — neurociência prova!" },
    { t:"'To infinity and beyond!' — Buzz Lightyear 🚀",
      b:"Seu inglês não tem limite. Mas precisa de consistência. Bom dia, profissional!" },
    { t:"'I'll be back.' — Schwarzenegger 💪",
      b:"Volta pra praticar. Seu streak te espera. Bom dia!" },
    { t:"'Life is like a box of chocolates.' — Forrest Gump 🍫",
      b:"Sua carreira também é cheia de surpresas. Prepare-se com inglês. Bom dia!" },
    { t:"🏆 Manhã de campeão:",
      b:"70% das vagas internacionais exigem inglês. Você está se preparando — isso já te coloca à frente." },
    { t:"'May the Force be with you.' — Star Wars ⚔️",
      b:"Que o inglês esteja com você hoje. Uma missão antes do trabalho muda o dia." },
    { t:"🔬 Neurociência diz:",
      b:"Bilíngues têm o Alzheimer atrasado em até 5 anos. Seu cérebro muda fisicamente com o inglês!" },
    { t:"'The journey of a thousand miles begins with a single step.' — Lao Tzu 🌿",
      b:"Cada sessão é um passo. O caminho da fluência se faz caminhando. Bom dia!" },
    { t:"💼 Sabia que...",
      b:"Profissionais bilíngues são promovidos 2x mais rápido em multinacionais. Vale o investimento." },
  ],

  // ── 10h30 BRT — DICA DO DIA: false friends, ciência, etimologia, homófonas ──
  "10": [
    { t:"🚨 FALSE FRIEND",
      b:"'Actually' não significa 'atualmente' — significa 'na verdade'! Um dos erros mais comuns dos brasileiros." },
    { t:"🚨 FALSE FRIEND",
      b:"'Pretend' não é pretender — é fingir! 'She's pretending to be asleep.' Cuidado!" },
    { t:"🚨 FALSE FRIEND",
      b:"'Embarrassed' não é embaraçado — é envergonhado! 'I'm so embarrassed!' = Que vergonha!" },
    { t:"🚨 FALSE FRIEND",
      b:"'Terrific' não é terrível — é incrível/ótimo! 'That's terrific news!' = Que notícia ótima!" },
    { t:"🚨 FALSE FRIEND",
      b:"'Eventually' não é eventualmente — é 'no final / por fim'. 'Eventually I understood.' = Por fim entendi." },
    { t:"🚨 FALSE FRIEND",
      b:"'Sensible' não é sensível — é sensato! Sensível em inglês é 'sensitive'." },
    { t:"🚨 FALSE FRIEND",
      b:"'College' não é colégio — é faculdade/universidade! Colégio = high school." },
    { t:"🚨 FALSE FRIEND",
      b:"'Library' não é livraria — é biblioteca! Livraria = bookstore. Não erre na entrevista!" },
    { t:"👂 HOMÓFONAS",
      b:"'Week' e 'Weak' soam iguais — semana e fraco. 'This week I feel weak.' Sacou?" },
    { t:"👂 HOMÓFONAS",
      b:"'Bare' e 'Bear' soam iguais — nu/exposto e urso. Inglês é cheio de armadilhas sonoras!" },
    { t:"👂 HOMÓFONAS",
      b:"'Weather' e 'Whether' soam iguais — clima e se (condição). O contexto revela tudo!" },
    { t:"🔇 LETRA MUDA",
      b:"'Knife, Know, Knee, Knight' — o K antes de N é sempre mudo! /naif/ /nəʊ/ /niː/ /naɪt/" },
    { t:"🔬 Ciência do idioma:",
      b:"O inglês tem mais de 1 milhão de palavras — mas você precisa de só 3.000 para 95% do uso diário!" },
    { t:"🏰 Etimologia",
      b:"'Salary' vem do latim 'sal' (sal) — romanos pagavam soldados com sal. Daí 'salary'!" },
    { t:"🎤 PRONÚNCIA",
      b:"O TH tem 2 sons: 'the/this/that' é /ð/ sonoro. 'think/three/throw' é /θ/ surdo. Sons completamente diferentes!" },
    { t:"🏰 Etimologia",
      b:"'Goodbye' vem de 'God be with ye' — uma bênção medieval que virou despedida!" },
    { t:"🧠 Linguística",
      b:"Inglês é uma língua analítica — quase sem conjugação verbal. 'I go, you go, he goes.' Simples assim!" },
    { t:"🚨 FALSE FRIEND",
      b:"'Push' não é puxar — é empurrar! E 'Pull' é puxar. Olha nas portas dos estabelecimentos!" },
    { t:"📖 Curiosidade",
      b:"'Set' tem 430+ definições — a palavra com mais significados em qualquer dicionário do mundo!" },
    { t:"🚨 FALSE FRIEND",
      b:"'Parents' não são parentes — são seus pais! Parentes em inglês é 'relatives'." },
  ],

  // ── 12h BRT — ALMOÇO: dados de carreira, curiosidades, frases ────────────────
  "12": [
    { t:"⚡ Pausa de 5 minutos?",
      b:"Você sabia que 5 min de revisão espaçada são mais eficazes que 1h de estudo intenso? Neurociência prova!" },
    { t:"💼 Dado de carreira:",
      b:"Mais de 1,5 bilhão de pessoas falam inglês. Cada sessão conecta você a esse universo de oportunidades." },
    { t:"🍽️ Enquanto almoça:",
      b:"'Lunch' vem do espanhol 'lonja' (fatia de presunto). Inglês absorveu palavras do mundo inteiro!" },
    { t:"🧠 Ciência do intervalo:",
      b:"Pausas curtas com atividade mental aumentam produtividade no resto do dia — comprovado por pesquisas!" },
    { t:"'Elementary, my dear Watson.' — Sherlock 🔍",
      b:"Inglês fluente parece elementar quando você pratica todo dia. A consistência é o segredo." },
    { t:"💰 Mercado de trabalho:",
      b:"Vagas com inglês avançado pagam em média 61% a mais no Brasil. Dado da FGV, 2023." },
    { t:"🌍 Você sabia?",
      b:"Inglês é a língua oficial de 67 países — mais do que qualquer outro idioma no mundo." },
    { t:"'Be the change.' — Gandhi ✊",
      b:"Seja o profissional bilíngue que o Brasil precisa. Gandhi também dizia: comece pela mudança em si mesmo." },
    { t:"🧬 Seu cérebro no almoço:",
      b:"Aprender algo novo depois de comer é até 20% mais eficaz — o metabolismo alimenta o aprendizado!" },
    { t:"💼 Dica profissional:",
      b:"'Per your request' = conforme solicitado. 'Please find attached' = segue em anexo. Use no e-mail de hoje!" },
    { t:"🚢 Porto de Santos:",
      b:"O maior porto da América Latina movimenta US$ 30 bilhões por ano. Toda essa negociação acontece em inglês." },
    { t:"📊 Dado impactante:",
      b:"Brasil tem apenas 5% da população com inglês fluente. Quem está no grupo sai na frente sempre." },
  ],

  // ── 15h BRT — TARDE: phrasal verbs, ciência, frases de personagens ──────────
  "15": [
    { t:"💡 PHRASAL VERB",
      b:"'Give up' = desistir. 'Give in' = ceder. 'Give out' = distribuir. Uma palavra, 3 destinos diferentes!" },
    { t:"💡 PHRASAL VERB",
      b:"'Turn on' liga. 'Turn off' desliga. 'Turn up' aparece do nada. 'Turn down' recusa. Contexto muda tudo!" },
    { t:"💡 PHRASAL VERB",
      b:"'Pick up' = buscar alguém, aprender algo novo, ou atender o telefone. Contexto é rei no inglês!" },
    { t:"💡 PHRASAL VERB",
      b:"'Run out of' = ficar sem. 'Run into' = encontrar por acaso. 'Run away' = fugir. Três histórias, um verbo." },
    { t:"💡 PHRASAL VERB",
      b:"'Stand out' = se destacar. Profissionais bilíngues se destacam automaticamente no mercado." },
    { t:"💡 PHRASAL VERB",
      b:"'Break down' = quebrar/entrar em colapso. 'Break out' = escapar. 'Break through' = superar barreiras!" },
    { t:"💡 PHRASAL VERB",
      b:"'Look up' = pesquisar. 'Look out' = cuidado! 'Look after' = cuidar de. 'Look into' = investigar." },
    { t:"🔬 Ciência do aprendizado:",
      b:"Repetição espaçada é 2x mais eficaz que estudar muito de uma vez — e o cérebro adora esse padrão!" },
    { t:"🧠 Neurolinguística:",
      b:"Pessoas bilíngues têm mais matéria cinzenta no córtex pré-frontal — área de tomada de decisão!" },
    { t:"'You shall not pass!' — Gandalf 🧙",
      b:"Sem inglês, muitas oportunidades ficam bloqueadas. Quebra essa barreira uma palavra por vez." },
    { t:"'Why so serious?' — Coringa 🃏",
      b:"Aprender inglês pode ser divertido — phrasal verbs, false friends, etimologias. Linguística é fascinante!" },
    { t:"🔬 Dado científico:",
      b:"Crianças bilíngues desenvolvem mais empatia — alternar idiomas treina ver perspectivas diferentes!" },
    { t:"💼 Inglês do trabalho:",
      b:"'On the same page' = alinhados. 'Touch base' = contato rápido. 'Circle back' = retomar depois." },
    { t:"'The only way to do great work is to love what you do.' — Steve Jobs 💻",
      b:"Ame o processo de aprender inglês. Cada missão é um passo no trabalho dos seus sonhos." },
    { t:"🧬 Neuroplasticidade:",
      b:"Seu cérebro muda fisicamente quando você aprende uma nova língua. Hoje ele muda de novo!" },
    { t:"💡 PHRASAL VERB",
      b:"'Put off' = adiar. 'Put up with' = tolerar. 'Put on' = vestir. 'Put out' = apagar. Quatro histórias, um verbo." },
    { t:"📅 Curiosidade histórica:",
      b:"Após 1066, o inglês absorveu o francês — por isso tem 'beef' (bœuf) mas a vaca é 'cow'!" },
    { t:"🎯 James Clear — Atomic Habits:",
      b:"'Você não sobe ao nível dos seus objetivos, cai ao nível dos seus hábitos.' Hábitos de inglês importam." },
    { t:"'It's not who I am underneath, but what I do that defines me.' — Batman 🦇",
      b:"O que define seu inglês é o que você pratica, não o que você planeja." },
    { t:"💡 PHRASAL VERB",
      b:"'Set up' = montar/configurar. 'Set off' = partir. 'Set out' = sair com objetivo. A diferença importa muito!" },
  ],

  // ── 19h BRT — STREAK: hábito e ciência da consistência ──────────────────────
  "19": [
    { t:"🔥 Streak em dia?",
      b:"Pesquisa de Harvard: quem mantém streaks de aprendizado tem 3x mais chance de atingir seus objetivos." },
    { t:"⚡ Fim de tarde produtivo:",
      b:"Aprender algo novo após o trabalho libera dopamina e reduz estresse. Uma missão equivale a um descanso ativo." },
    { t:"🧠 Neurociência do hábito:",
      b:"21 dias de prática diária criam um hábito automático. Qual é o seu dia na sequência hoje?" },
    { t:"🎯 James Clear diz:",
      b:"'Cada ação é um voto para o tipo de pessoa que você quer se tornar.' Vote em bilíngue hoje." },
    { t:"🔥 Duolingo mandaria isso:",
      b:"'Don't break the streak!' A ciência concorda: consistência diária supera maratonas semanais." },
    { t:"'I am inevitable.' — Thanos ♾️",
      b:"Sua fluência em inglês também é inevitável — se você praticar todo dia. A questão é quando, não se." },
    { t:"⭐ Uma sessão = um hábito",
      b:"Pesquisa de Harvard: quem mantém streaks tem 3x mais chance de atingir seus objetivos. Todo dia conta." },
    { t:"💪 Não quebre a corrente!",
      b:"Jerry Seinfeld sobre hábitos: 'Don't break the chain.' Cada dia na sequência constrói algo real." },
    { t:"'In every day, there are 1,440 minutes.' — Les Brown ⏰",
      b:"Você precisa de só 5 desses para uma missão completa. A questão é: vai usar esses 5 minutos?" },
    { t:"⚡ Ciência da dopamina:",
      b:"Dopamina é liberada quando você completa uma tarefa. Uma missão = prazer real no cérebro. Sério!" },
    { t:"🎯 Seu futuro eu agradece",
      b:"cada dia que você não desistiu. A fluência é construída em dias comuns, não em grandes momentos." },
    { t:"'Keep moving forward.' — Walt Disney 🏰",
      b:"Continue. Uma sessão por dia. Seu inglês cresce sem você perceber — e um dia você olha pra trás surpreso." },
    { t:"🔥 Faltam horas!",
      b:"O dia ainda não acabou. 21 dias fazem um hábito, 90 dias fazem uma transformação. Hoje conta!" },
    { t:"'Impossible is just an opinion.' — Paulo Coelho ✍️",
      b:"Inglês fluente não é impossível — é questão de tempo e consistência. Os fluentes só não desistiram." },
  ],

  // ── 21h30 BRT — ÚLTIMA CHANCE: ciência do sono + consistência ───────────────
  "21": [
    { t:"🌙 Ciência do sono:",
      b:"Seu cérebro consolida o que aprendeu enquanto dorme. Praticar inglês agora = memorização mais eficiente!" },
    { t:"🔬 Neurologia do sono:",
      b:"O hipocampo processa memórias durante o sono REM. O que você revisar agora, amanhã você lembra melhor." },
    { t:"🌙 Antes de dormir:",
      b:"Revisão noturna fixa memória 2x mais rápido segundo pesquisadores da Universidade de Notre Dame." },
    { t:"'I'll be back.' — Schwarzenegger 🤖",
      b:"O dia volta amanhã. Mas streaks quebrados não voltam sozinhos. Vale a pena manter a sequência." },
    { t:"⚠️ Último slot do dia:",
      b:"Após o sono, seu cérebro consolida exatamente o que você praticou. Uma sessão agora tem efeito duplo." },
    { t:"🌙 Boa noite em inglês:",
      b:"'Good night, sleep tight, don't let the bedbugs bite!' — expressão clássica que os filhos de nativos ouvem." },
    { t:"'Just one more.' — todo gamer 🎮",
      b:"Só uma missão a mais antes de dormir. O cérebro vai consolidar ela durante o sono REM." },
    { t:"⏰ O relógio não para.",
      b:"Mas você pode, depois de uma sessão. Ciência: aprender antes de dormir otimiza a consolidação da memória." },
    { t:"'You can sleep when you're dead.' — dito popular 😅",
      b:"Brincadeira! Mas uma sessão antes de dormir tem efeito científico real na fixação do aprendizado." },
    { t:"🔥 Sequência de dias:",
      b:"Profissionais que praticam inglês todos os dias chegam à fluência em média 8 meses. Cada dia conta." },
    { t:"💡 Curiosidade noturna:",
      b:"'Dream' pode ser sonho ou devaneio. 'Nightmare' vem de 'night mare' — um espírito maligno medieval!" },
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
      { id:"open", text:"Abrir o app 🚀", url:"https://app.viclanguage.com.br" }
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
