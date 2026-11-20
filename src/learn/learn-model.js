// Learn, pure (scripts/learn.test.mjs): cards from the app's decks and from words your partner taught you, spaced
// repetition with FSRS (ts-fsrs), today's session, the exercise for each card, checking a typed answer, the word of
// the day and your XP. The server (backend/014) keeps each card's state; this decides what comes next.
import {fsrs,createEmptyCard,Rating,State,generatorParameters} from 'ts-fsrs';
import {meaningLang,seeded,shuffle,closeMeanings} from '../games/duel.js';

export const NEW_PER_DAY=8,SESSION=12;
export const RATING=Object.freeze({again:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy});
const scheduler=fsrs(generatorParameters({enable_fuzz:false,maximum_interval:365}));
export const DECK_LANG=Object.freeze({it:'it',ve:'es-VE',tn:'ar-TN'});

// A word your partner taught you (a Talk message of kind 'word') as a card.
export function teachCard(m){
  const p=m?.payload;if(!p?.word||!p?.meaning)return null;
  return {id:'w:'+m.id,deck:'w',theme:'teach',word:String(p.word),say:p.say??'',meaning:{any:String(p.meaning)},lang:p.lang??'',from:m.sender_id,message:m.id,at:m.created_at};
}
// The meaning shown to you: your language, or the one that makes sense for this deck; taught words have one meaning.
export const meaningOf=(card,lang)=>card.meaning.any??card.meaning[meaningLang(card.deck,lang)]??card.meaning.en??'';

// Card states from the server rows (yours), revived for ts-fsrs.
export function revive(row){
  if(!row)return null;
  return {due:new Date(row.due),stability:+row.stability,difficulty:+row.difficulty,elapsed_days:+row.elapsed_days,scheduled_days:+row.scheduled_days,
    learning_steps:+(row.learning_steps??0),reps:+row.reps,lapses:+row.lapses,state:+row.state,last_review:row.last_review?new Date(row.last_review):undefined};
}
export function stateMap(rows,me){const m=new Map();for(const r of rows??[])if(r.profile_id===me)m.set(r.card_key,revive(r));return m;}
// What the server saves after a review.
export const serialize=card=>({due:card.due.toISOString(),stability:card.stability,difficulty:card.difficulty,elapsed_days:card.elapsed_days,
  scheduled_days:card.scheduled_days,learning_steps:card.learning_steps??0,reps:card.reps,lapses:card.lapses,state:card.state,last_review:card.last_review?card.last_review.toISOString():null});

export function review(state,rating,now=new Date()){return scheduler.next(state??createEmptyCard(now),now,rating).card;}
// How long until the card comes back, for each answer (shown under the four buttons).
export function previews(state,now=new Date()){const r=scheduler.repeat(state??createEmptyCard(now),now);
  return Object.fromEntries(Object.entries(RATING).map(([k,v])=>[k,r[v].card.due.getTime()-now.getTime()]));}

const dayOf=d=>{const x=new Date(d);return x.getFullYear()*10000+(x.getMonth()+1)*100+x.getDate();};
// Today's session: cards that are due (most overdue first), then a few new ones (your partner's words first).
export function session(cards,states,{now=new Date(),newToday=0,size=SESSION,newPerDay=NEW_PER_DAY,random=Math.random}={}){
  const due=cards.filter(c=>states.has(c.id)&&states.get(c.id).due<=now).sort((a,b)=>states.get(a.id).due-states.get(b.id).due);
  const fresh=cards.filter(c=>!states.has(c.id));
  const teach=fresh.filter(c=>c.deck==='w'),rest=shuffle(fresh.filter(c=>c.deck!=='w'),random);
  const room=Math.max(0,Math.min(newPerDay-newToday,size-due.length));
  return [...due.slice(0,size),...[...teach,...rest].slice(0,room)];
}
// New cards started today (first review today).
export const startedToday=(rows,me,now=new Date())=>(rows??[]).filter(r=>r.profile_id===me&&+r.reps>=1&&r.last_review&&+r.reps<=2&&dayOf(r.last_review)===dayOf(now)&&+r.state!==State.Review).length;

// The exercise: a new card is shown first; then choose, type or listen (listen only where this phone can read it aloud,
// or there is your partner's voice).
export function modeFor(card,state,{canSpeak=false,hasVoice=false,seed='x'}={}){
  if(!state||state.reps===0)return 'intro';
  const options=['choice','type'];if(canSpeak||hasVoice)options.push('listen');
  if(state.state===State.Learning||state.state===State.Relearning)return 'choice';
  return options[Math.floor(seeded(seed+':'+card.id+':'+state.reps)()*options.length)];
}
// Four meanings to choose from, the right one among them (same deck, no near-twins).
export function choiceSet(card,cards,lang,seed){
  const random=seeded(seed+':'+card.id),right=meaningOf(card,lang);
  const pool=cards.filter(c=>c.id!==card.id&&(card.deck==='w'||c.deck===card.deck)&&!closeMeanings(meaningOf(c,lang),right)&&meaningOf(c,lang));
  const picked=[];for(const c of shuffle(pool,random)){if(picked.length===3)break;if(picked.every(p=>!closeMeanings(meaningOf(p,lang),meaningOf(c,lang))))picked.push(c);}
  return shuffle([{id:card.id,text:right,correct:true},...picked.map(c=>({id:c.id,text:meaningOf(c,lang),correct:false}))],random);
}
// Typing the word: accents, articles, capitals and punctuation do not matter; one small typo is forgiven.
const ARTICLES=/^(il|lo|la|i|gli|le|l'|un|una|uno|un'|el|los|las|el-|al-|ال)\s*/;
export function normalize(text){
  return String(text??'').toLowerCase().normalize('NFD').replace(/[̀-ًͯ-ْ]/g,'').replace(/[’`´]/g,"'")
    .replace(/[!?¡¿.,;:"()]/g,'').trim().replace(ARTICLES,'').replace(/\s+/g,' ').trim();
}
function distance(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
export function checkTyped(card,typed){
  const want=String(card.roman||card.word).split(/[,/،]/).map(normalize).filter(Boolean),got=normalize(typed);if(!got)return 'wrong';
  if(want.includes(got))return 'right';
  if(want.some(w=>w.length>=5&&distance(w,got)===1))return 'almost';
  return 'wrong';
}
// The answer becomes a rating: right and quick is good, slow is hard, almost is hard, wrong is again.
export function ratingFor(result,ms){if(result==='wrong')return Rating.Again;if(result==='almost')return Rating.Hard;return ms>12000?Rating.Hard:Rating.Good;}
// Word of the day: the same for both of you, from the deck you are learning.
export function wordOfDay(cards,now=new Date()){if(!cards.length)return null;const n=dayOf(now);return cards[Math.floor(seeded('wod:'+n)()*cards.length)];}
// Your numbers: XP (reviews), cards learned (out of the learning steps), and due now.
export function stats(cards,states,now=new Date()){
  let xp=0,learned=0,due=0;const ids=new Set(cards.map(c=>c.id));
  for(const [id,s] of states){if(!ids.has(id))continue;xp+=s.reps;if(s.state===State.Review)learned++;if(s.due<=now)due++;}
  return {xp,learned,due,total:cards.length};
}
