import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TRUTHS,DARES,CARDS,LEVELS,levelOf,cardKey,currentTruthDare,whoseTurn,drawCard,finishedGames,turnsPerFinish,TABLE,clampMallet,step,servePuck} from '../src/games/rules.js';
import {seeded,shuffle,meaningLang,pickItems,closeMeanings,choices,duelScore,duelOutcome,outcomeText,DUEL_SIZE} from '../src/games/duel.js';
import {createTranslator} from '../experience/i18n.mjs';
import {QUESTIONS,questionKey,optionKey,pickQuestions,matches} from '../src/games/knowme.js';
import {weekStart,pointEvents,pointsBy,seeds,waitingForMe,waitingForThem,finishedRounds} from '../src/games/score.js';
import {toadMove,TOAD_LEVELS,crossing} from '../src/games/bot.js';
import {parseDecks} from '../experience/build-decks.mjs';

const at=i=>new Date(Date.UTC(2026,10,15,10,i)).toISOString();
const ev=(i,profile_id,kind,game='truth_dare',card_id)=>({id:'e'+i,profile_id,game,kind,card_id:card_id??(kind==='finish'?null:kind[0]+'01'),created_at:at(i)});

test('three spice levels of ten truths and ten dares, with ids matching the database check',()=>{
  assert.equal(TRUTHS.length,30);assert.equal(DARES.length,30);assert.deepEqual(LEVELS,[1,2,3]);
  for(const id of [...TRUTHS,...DARES])assert.match(id,/^[td][0-9]{2}$/);
  for(const l of LEVELS)for(const k of ['truth','dare']){assert.equal(CARDS[k][l].length,10);assert.ok(CARDS[k][l].every(id=>levelOf(id)===l));}
  assert.equal(cardKey('t03'),'game.truth.t03');assert.equal(cardKey('d30'),'game.dare.d30');
  assert.equal(levelOf('t10'),1);assert.equal(levelOf('d11'),2);assert.equal(levelOf('t21'),3);
});
test('every card and every know-me question has its text in all five languages',async()=>{
  for(const l of ['en','es','fr','it','aeb-TN']){
    const cat=JSON.parse(await readFile(new URL(`../experience/locales/${l}.json`,import.meta.url),'utf8'));
    for(const id of [...TRUTHS,...DARES])assert.ok(cat[cardKey(id)]?.trim(),l+' '+id);
    for(const q of QUESTIONS){assert.ok(cat[questionKey(q)]?.trim(),l+' '+q);for(let i=0;i<4;i++)assert.ok(cat[optionKey(q,i)]?.trim(),l+' '+optionKey(q,i));}
    for(const d of ['it','ve','tn'])assert.ok(cat['duel.deck.'+d]?.trim());
  }
});
test('a spicy draw stays in its level',()=>{
  for(let i=0;i<20;i++){assert.equal(levelOf(drawCard('truth',[],Math.random,3)),3);assert.equal(levelOf(drawCard('dare',[],Math.random,2)),2);}
  assert.equal(levelOf(drawCard('dare',[],()=>0,7)),1,'unknown levels fall back to mild');
});
test('the current game is every turn after the last finish; turns alternate',()=>{
  const events=[ev(1,'o','truth'),ev(2,'y','dare'),ev(3,'y','finish'),ev(4,'y','truth'),ev(5,'x','finish','hockey')];
  const cur=currentTruthDare(events);assert.deepEqual(cur.map(e=>e.id),['e4']);
  assert.equal(whoseTurn([], 'o'),'anyone');assert.equal(whoseTurn(cur,'y'),'partner');assert.equal(whoseTurn(cur,'o'),'me');
});
test('draws skip cards already used in this game, and start over when all are used',()=>{
  const used=TRUTHS.slice(0,9).map((c,i)=>({card_id:c,id:i}));
  assert.equal(drawCard('truth',used,()=>0),'t10');
  assert.ok(TRUTHS.includes(drawCard('truth',TRUTHS.map(c=>({card_id:c})),()=>.99)));
  assert.ok(DARES.includes(drawCard('dare',[],()=>.5)));
});
test('finished games newest first; turns counted per finished game',()=>{
  const events=[ev(1,'o','truth'),ev(2,'y','dare'),ev(3,'o','finish'),ev(4,'y','truth'),ev(5,'o','finish'),{...ev(6,'o','finish','hockey'),score_me:5,score_partner:2}];
  assert.deepEqual(finishedGames(events).map(e=>e.id),['e6','e5','e3']);
  assert.deepEqual([...turnsPerFinish(events)],[['e3',2],['e5',1]]);
});
test('mallets stay inside their own half and the table',()=>{
  assert.deepEqual(clampMallet([-1,0],true),[TABLE.mallet,TABLE.h/2+TABLE.mallet]);
  assert.deepEqual(clampMallet([2,9],false),[TABLE.w-TABLE.mallet,TABLE.h/2-TABLE.mallet]);
});
test('puck bounces off side walls, scores only through the goal mouth, and speed is capped',()=>{
  let r=step([TABLE.puck/2,.8,-1,0],[],.016);assert.ok(r.puck[2]>0,'bounced off the left wall');
  r=step([.5,-.2,0,-1],[],.016);assert.equal(r.scored,'host','through the guest goal');
  r=step([.05,.01,0,-1],[],.016);assert.equal(r.scored,null,'beside the goal it bounces');assert.ok(r.puck[3]>0);
  r=step([.5,1.8,0,1],[],.016);assert.equal(r.scored,'guest');
  r=step([.5,.8,0,0],[{x:.5,y:.8+TABLE.puck+TABLE.mallet-.01,vx:0,vy:-40}],.016);
  assert.ok(Math.hypot(r.puck[2],r.puck[3])<=TABLE.maxSpeed+1e-9,'speed capped');assert.ok(r.puck[3]<0,'hit away from the mallet');
});
test('serve starts on the side of whoever conceded',()=>{
  assert.ok(servePuck('host')[1]>TABLE.h/2);assert.ok(servePuck('guest')[1]<TABLE.h/2);
});
test('backend 005 is transactional, re-runnable and checks itself',async()=>{
  const sql=await readFile(new URL('../backend/005_garden_games.sql',import.meta.url),'utf8');
  assert.match(sql,/^begin;/m);assert.match(sql,/^commit;/m);
  assert.match(sql,/create table if not exists public\.game_events/);assert.match(sql,/drop policy if exists connection_read on public\.game_events/);
  assert.match(sql,/security definer set search_path=''/);assert.match(sql,/errcode='PT409'/);
  assert.match(sql,/'rose','marigold','jasmine','lavender','lilium','orchid'/);assert.match(sql,/'en','fr','it','aeb-TN'/);
  assert.match(sql,/config\.private=true|private Realtime channel/);
});

