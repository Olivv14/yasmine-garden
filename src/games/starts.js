// The first screens of the games (mockup "Game start screens"): a picture of the game, big ways to play, and your
// own numbers. Pictures are drawn here without words; every word comes from the catalog.
const NS='http://www.w3.org/2000/svg';
export function art(viewBox,body,cls=''){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox',viewBox);s.setAttribute('aria-hidden','true');if(cls)s.setAttribute('class',cls);s.innerHTML=body;return s;}

export const ART={
  brazier:['0 0 60 56','<path d="M0 30h60l-6 22H6z" fill="#B5844A"/><path d="M30 0c8 10 20 14 20 26a20 12 0 0 1-40 0c0-12 12-16 20-26z" fill="#FF8A3A"/><path d="M30 10c4 6 10 9 10 16a10 7 0 0 1-20 0c0-7 6-10 10-16z" fill="#FFD58A"/>'],
  mild:['0 0 40 40','<path d="M26 6c-2 4-4 4-6 4 4 4 4 18-6 26 14 2 22-8 20-20-1-6-5-8-8-10z" fill="#9FC26A"/>'],
  hot:['0 0 40 40','<path d="M26 6c-2 4-4 4-6 4 4 4 4 18-6 26 14 2 22-8 20-20-1-6-5-8-8-10z" fill="#FF8A3A"/><path d="M14 8c-2 4-4 4-6 4 3 3 3 12-4 18" stroke="#FF8A3A" stroke-width="3" fill="none"/>'],
  harissa:['0 0 40 40','<path d="M10 34h20l-2-14H12z" fill="#C9443A"/><path d="M12 20h16c0-6-4-10-8-10s-8 4-8 10z" fill="#E8644A"/><path d="M20 10V4" stroke="#4A8A3A" stroke-width="3"/>'],
  hockey:['0 0 250 360','<rect x="4" y="4" width="242" height="352" rx="30" fill="#E6F2FF" stroke="#5A6A8A" stroke-width="8"/><rect x="85" y="4" width="80" height="10" fill="#C9443A"/><rect x="85" y="346" width="80" height="10" fill="#1F5FA8"/><path d="M8 180h234" stroke="#C9443A" stroke-width="3"/><circle cx="125" cy="180" r="40" fill="none" stroke="#C9443A" stroke-width="3"/><circle cx="125" cy="80" r="26" fill="#E8644A"/><circle cx="125" cy="80" r="12" fill="#C9443A"/><circle cx="125" cy="290" r="26" fill="#3A86C8"/><circle cx="125" cy="290" r="12" fill="#1F5FA8"/><circle cx="150" cy="200" r="13" fill="#1C1418"/><path d="M150 200l40 -40" stroke="#1C1418" stroke-opacity=".2" stroke-width="10" stroke-linecap="round"/>'],
  pool:['0 0 358 250','<rect width="358" height="250" rx="26" fill="#6A3A1A"/><rect x="18" y="18" width="322" height="214" rx="12" fill="#1E7A4E"/><g fill="#0B0A08"><circle cx="22" cy="22" r="12"/><circle cx="179" cy="18" r="11"/><circle cx="336" cy="22" r="12"/><circle cx="22" cy="228" r="12"/><circle cx="179" cy="232" r="11"/><circle cx="336" cy="228" r="12"/></g><g transform="translate(230 125)"><circle r="10" fill="#F4C430"/><circle cx="17" cy="-10" r="10" fill="#1F5FA8"/><circle cx="17" cy="10" r="10" fill="#C9443A"/><circle cx="34" cy="-20" r="10" fill="#5A3C66"/><circle cx="34" cy="0" r="10" fill="#111"/><circle cx="34" cy="20" r="10" fill="#E8644A"/></g><circle cx="90" cy="125" r="10" fill="#FBF3E4"/><path d="M20 160L80 130" stroke="#E6C08A" stroke-width="6" stroke-linecap="round"/><path d="M100 125h110" stroke="#FFF4E6" stroke-opacity=".4" stroke-width="2" stroke-dasharray="4 6"/>'],
  toad:['0 0 40 34','<ellipse cx="20" cy="22" rx="18" ry="11" fill="#5FA77A"/><circle cx="12" cy="10" r="6" fill="#5FA77A"/><circle cx="28" cy="10" r="6" fill="#5FA77A"/><circle cx="12" cy="10" r="2.6" fill="#1C1418"/><circle cx="28" cy="10" r="2.6" fill="#1C1418"/>'],
};
export const pic=(name,cls)=>art(ART[name][0],ART[name][1],cls);

// a face: the photo when there is one, else the initial
export function face(el,id,{photo,person,cls='gs-face'}){const f=el('span',undefined,cls);const src=photo?.(id);
  if(src){const i=document.createElement('img');i.src=src;i.alt='';f.append(i);}else f.textContent=(person(id)||'?').trim().charAt(0).toUpperCase();return f;}

// wins in live matches (the host records hockey with its own score first; pool records who won)
export function wins(snap,game,me,partner){const out={me:0,them:0};
  for(const e of snap?.gameEvents??[]){if(e.game!==game||e.kind!=='finish'||e.score_me==null||e.score_partner==null||e.score_me===e.score_partner)continue;
    const winner=e.score_me>e.score_partner?e.profile_id:(e.profile_id===me?partner:me);if(winner===me)out.me++;else if(winner===partner)out.them++;}
  return out;}
