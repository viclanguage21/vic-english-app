// brand-whitelabel.js — Template para clientes white-label
// Instruções:
//   1. Copie este arquivo e renomeie para brand.js na pasta do cliente
//   2. Substitua os valores abaixo com a identidade da empresa cliente
//   3. Coloque o logo do cliente na pasta e atualize os caminhos
//   4. Ajuste a lista de segments para mostrar só os relevantes ao cliente

window.BRAND = {
  // ── Identidade ────────────────────────────────────────────────────────────────
  appName:     "Hotel English",           // Nome que aparece no título e telas
  tagline:     "Inglês para Hotelaria",   // Subtítulo
  companyName: "Grand Plaza Hotels",      // Nome da empresa cliente

  // ── Logos ────────────────────────────────────────────────────────────────────
  // Substitua pelos arquivos de imagem do cliente
  logos: {
    main:   "logo.png",         // Logo principal (onboarding, auth) — recomendado: 300x120px
    header: "logo_header.png",  // Header do dashboard — recomendado: 200x60px
    icon:   "logo_icon.png",    // Ícone pequeno/marca — recomendado: 64x64px
    lamp:   "logo.png",         // Mascote/rodapé — pode ser o logo principal
    speech: "logo.png",         // Logo secundária — pode ser o logo principal
    ob:     "logo.png",         // Slide de boas-vindas — recomendado: 220x220px
  },

  // ── Fonte ────────────────────────────────────────────────────────────────────
  // Escolha uma fonte do Google Fonts. Exemplos:
  //   Poppins: https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap
  //   Nunito:  https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap
  //   Lato:    https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap
  font: {
    family:    "'Poppins', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap",
  },

  // ── Cores ────────────────────────────────────────────────────────────────────
  // Tema limpo e branco. Troque --p e --p-hi pela cor primária da empresa.
  colors: {
    // Fundos (branco/claro)
    "--bg":  "#ffffff",
    "--bg2": "#f5f7fa",
    "--s":   "#eef1f6",
    "--s2":  "#e4e8ef",
    "--s3":  "#d8dde8",

    // Bordas (usando a cor primária com opacidade)
    "--rim":  "rgba(30,64,175,0.08)",
    "--rim2": "rgba(30,64,175,0.15)",
    "--rim3": "rgba(30,64,175,0.30)",

    // Cor primária da empresa — troque #1e40af pela cor do cliente
    "--p":        "#1e40af",
    "--p-hi":     "#2563eb",
    "--p-bright": "#3b82f6",
    "--p-light":  "#60a5fa",
    "--p-glow":   "rgba(30,64,175,0.25)",
    "--p-dim":    "rgba(30,64,175,0.10)",
    "--p-deep":   "rgba(30,64,175,0.05)",

    // Acento secundário
    "--purple":       "#6366f1",
    "--purple-light": "#818cf8",
    "--purple-dim":   "rgba(99,102,241,0.15)",

    // Texto (escuro para fundo claro)
    "--ink":       "#0f172a",
    "--ink-soft":  "#475569",
    "--ink-muted": "#94a3b8",

    // Sombra mais suave pro tema claro
    "--sh": "0 4px 24px rgba(0,0,0,0.08)",

    // Desativa o glow de fundo (fica estranho em tema claro)
    "--bg-overlay": "none",

    // Fonte
    "--font": "'Poppins', sans-serif",
  },

  // ── Segmentos visíveis ───────────────────────────────────────────────────────
  // Coloque aqui só os IDs dos segmentos relevantes pro cliente.
  // null = mostra todos.
  // IDs disponíveis: "maritimo", "hotelaria", "comex", "offshore",
  //                  "aeroporto", "corporativo", "restaurantes",
  //                  "cruzeiros", "transporte", "saude", "varejo"
  segments: ["hotelaria", "corporativo"],

  // ── Contato ──────────────────────────────────────────────────────────────────
  contact: {
    whatsapp: "5511999999999",  // WhatsApp do cliente para suporte
  },
};

// Aplica as customizações imediatamente (antes do DOM renderizar)
(function(){
  var B = window.BRAND;

  // 1. Cores — injeta CSS vars
  if(B.colors){
    var root = document.documentElement;
    Object.keys(B.colors).forEach(function(k){
      root.style.setProperty(k, B.colors[k], 'important');
    });
    var s = document.createElement("style");
    s.id = "brand-extra";
    s.textContent = [
      "body::before{display:none!important;}",
      ".bg-glow{display:none!important;}",
      ".ob-slide-title{color:#0f172a!important;}",
      ".ob-slide-sub{color:#475569!important;}",
      ".ob-tag{background:rgba(30,64,175,0.08)!important;color:var(--p)!important;border-color:rgba(30,64,175,0.2)!important;}",
      ".ob-btn-next,.btn-primary{background:linear-gradient(135deg,var(--p),var(--p-hi))!important;color:#fff!important;}",
      ".ob-btn-skip,.ob-skip-all{color:#64748b!important;}",
      ".auth-tagline,.auth-tagline-pt{color:#475569!important;}",
      ".auth-tab{color:#64748b!important;}",
      ".auth-tab.active{color:var(--p)!important;border-color:var(--p)!important;}",
      ".auth-input{background:#f5f7fa!important;border-color:#e4e8ef!important;color:#0f172a!important;}",
      ".auth-input::placeholder{color:#94a3b8!important;}",
      ".auth-label{color:#475569!important;}",
      ".btn-google{background:#f5f7fa!important;color:#0f172a!important;border-color:#e4e8ef!important;}",
      ".greeting-hi,.greeting-name{color:#0f172a!important;}",
      ".greeting-sub{color:#475569!important;}",
      ".dash-date{color:#64748b!important;}",
      ".segment-card{background:#f5f7fa!important;border-color:#e4e8ef!important;}",
      ".seg-name{color:#0f172a!important;}",
    ].join("");
    document.head.appendChild(s);
  }

  // 2. Fonte
  if(B.font && B.font.googleUrl){
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = B.font.googleUrl;
    document.head.appendChild(link);
  }

  // 3. Título
  document.title = B.appName + " — " + B.tagline;
})();