// ---- decks and the word duel
const decks=parseDecks(await readFile(new URL('../experience/decks.tsv',import.meta.url),'utf8'));
test('decks: built JSON matches the TSV; fifty cards per deck, every meaning in five languages',async()=>{
  assert.deepEqual(JSON.parse(await readFile(new URL('../experience/decks.json',import.meta.url),'utf8')),decks);
  for(const d of ['it','ve','tn'])assert.ok(decks.cards.filter(c=>c.deck===d).length>=50,d);
  for(const c of decks.cards){assert.match(c.id,/^[a-z0-9][a-z0-9_.-]{0,39}$/);for(const l of ['en','es','fr','it','aeb-TN'])assert.ok(c.meaning[l]);}
  assert.ok(decks.cards.filter(c=>c.deck==='tn').every(c=>c.roman),'Derja has a Latin spelling');
});
test('duel: seeded choices are the same on both phones, four options, one right, none that could also be right',()=>{
  const a=seeded('x'),b=seeded('x');assert.deepEqual([a(),a(),a()],[b(),b(),b()]);
  assert.notDeepEqual(shuffle([1,2,3,4,5,6],seeded('a')),shuffle([1,2,3,4,5,6],seeded('b')));
  for(const lang of ['en','es','fr','it','aeb-TN'])for(const card of decks.cards){
    const opts=choices(card,decks.cards,lang,'round-1');
    assert.equal(opts.length,4,card.id);assert.equal(opts.filter(o=>o.correct).length,1);
    assert.equal(new Set(opts.map(o=>o.text)).size,4,card.id+' distinct');
    const right=opts.find(o=>o.correct).text;
    for(const o of opts.filter(o=>!o.correct))assert.ok(!closeMeanings(o.text,right),card.id+': '+o.text+' ~ '+right);
    assert.deepEqual(choices(card,decks.cards,lang,'round-1'),opts,'same seed, same choices');
  }
  assert.ok(closeMeanings('great, cool','great!'));assert.ok(!closeMeanings('darling (lit. treasure)','treasure chest'));
});
test('duel: meanings in your language, English for the deck\'s own; seven words; scores and outcomes',()=>{
  assert.equal(meaningLang('it','it'),'en');assert.equal(meaningLang('tn','aeb-TN'),'en');assert.equal(meaningLang('ve','es'),'es');assert.equal(meaningLang('tn','fr'),'fr');
  const items=pickItems(decks.cards,'ve',DUEL_SIZE,seeded('s'));assert.equal(items.length,7);assert.equal(new Set(items).size,7);assert.ok(items.every(i=>i.startsWith('ve.')));
  assert.equal(duelScore([1,0,-1,1,1]),3);
  assert.equal(duelOutcome({score:5,ms:9000},{score:4,ms:1000}),'won');assert.equal(duelOutcome({score:3,ms:1},{score:4,ms:9}),'lost');
  assert.equal(duelOutcome({score:4,ms:1000},{score:4,ms:2000}),'tieYou');assert.equal(duelOutcome({score:4,ms:3000},{score:4,ms:2000}),'tieThem');
  assert.equal(duelOutcome({score:4,ms:1},{score:4,ms:1}),'tie');assert.equal(duelOutcome(null,{score:1}),null);
});
test('know me: five fresh questions, keys for every option, matches counted like the server',()=>{
  assert.equal(QUESTIONS.length,24);assert.equal(questionKey('km07'),'knowme.q07');assert.equal(optionKey('km07',3),'knowme.q07.d');
  const recent=QUESTIONS.slice(0,19),q=pickQuestions(recent,5,seeded('q'));assert.equal(q.length,5);assert.ok(q.every(x=>!recent.includes(x)));
  assert.equal(pickQuestions(QUESTIONS.slice(0,22),5,seeded('q')).length,5,'too few fresh: any five');
  assert.equal(matches([0,1,2,3,0],[0,1,0,3,1]),3);
});

