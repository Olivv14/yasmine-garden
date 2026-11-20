// Learn: spaced repetition, today's session, exercises, typed answers, word of the day, and the points.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {review,serialize,revive,session,modeFor,choiceSet,checkTyped,ratingFor,wordOfDay,stats,teachCard,meaningOf,previews,RATING,stateMap} from '../src/learn/learn-model.js';
import {pointsBy} from '../src/games/score.js';
const {cards}=JSON.parse(await readFile(new URL('../experience/decks.json',import.meta.url),'utf8'));
const now=new Date('2026-11-20T10:00:00Z');

test('a card you know comes back later and later; one you forgot comes back soon',()=>{
  let s=review(null,RATING.good,now);assert.equal(s.reps,1);
  const again=review(s,RATING.again,s.due),good=review(review(s,RATING.good,s.due),RATING.good,new Date(s.due.getTime()+3*86400000));
  assert.ok(good.due-again.due>86400000);
  const p=previews(s,s.due);assert.ok(p.again<p.good&&p.good<=p.easy);
});
test('a card state goes to the server and back unchanged',()=>{
  const s=review(null,RATING.good,now),row={...serialize(s),profile_id:'me',card_key:'it.amore'};
  assert.deepEqual(serialize(revive(row)),serialize(s));assert.equal(stateMap([row,{...row,profile_id:'them'}],'me').size,1);
});
test('the session puts due cards first, then a few new ones, your partner\'s words first',()=>{
  const deck=cards.filter(c=>c.deck==='it'),taught=teachCard({id:'00000000-0000-4000-8000-000000000001',sender_id:'b',payload:{word:'chévere',meaning:'cool'}});
  const states=new Map([[deck[0].id,review(null,RATING.good,new Date('2026-11-01'))],[deck[1].id,{...review(null,RATING.good,now),due:new Date('2027-01-01')}]]);
  const s=session([taught,...deck],states,{now,random:()=>.3});
  assert.equal(s[0].id,deck[0].id);assert.equal(s[1].id,taught.id);assert.ok(!s.some(c=>c.id===deck[1].id));
  assert.ok(s.length<=12);assert.equal(session(deck,new Map(),{now,newToday:8}).length,0,'no more new cards today');
});
test('a new card is introduced; later ones are chosen, typed or heard',()=>{
  const c=cards[0];assert.equal(modeFor(c,null),'intro');
  const later={...review(review(null,RATING.good,now),RATING.good,new Date('2026-11-21')),state:2};
  assert.ok(['choice','type'].includes(modeFor(c,later)));
  const modes=new Set(cards.slice(0,40).map(x=>modeFor(x,later,{canSpeak:true})));assert.ok(modes.has('listen'));
});
test('four different meanings, one right',()=>{
  const c=cards.find(x=>x.deck==='ve'),set=choiceSet(c,cards,'en','s');
  assert.equal(set.length,4);assert.equal(set.filter(x=>x.correct).length,1);assert.equal(new Set(set.map(x=>x.text)).size,4);
  assert.equal(meaningOf(c,'en'),c.meaning.en);
});
test('typing forgives accents, articles and one small typo',()=>{
  const amore=cards.find(c=>c.id==='it.amore');
  assert.equal(checkTyped(amore,'Amore'),'right');assert.equal(checkTyped(amore,"l'amore"),'right');assert.equal(checkTyped(amore,'amure'),'almost');
  assert.equal(checkTyped(amore,'casa'),'wrong');assert.equal(checkTyped(amore,''),'wrong');
  assert.equal(ratingFor('right',3000),RATING.good);assert.equal(ratingFor('right',20000),RATING.hard);assert.equal(ratingFor('wrong',1000),RATING.again);
});
test('the word of the day is the same all day for both of you',()=>{
  const it=cards.filter(c=>c.deck==='it');assert.equal(wordOfDay(it,new Date(2026,10,20,8)).id,wordOfDay(it,new Date(2026,10,20,22)).id);
});
test('XP, learned and due',()=>{
  const c=cards.slice(0,2),s=new Map([[c[0].id,review(null,RATING.good,new Date('2026-11-01'))]]);
  const st=stats(c,s,now);assert.equal(st.xp,1);assert.equal(st.due,1);assert.equal(st.total,2);
});
test('every 10 reviews in a day is a point',()=>{
  const snap={members:[{profile_id:'a'},{profile_id:'b'}],learnDays:[{profile_id:'a',day:'2026-11-20',reviews:25},{profile_id:'b',day:'2026-11-20',reviews:9}]};
  assert.equal(pointsBy(snap).get('a'),2);assert.equal(pointsBy(snap).get('b'),0);
});
