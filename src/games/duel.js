// Word duel and the decks it uses: the pure parts (no DOM, no network), unit-tested in scripts/games.test.mjs.
export const DUEL_SIZE=7,DUEL_SECONDS=10,DUEL_DECKS=Object.freeze(['it','ve','tn']);

// A small seeded random source, so both phones build the same choices for the same round.
export function seeded(seed){
  let h=1779033703^String(seed).length;
  for(const ch of String(seed)){h=Math.imul(h^ch.charCodeAt(0),3432918353);h=h<<13|h>>>19;}
  let a=h>>>0;
  return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
export function shuffle(list,random=Math.random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// Meanings show in your app language, except in the deck's own language, where English helps more.
export const meaningLang=(deck,lang)=>(deck==='it'&&lang==='it')||(deck==='tn'&&lang==='aeb-TN')?'en':lang;

export function pickItems(cards,deck,n=DUEL_SIZE,random=Math.random){
  return shuffle(cards.filter(c=>c.deck===deck),random).slice(0,n).map(c=>c.id);
}

// Words of a meaning, for telling close meanings apart ("great, cool" and "great!" share "great").
const parts=text=>String(text).toLowerCase().replace(/\([^)]*\)/g,' ').split(/[,;/]/)
  .map(x=>x.replace(/[!¡?¿.…'’"«»]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
export function closeMeanings(a,b){const pa=new Set(parts(a));return parts(b).some(x=>pa.has(x));}

// Four choices for one card: the right meaning and three others from the same deck, other themes first,
// never one that could also be right. The order and the other cards come from the seed.
export function choices(card,cards,lang,seed){
  const random=seeded(seed+':'+card.id),ml=meaningLang(card.deck,lang),right=card.meaning[ml];
  const pool=cards.filter(c=>c.deck===card.deck&&c.id!==card.id&&!closeMeanings(c.meaning[ml],right));
  const other=shuffle(pool.filter(c=>c.theme!==card.theme),random),same=shuffle(pool.filter(c=>c.theme===card.theme),random);
  const picked=[];
  for(const c of [...other,...same]){if(picked.length===3)break;if(picked.every(p=>!closeMeanings(p.meaning[ml],c.meaning[ml])))picked.push(c);}
  return shuffle([{id:card.id,text:right,correct:true},...picked.map(c=>({id:c.id,text:c.meaning[ml],correct:false}))],random);
}

// Picks are 1 right, 0 wrong, -1 out of time. Same score: the faster total time wins.
export const duelScore=picks=>picks.filter(p=>p===1).length;
export function duelOutcome(mine,theirs){
  if(!mine||!theirs)return null;
  if(mine.score!==theirs.score)return mine.score>theirs.score?'won':'lost';
  if(mine.ms==null||theirs.ms==null||mine.ms===theirs.ms)return 'tie';
  return mine.ms<theirs.ms?'tieYou':'tieThem';
}
// The words for an outcome: which catalog key, with exactly the parameters it uses.
export function outcomeText(outcome,mine,theirs,name){
  const key='duel.'+(outcome==='tie'?'tieThem':outcome),p={me:mine.score,them:theirs.score};
  return [key,outcome==='won'||outcome==='tieYou'?p:{...p,name}];
}