// ---- points, seeds and turns
const O='o',Y='y',on=(d,h=12)=>new Date(2026,10,d,h).toISOString();
const snap={members:[{profile_id:O},{profile_id:Y}],flowers:[{planted_by:O},{planted_by:O}],
  gameEvents:[{game:'truth_dare',kind:'truth',profile_id:O,created_at:on(16)},{game:'truth_dare',kind:'finish',profile_id:Y,created_at:on(16)},
    {game:'hockey',kind:'finish',profile_id:O,score_me:5,score_partner:3,created_at:on(17)},{game:'hockey_bot',kind:'finish',profile_id:Y,score_me:5,score_partner:2,created_at:on(18)}],
  playRounds:[{id:'r1',game:'word_duel',started_by:O,created_at:on(18)},{id:'r2',game:'know_me',started_by:Y,created_at:on(18)},{id:'r3',game:'word_duel',started_by:Y,created_at:on(19)}],
  playAnswers:[{round_id:'r1',profile_id:O,role:'player',score:5,ms:30000,created_at:on(18)},{round_id:'r1',profile_id:Y,role:'player',score:5,ms:20000,created_at:on(19)},
    {round_id:'r2',profile_id:Y,role:'self',score:null,created_at:on(18)},{round_id:'r2',profile_id:O,role:'guess',score:4,created_at:on(19)},
    {round_id:'r3',profile_id:Y,role:'player',score:6,ms:15000,created_at:on(19,13)}]};
