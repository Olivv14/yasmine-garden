// Points, the week's scoreboard and seeds for the garden, computed from what the server saved.
// Pure (no DOM, no network), unit-tested in scripts/games.test.mjs.
import {duelOutcome} from './duel.js';

const time=v=>{const n=Date.parse(v??'');return Number.isFinite(n)?n:0;};
export const ROUND_DAYS=14,SEED_POINTS=10,STARTER_SEEDS=3;

// Monday 00:00 on this phone's clock.
export function weekStart(now=Date.now()){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getTime();}

export const answersOf=(snap,roundId)=>(snap?.playAnswers??[]).filter(a=>a.round_id===roundId);

// Every point with who earned it and when:
// a truth or dare turn 1; a hockey game 1 each and 2 more for the winner; against the toad 1, and 2 more for a win;
// a word duel 1 per right word and 2 more for the winner; know me 1 for answering about yourself, 1 per right guess.
export function pointEvents(snap){
  const out=[],members=(snap?.members??[]).map(m=>m.profile_id);
  const add=(who,points,at)=>{if(who&&points>0)out.push({who,points,at:typeof at==='number'?at:time(at)});};
  for(const e of snap?.gameEvents??[]){
    if(e.game==='truth_dare'&&e.kind!=='finish')add(e.profile_id,1,e.created_at);
    if(e.game==='hockey'&&e.kind==='finish'){
      const other=members.find(id=>id!==e.profile_id);
      add(e.profile_id,1+(e.score_me>e.score_partner?2:0),e.created_at);add(other,1+(e.score_partner>e.score_me?2:0),e.created_at);
    }
    if(e.game==='hockey_bot'&&e.kind==='finish')add(e.profile_id,1+(e.score_me>e.score_partner?2:0),e.created_at);
  }
  for(const r of snap?.playRounds??[]){
    const answers=answersOf(snap,r.id);
    for(const a of answers){
      if(a.role==='player'||a.role==='guess')add(a.profile_id,a.score??0,a.created_at);
      if(a.role==='self')add(a.profile_id,1,a.created_at);
    }
    if(r.game==='word_duel'&&answers.length===2){
      const [a,b]=answers,at=Math.max(time(a.created_at),time(b.created_at)),o=duelOutcome(a,b);
      if(o==='won'||o==='tieYou')add(a.profile_id,2,at);else if(o==='lost'||o==='tieThem')add(b.profile_id,2,at);else{add(a.profile_id,1,at);add(b.profile_id,1,at);}
    }
  }
  return out;
}
export function pointsBy(snap,since=0){
  const totals=new Map((snap?.members??[]).map(m=>[m.profile_id,0]));
  for(const p of pointEvents(snap))if(p.at>=since)totals.set(p.who,(totals.get(p.who)??0)+p.points);
  return totals;
}
// Seeds: three to start, one more every 10 points; each flower you plant uses one.
export function seeds(snap,me){
  const earned=STARTER_SEEDS+Math.floor((pointsBy(snap).get(me)??0)/SEED_POINTS);
  const used=(snap?.flowers??[]).filter(f=>f.planted_by===me).length;
  return {earned,used,left:Math.max(0,earned-used)};
}
// Rounds your partner started that wait for you (two weeks at most), newest first.
export function waitingForMe(snap,me,now=Date.now()){
  return (snap?.playRounds??[]).filter(r=>r.started_by!==me&&now-time(r.created_at)<ROUND_DAYS*86400000
    &&!answersOf(snap,r.id).some(a=>a.profile_id===me)).sort((a,b)=>time(b.created_at)-time(a.created_at));
}
// Rounds you started that your partner has not played yet.
export function waitingForThem(snap,me,now=Date.now()){
  return (snap?.playRounds??[]).filter(r=>r.started_by===me&&now-time(r.created_at)<ROUND_DAYS*86400000
    &&answersOf(snap,r.id).length<2).sort((a,b)=>time(b.created_at)-time(a.created_at));
}
// Finished rounds, newest first, for the history.
export function finishedRounds(snap){
  return (snap?.playRounds??[]).filter(r=>answersOf(snap,r.id).length===2)
    .map(r=>({round:r,at:Math.max(...answersOf(snap,r.id).map(a=>time(a.created_at)))})).sort((a,b)=>b.at-a.at);
}
