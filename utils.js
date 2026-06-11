// utils.js — VIC English — pure utilities, no app state dependencies

// Quadratic curve: level L requires (L-1)² × 100 total XP
// Level 1: 0–99 | Level 2: 100–399 | Level 3: 400–899 | Level 5: 1600–2499 | Level 10: 8100+
export const calcLevel = xp => Math.floor(Math.sqrt(Math.max(xp,0) / 100)) + 1;

export const stripEmoji = s =>
  (s||"").replace(/[\u{1F300}-\u{1FFFF}]/gu,'').replace(/[\u2600-\u27FF]/gu,'').replace(/[#*0-9]\uFE0F?\u20E3/gu,'').replace(/\s+/g,' ').trim();

export const cleanEnunciado = t => stripEmoji(t||"");

// Fisher-Yates shuffle
export function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

export function vibrate(ms=30){
  try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){}
}