test('points: turns, hockey, the toad, duels with the faster winner, know me',()=>{
  const p=pointsBy(snap);
  // O: truth 1 + hockey 3 + duel 5 + guess 4 = 13; Y: hockey 1 + toad 3 + duel 5 + faster tie 2 + self 1 + r3 6 = 18
  assert.equal(p.get(O),13);assert.equal(p.get(Y),18);
  assert.equal(pointsBy(snap,new Date(2026,10,19).getTime()).get(Y),13,'only from Thursday');
  assert.ok(pointEvents(snap).every(e=>e.points>0&&e.at>0));
});
test('seeds: three to start, one per ten points, one per flower planted',()=>{
  assert.deepEqual(seeds(snap,O),{earned:4,used:2,left:2});assert.deepEqual(seeds(snap,Y),{earned:4,used:0,left:4});
  assert.deepEqual(seeds({members:[{profile_id:O}],flowers:[1,2,3,4,5].map(()=>({planted_by:O}))},O),{earned:3,used:5,left:0});
});
test('turns: what waits for me, what waits for them, what is finished',()=>{
  const now=new Date(2026,10,20).getTime();
  assert.deepEqual(waitingForMe(snap,O,now).map(r=>r.id),['r3']);assert.deepEqual(waitingForThem(snap,Y,now).map(r=>r.id),['r3']);
  assert.deepEqual(waitingForMe(snap,O,new Date(2026,11,20).getTime()),[],'two weeks later it has expired');
  assert.deepEqual(finishedRounds(snap).map(f=>f.round.id),['r1','r2'].sort((a,b)=>a===b?0:a==='r1'?-1:1));
});
test('the week starts on Monday at midnight',()=>{
  const w=new Date(weekStart(new Date(2026,10,19,15).getTime()));assert.equal(w.getDay(),1);assert.equal(w.getDate(),16);assert.equal(w.getHours(),0);
  assert.equal(new Date(weekStart(new Date(2026,10,16,0,0,1).getTime())).getDate(),16);assert.equal(new Date(weekStart(new Date(2026,10,22,23).getTime())).getDate(),16);
});

