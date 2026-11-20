// Piano tiles (beats, tiles, taps, stars) and Copy my step (styles, streak, what to do next).
import test from 'node:test';
import assert from 'node:assert/strict';
import {detectOnsets,gridBeats,chart,seeded,hashText,newRun,tap,release,advance,tileBox,stars,LANES} from '../src/games/piano-rules.js';
import {STYLES,todayStyle,streak,pairs,nextMove,heartsBy} from '../src/dance/dance-model.js';
import {pointsBy} from '../src/games/score.js';

const RATE=22050;
function clicks(times,duration){const s=new Float32Array(Math.ceil(duration*RATE));
  for(let i=0;i<s.length;i++)s[i]=(Math.sin(i*.37)*.004);
  for(const t of times){const o=Math.floor(t*RATE);for(let k=0;k<1800&&o+k<s.length;k++)s[o+k]+=Math.sin(k*.6)*Math.exp(-k/400)*.9;}
  return s;}
test('beats are found where the song hits, and only there',()=>{
  const want=[1,1.5,2,2.75,3.5,4,5.25,6];const got=detectOnsets(clicks(want,7),RATE);
  assert.equal(got.length,want.length,JSON.stringify(got));
  for(let i=0;i<want.length;i++)assert.ok(Math.abs(got[i]-want[i])<.06,`${got[i]} vs ${want[i]}`);
  assert.deepEqual(detectOnsets(new Float32Array(RATE*3),RATE),[]);
});
test('tiles never repeat a lane, fill long silences and stretch when the next beat is far',()=>{
  const tiles=chart([1,1.4,1.5,3,9,9.4],12,seeded(7));
  assert.ok(tiles.every((x,i)=>i===0||x.lane!==tiles[i-1].lane));
  assert.ok(tiles.every(x=>x.lane>=0&&x.lane<LANES));
  assert.ok(!tiles.some(x=>x.t===1.5),'beats closer than the minimum gap merge');
  assert.ok(tiles.some(x=>x.t>3&&x.t<9),'a long silence gets tiles at a gentle pace');
  assert.ok(tiles.some(x=>x.len>0),'some tiles are long');
  assert.deepEqual(chart([1,2,3],5,seeded(hashText('song'))),chart([1,2,3],5,seeded(hashText('song'))),'the same song gives the same tiles');
  assert.ok(gridBeats(10,120).length>=16);
});
const geo={height:800,hitY:700,speed:.5,tileH:160};
test('tap the lowest tile to score, tap the wrong spot and the game ends',()=>{
  const run=newRun([{i:0,t:2,lane:1,len:0},{i:1,t:2.6,lane:3,len:0}],4);
  const b=tileBox(run.tiles[0],2,geo);assert.equal(b.bottom,700);
  assert.equal(tap(run,1,650,2,geo).kind,'hit');assert.equal(run.score,1);assert.equal(run.next,1);
  assert.equal(tap(run,0,650,2.6,geo).kind,'miss');assert.ok(run.over);assert.equal(run.reason,'wrong');
});
test('a tile that slips past the bottom ends the game; finishing every tile gives three stars',()=>{
  const run=newRun([{i:0,t:1,lane:0,len:0}],3);
  assert.equal(advance(run,1.2,geo),null);
  assert.equal(advance(run,1+(800-700+160)/400+.01,geo).kind,'passed');assert.ok(run.over);
  const ok=newRun([{i:0,t:1,lane:2,len:0}],1.5);tap(ok,2,690,1,geo);assert.ok(ok.done);assert.equal(stars(ok),3);
});
test('a long tile counts the time you hold it',()=>{
  const run=newRun([{i:0,t:1,lane:0,len:1}],3);
  assert.equal(tap(run,0,690,1,geo).kind,'hold');release(run,1.5);
  assert.equal(run.score,1+2);assert.ok(run.done);
  const auto=newRun([{i:0,t:1,lane:0,len:.5},{i:1,t:2,lane:1,len:0}],3);tap(auto,0,690,1,geo);advance(auto,1.6,geo);
  assert.equal(auto.holding,null);assert.equal(auto.next,1);
});
test('stars follow how far you got',()=>{
  const run=newRun([],90);run.at=10;assert.equal(stars(run),0);run.at=31;assert.equal(stars(run),1);run.at=61;assert.equal(stars(run),2);
});
test('piano stars are points, like the server counts them',()=>{
  const snap={members:[{profile_id:'a'},{profile_id:'b'}],gameEvents:[{game:'piano',kind:'finish',profile_id:'a',score_me:400,score_partner:2,created_at:'2026-11-20T10:00:00Z'}]};
  assert.equal(pointsBy(snap).get('a'),2);assert.equal(pointsBy(snap).get('b'),0);
});

const at=(d,h=12)=>new Date(2026,10,d,h).toISOString();
const msg=(id,who,role,d,of)=>({id,sender_id:who,kind:'dance',created_at:at(d),payload:{role,style:'bachata',...(of?{of}:{})}});
test('today\'s dance style is the same on both phones and changes every day',()=>{
  assert.ok(STYLES.some(s=>s.id===todayStyle(new Date(2026,10,20,9).getTime()).id));
  assert.equal(todayStyle(new Date(2026,10,20,1).getTime()).id,todayStyle(new Date(2026,10,20,23).getTime()).id);
  assert.notEqual(todayStyle(new Date(2026,10,20).getTime()).id,todayStyle(new Date(2026,10,21).getTime()).id);
});
test('the streak counts days in a row you danced',()=>{
  const m=[msg('1','a','step',18),msg('2','b','copy',19,'1'),msg('3','a','step',20)];
  assert.equal(streak(m,new Date(2026,10,20,20).getTime()),3);
  assert.equal(streak(m,new Date(2026,10,21,8).getTime()),3,'today still empty: yesterday counts');
  assert.equal(streak(m,new Date(2026,10,23).getTime()),0);
});
test('the studio offers: copy their step, rate their copy, wait, or film',()=>{
  const now=new Date(2026,10,20,20).getTime();
  assert.equal(nextMove([],[],'a',now).kind,'film');
  const step=msg('s','b','step',20);assert.equal(nextMove([step],[],'a',now).kind,'copy');
  assert.equal(nextMove([step],[],'b',now).kind,'waiting');
  const copy=msg('c','a','copy',20,'s');assert.equal(nextMove([step,copy],[],'b',now).kind,'rate');
  assert.equal(nextMove([step,copy],[{copy_id:'c',hearts:3}],'b',now).kind,'film');
  assert.equal(pairs([step,copy],[{copy_id:'c',hearts:3}])[0].hearts,3);
  assert.equal(heartsBy([step,copy],[{copy_id:'c',hearts:3}]).get('a'),3);
});
