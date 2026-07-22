// brand.js — VIC Language (tema padrão)
// Para criar uma versão white-label, copie brand-whitelabel.js e renomeie pra brand.js

window.BRAND = {
  appName:     "VIC English",
  tagline:     "Inglês para Profissionais",
  companyName: "VIC Language",

  logos: {
    main:   "vic_english_logo.png",   // tela de onboarding, auth
    header: "vic_english_header.png", // header do dashboard
    icon:   "vic_logo.png",           // ícone pequeno / marca
    lamp:   "vic_lamp.png",           // mascote / rodapé
    speech: "vic_speech.png",         // logo secundária
    ob:     "logo_full_2.png",        // slide 0 do onboarding
  },

  font:     null,   // null = usa Inter (padrão VIC)
  colors:   null,   // null = usa tema roxo VIC (padrão)
  segments: null,   // null = mostra todos os segmentos

  contact: {
    whatsapp: "5511943644477",
  },
};

// Aplica as customizações imediatamente (antes do DOM renderizar)
(function(){
  var B = window.BRAND;

  // 1. Cores — injeta CSS vars que sobrescrevem o :root do style.css
  if(B.colors){
    var css = ":root{";
    Object.keys(B.colors).forEach(function(k){ css += k + ":" + B.colors[k] + ";"; });
    css += "}";
    var s = document.createElement("style");
    s.id = "brand-colors";
    s.textContent = css;
    document.head.appendChild(s);
  }

  // 2. Fonte — injeta Google Fonts se definida
  if(B.font && B.font.googleUrl){
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = B.font.googleUrl;
    document.head.appendChild(link);
  }

  // 3. Título da página
  document.title = B.appName + " — " + B.tagline;
})();