// ---- the toad
test('the toad stays in its half, moves no faster than its speed, and blocks a shot at its goal',()=>{
  let m=[.5,.16];const dt=1/60;
  for(let i=0;i<200;i++){const puck=[Math.random(),Math.random()*1.6,(Math.random()-.5)*4,(Math.random()-.5)*4];const n=toadMove({puck},m,dt,()=>.5);
    assert.ok(n[1]<=TABLE.h/2-TABLE.mallet+1e-9&&n[1]>=TABLE.mallet-1e-9);assert.ok(Math.hypot(n[0]-m[0],n[1]-m[1])<=1.15*dt+1e-6);m=n;}
  // a shot from the right towards the middle of its goal: the toad ends up in its way
  let state={puck:[.8,.75,-.35,-1.2]},toad=[.5,.16],blocked=false;
  for(let i=0;i<120&&!blocked;i++){toad=toadMove(state,toad,dt,()=>.5);const r=step(state.puck,[{x:toad[0],y:toad[1],vx:0,vy:0}],dt);if(r.scored==='host')break;state={puck:r.puck};if(r.puck[3]>0)blocked=true;}
  assert.ok(blocked,'the toad sent the puck back');
});
test('three toads: each stays in its half and under its own top speed; the Champion is the fastest',()=>{
  const dt=1/60;
  for(const level of ['easy','medium','hard']){let m=[.5,.16];const memo={};
    for(let i=0;i<300;i++){const puck=[Math.random(),Math.random()*1.6,(Math.random()-.5)*4,(Math.random()-.5)*4];const n=toadMove({puck},m,dt,Math.random,level,memo,[.5,1.4]);
      assert.ok(n[1]<=TABLE.h/2-TABLE.mallet+1e-9&&n[1]>=TABLE.mallet-1e-9,level+' stays in its half');
      assert.ok(Math.hypot(n[0]-m[0],n[1]-m[1])<=TOAD_LEVELS[level].speed*dt+1e-6,level+' speed');m=n;}}
  assert.ok(TOAD_LEVELS.hard.speed>TOAD_LEVELS.medium.speed&&TOAD_LEVELS.medium.speed>TOAD_LEVELS.easy.speed);
  assert.equal(toadMove({puck:[.5,.5,0,0]},[.5,.16],dt,()=>.5,'nonsense').length,2,'unknown level falls back to medium');
});
test('a bounced shot is read correctly: the crossing point folds off the walls',()=>{
  // straight down the middle, then off the left wall and back
  assert.ok(Math.abs(crossing([.5,.8,0,-1],.2)-.5)<1e-9);
  const x=crossing([.2,.8,-.5,-1],.2);assert.ok(x>TABLE.puck&&x<TABLE.w-TABLE.puck,'stays on the table');
  assert.equal(crossing([.5,.8,0,1],.2),null,'not heading there');
});
test('the Champion blocks a banked shot that the Dreamer usually misses',()=>{
  const dt=1/60;let seed=3;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const shots=[];while(shots.length<60){const p=[.1+rnd()*.8,.6,(rnd()<.5?-1:1)*(1.2+rnd()*.8),-1.9];const x=crossing(p,0);if(x!==null&&Math.abs(x-TABLE.w/2)<TABLE.goal/2-TABLE.puck&&Math.abs(p[0]+p[2]*.6/1.9-.5)>.5)shots.push(p);}
  const stops=level=>{let blocked=0,k=0;for(const shot of shots){let state={puck:[...shot]},toad=[(k++%2)?.22:.78,.2],memo={clock:k},prev=[...toad];
    for(let i=0;i<90;i++){toad=toadMove(state,toad,dt,rnd,level,memo,[.5,1.4]);const r=step(state.puck,[{x:toad[0],y:toad[1],vx:(toad[0]-prev[0])/dt,vy:(toad[1]-prev[1])/dt}],dt);prev=[...toad];
      if(r.scored)break;state={puck:r.puck};if(r.puck[3]>0){blocked++;break;}}}return blocked;};
  const hard=stops('hard'),easy=stops('easy');
  assert.ok(hard>=57,'hard stops at least 95%: '+hard);assert.ok(easy<hard,'easy is worse: '+easy);
});
test('backend 010 is transactional, additive and scores on the server',async()=>{
  const sql=await readFile(new URL('../backend/010_play.sql',import.meta.url),'utf8');
  assert.match(sql,/^begin;/m);assert.match(sql,/^commit;/m);assert.doesNotMatch(sql,/drop (table|function|column)/i);
  assert.match(sql,/'hockey_bot'/);assert.match(sql,/'game_result'/);assert.match(sql,/create table if not exists public\.play_rounds/);
  assert.match(sql,/app_private\.played_round\(round_id\)/);assert.match(sql,/generate_subscripts\(p_picks,1\)/);
});
test('every duel outcome has words in every language with exactly its parameters',async()=>{
  const catalogs={};for(const l of ['en','es','fr','it','aeb-TN'])catalogs[l]=JSON.parse(await readFile(new URL(`../experience/locales/${l}.json`,import.meta.url),'utf8'));
  for(const l of Object.keys(catalogs)){const tr=createTranslator(l,catalogs);
    for(const o of ['won','lost','tieYou','tieThem','tie'])assert.ok(tr.t(...outcomeText(o,{score:3},{score:2},'Yasmine')).length>3,l+' '+o);}
});
