// The shop: catalog, prices in step with the server, wallet, ownership and choices.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ITEMS,item,wallet,owns,itemState,choiceOf,toggleMascot,beatChampion,DEFAULT_CHOICE,LEVEL_CARD} from '../src/shop/items.js';

const sql=await readFile(new URL('../backend/012_shop.sql',import.meta.url),'utf8');
test('every price in the app matches backend/012, and nothing is sold that the server does not know',()=>{
  const server=Object.fromEntries([...sql.matchAll(/when '([a-z]+\.[a-z]+)' then (\d+)/g)].map(m=>[m[1],Number(m[2])]));
  assert.equal(Object.keys(server).length,ITEMS.length);
  for(const i of ITEMS)assert.equal(server[i.id],i.price,i.id);
  const free=[...sql.match(/p_item in \(([^)]*)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
  assert.deepEqual(free,ITEMS.filter(i=>i.free).map(i=>i.id).sort());
});
const O='o',Y='y';
const base=(extra={})=>({members:[{profile_id:O},{profile_id:Y}],gameEvents:[],playRounds:[],playAnswers:[],shopPurchases:[],shopChoices:[],...extra});
const win=(id,level)=>({id,game:'hockey_bot',kind:'finish',profile_id:O,card_id:level,score_me:5,score_partner:2,created_at:'2026-01-01'});
test('the wallet: points earned all time minus what you spent',()=>{
  const snap=base({gameEvents:[win('1','lv1'),win('2','lv2'),win('3',null)],shopPurchases:[{profile_id:O,item:'heart.flower',cost:5}]});
  assert.deepEqual(wallet(snap,O),{earned:7,spent:5,left:2});   // Dreamer win 1 + Coach win 3 + an old game without a level 3
  assert.deepEqual(wallet(snap,Y),{earned:0,spent:0,left:0});
});
test('item states: in use, owned, affordable, too expensive, locked until the Champion is beaten',()=>{
  const snap=base({gameEvents:Array.from({length:20},(_,i)=>win(String(i),'lv2')),shopPurchases:[{profile_id:O,item:'heart.kiss',cost:60}]});
  assert.equal(itemState(snap,O,'heart.classic'),'using');
  assert.equal(itemState(snap,O,'heart.kiss'),'owned');
  assert.equal(itemState(snap,O,'heart.flower'),'expensive');       // 60 earned - 60 spent = 0
  assert.equal(itemState(snap,O,'theme.djerba'),'locked');
  const champ=base({gameEvents:[win('x','lv3')]});
  assert.ok(beatChampion(champ,O));assert.equal(itemState(champ,O,'theme.djerba'),'unlockable');
  assert.equal(itemState(base({gameEvents:Array.from({length:17},(_,i)=>win(String(i),null))}),O,'heart.flower'),'affordable');
});
test('choices fall back to the defaults and ignore unknown items',()=>{
  assert.deepEqual(choiceOf(base(),O),DEFAULT_CHOICE);
  const c=choiceOf(base({shopChoices:[{profile_id:O,heart:'heart.dragon',theme:'theme.sidi',mascots:['mascot.chef','mascot.unicorn','mascot.bird']}]}),O);
  assert.equal(c.heart,'heart.classic');assert.equal(c.theme,'theme.sidi');assert.deepEqual(c.mascots,['mascot.chef','mascot.bird']);
  assert.ok(owns(base(),O,'mascot.emmy'));assert.ok(!owns(base(),O,'mascot.chef'));assert.equal(item('nope'),null);
});
test('two mascots at most, the newest replaces the oldest; levels are stored as lv1..lv3',()=>{
  assert.deepEqual(toggleMascot(['mascot.emmy'],'mascot.bird'),['mascot.emmy','mascot.bird']);
  assert.deepEqual(toggleMascot(['mascot.emmy','mascot.bird'],'mascot.chef'),['mascot.bird','mascot.chef']);
  assert.deepEqual(toggleMascot(['mascot.emmy','mascot.bird'],'mascot.emmy'),['mascot.bird']);
  assert.deepEqual(LEVEL_CARD,{easy:'lv1',medium:'lv2',hard:'lv3'});
});
