import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TRUTHS,DARES,cardKey,currentTruthDare,whoseTurn,drawCard,finishedGames,turnsPerFinish,TABLE,clampMallet,step,servePuck} from '../src/games/rules.js';

const at=i=>new Date(Date.UTC(2026,10,15,10,i)).toISOString();
const ev=(i,profile_id,kind,game='truth_dare',card_id)=>({id:'e'+i,profile_id,game,kind,card_id:card_id??(kind==='finish'?null:kind[0]+'01'),created_at:at(i)});

test('ten truths and ten dares with stable ids matching the database check',()=>{
  assert.equal(TRUTHS.length,10);assert.equal(DARES.length,10);
  for(const id of [...TRUTHS,...DARES])assert.match(id,/^[td][0-9]{2}$/);
  assert.equal(cardKey('t03'),'game.truth.t03');assert.equal(cardKey('d10'),'game.dare.d10');
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
