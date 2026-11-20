// The three rival toads for air hockey, drawn as collectible cards: the Dreamer (easy), the Coach (medium),
// the Champion (hard). Pure markup builders; every word comes from the catalog.
const NS='http://www.w3.org/2000/svg';
const svg=(markup,label)=>{const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 120 110');s.setAttribute('aria-hidden','true');s.innerHTML=markup;if(label)s.setAttribute('aria-label',label);return s;};

const BODY=(g1,g2,id)=>`<defs><radialGradient id="tb${id}" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></radialGradient>
<radialGradient id="tl${id}" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="#F4F7D8"/><stop offset="1" stop-color="#C9DCA0"/></radialGradient></defs>
<ellipse cx="60" cy="100" rx="38" ry="6" fill="#000" opacity=".28"/>
<ellipse cx="60" cy="74" rx="40" ry="28" fill="url(#tb${id})" stroke="#1E3A1C" stroke-width="2"/>
<ellipse cx="60" cy="82" rx="24" ry="15" fill="url(#tl${id})"/>
<ellipse cx="30" cy="96" rx="11" ry="6" fill="url(#tb${id})" stroke="#1E3A1C" stroke-width="2"/><ellipse cx="90" cy="96" rx="11" ry="6" fill="url(#tb${id})" stroke="#1E3A1C" stroke-width="2"/>
<circle cx="40" cy="46" r="15" fill="url(#tb${id})" stroke="#1E3A1C" stroke-width="2"/><circle cx="80" cy="46" r="15" fill="url(#tb${id})" stroke="#1E3A1C" stroke-width="2"/>
<circle cx="34" cy="74" r="5" fill="#F49A9A" opacity=".55"/><circle cx="86" cy="74" r="5" fill="#F49A9A" opacity=".55"/>`;
const OPEN=`<circle cx="40" cy="46" r="9" fill="#FFFDF0"/><circle cx="80" cy="46" r="9" fill="#FFFDF0"/><circle cx="41" cy="47" r="5.5" fill="#1A1414"/><circle cx="81" cy="47" r="5.5" fill="#1A1414"/><circle cx="43" cy="44" r="2" fill="#FFF"/><circle cx="83" cy="44" r="2" fill="#FFF"/>`;

const ART={
  // sleepy: night cap, closed eyes, a floating z
  easy:BODY('#9ED67A','#4E9A44','e')+`<path d="M32 47 q8 6 16 0 M72 47 q8 6 16 0" stroke="#1A1414" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M48 76 q12 7 24 0" stroke="#1E3A1C" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M58 33 C60 12 88 8 100 18 C92 20 86 26 84 34 Z" fill="#7A8AD8" stroke="#3A4A8A" stroke-width="2"/><circle cx="101" cy="18" r="5" fill="#FFF8E0" stroke="#3A4A8A" stroke-width="1.5"/>
<path d="M56 34 Q72 28 88 35" stroke="#FFF8E0" stroke-width="5" fill="none" stroke-linecap="round"/>
<text x="104" y="44" font-family="Bricolage Grotesque,sans-serif" font-weight="800" font-size="13" fill="#C8D4FF">z</text><text x="112" y="34" font-family="Bricolage Grotesque,sans-serif" font-weight="800" font-size="9" fill="#C8D4FF">z</text>`,
  // coach: cap, whistle, a confident smile
  medium:BODY('#7FC86A','#3A8A3A','m')+OPEN+`<path d="M46 74 q14 10 28 0" stroke="#1E3A1C" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M24 38 C26 20 94 20 96 38 Z" fill="#2E6AC8" stroke="#1A3A7A" stroke-width="2"/><path d="M90 36 q16 2 22 8 q-14 2 -24 -2 Z" fill="#2E6AC8" stroke="#1A3A7A" stroke-width="2"/><circle cx="60" cy="24" r="3" fill="#FFF"/>
<path d="M60 86 L74 96" stroke="#E8E2D0" stroke-width="1.6"/><rect x="72" y="93" width="12" height="7" rx="3" fill="#D8D8E0" stroke="#6A6A7A" stroke-width="1.4"/>`,
  // champion: crown, determined brows, gold belt
  hard:BODY('#6AC05A','#2A7030','h')+OPEN+`<path d="M30 33 l18 6 M90 33 l-18 6" stroke="#1A1414" stroke-width="3.2" stroke-linecap="round"/>
<path d="M48 76 q12 -6 24 0" stroke="#1E3A1C" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M38 26 L44 8 L54 20 L60 4 L66 20 L76 8 L82 26 Z" fill="#FFD24A" stroke="#8A5408" stroke-width="2" stroke-linejoin="round"/><circle cx="60" cy="18" r="3" fill="#E8443A"/><circle cx="46" cy="20" r="2" fill="#5EC4E8"/><circle cx="74" cy="20" r="2" fill="#5EC4E8"/>
<path d="M22 84 Q60 98 98 84 L98 90 Q60 104 22 90 Z" fill="#E8B23A" stroke="#8A5408" stroke-width="1.6"/><rect x="51" y="86" width="18" height="11" rx="3" fill="#FFE58A" stroke="#8A5408" stroke-width="1.6"/>`,
};
export const toadArt=(level,label)=>svg(ART[level]??ART.medium,label);

import {TOAD_CARD_ART} from './toad-card-art.js';

// The approved collectible cards (COMMON · EASY +1, RARE · MEDIUM +3, LEGENDARY · HARD +6), swiped side by side;
// tapping one starts the match. Texts come from the catalog into the card's slots.
export function createToadPicker({el,button,t,copy,choose,game='hockey'}){
  const box=el('div',undefined,'rival-picker');
  const title=el('p',()=>t('game.hockey.pick'),'rival-title');
  const row=el('div',undefined,'rival-cards');row.setAttribute('role','list');
  for(const level of ['easy','medium','hard']){
    const card=button(undefined,()=>choose(level),'rival-card rival-'+level);card.dataset.level=level;card.setAttribute('role','listitem');
    const art=el('span',undefined,'toad-card-art');art.innerHTML=TOAD_CARD_ART[level];
    const slot=(k,fn)=>{const n=art.querySelector(`[data-t="${k}"]`);if(n)copy(n,fn);};
    slot('tag',()=>t('game.toad.tag.'+level));slot('reward',()=>t('game.toad.reward.'+level));
    slot('name',()=>t('game.hockey.level.'+level+'.name'));slot('desc',()=>t('game.toad.desc.'+game+'.'+level));
    for(const k of ['speed','reflex','tricks'])slot(k,()=>t('game.toad.stat.'+k));
    card.append(art);
    copy(card,()=>t('game.hockey.level.'+level+'.name')+'. '+t('game.toad.desc.'+game+'.'+level)+' '+t('game.toad.reward.'+level),'aria-label');
    row.append(card);
  }
  box.append(title,row,el('p',()=>t('game.toad.swipe'),'rival-hint'));
  return box;
}
