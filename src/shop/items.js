// The shop's catalog and wallet, pure (no DOM, no network), unit-tested in scripts/shop.test.mjs.
// Prices must match backend/012 app_private.shop_price: the server is the judge, this only shows them.
import {pointsBy} from '../games/score.js';

export const ITEMS=Object.freeze([
  // heart buttons
  ...[['classic','heart',0],['kiss','kiss',60],['harissa','harissa',90],['flower','flower',50],['jasmine','jasmine',60],
      ['star','star',120],['rose','rose',70],['paw','paw',80],['arepa','arepa',70],['moon','moon',90]]
    .map(([k,art,price])=>Object.freeze({id:'heart.'+k,kind:'heart',art,price,free:price===0})),
  // mascots (pixel art, they live on the app)
  ...[['emmy',0],['bird',80],['camel',120],['chef',400]].map(([k,price])=>Object.freeze({id:'mascot.'+k,kind:'mascot',sheet:k,price,free:price===0})),
  // themes: the colours of the whole app
  ...[['dusk',0,true],['yasmine',0,true],['oliver',0,true],['sidi',150,false],['salto',150,false],['blaugrana',200,false],['djerba',0,false]]
    .map(([k,price,free])=>Object.freeze({id:'theme.'+k,kind:'theme',price,free,unlock:k==='djerba'?'champion':null})),
]);
export const item=id=>ITEMS.find(i=>i.id===id)??null;
export const DEFAULT_CHOICE=Object.freeze({heart:'heart.classic',theme:'theme.dusk',mascots:Object.freeze(['mascot.emmy'])});
// the level the toad played, stored with bot games (backend/012)
export const LEVEL_CARD=Object.freeze({easy:'lv1',medium:'lv2',hard:'lv3'});

const mine=(snap,me)=>(snap?.shopPurchases??[]).filter(p=>p.profile_id===me);
// Points earned all time, spent in the shop, and what is left to spend.
export function wallet(snap,me){
  const earned=pointsBy(snap).get(me)??0,spent=mine(snap,me).reduce((s,p)=>s+(p.cost??0),0);
  return {earned,spent,left:Math.max(0,earned-spent)};
}
export const beatChampion=(snap,me)=>(snap?.gameEvents??[]).some(e=>e.profile_id===me&&(e.game==='hockey_bot'||e.game==='pool_bot')&&e.card_id==='lv3'&&e.score_me>e.score_partner);
export function owns(snap,me,id){const i=item(id);if(!i)return false;return i.free||mine(snap,me).some(p=>p.item===id);}
// What a shop item looks like for you right now: owned, in use, can buy, too expensive, or locked.
export function itemState(snap,me,id){
  const i=item(id);if(!i)return 'missing';const c=choiceOf(snap,me);
  const using=i.kind==='mascot'?c.mascots.includes(id):c[i.kind]===id;
  if(owns(snap,me,id))return using?'using':'owned';
  if(i.unlock==='champion')return beatChampion(snap,me)?'unlockable':'locked';
  return wallet(snap,me).left>=i.price?'affordable':'expensive';
}
// What someone has chosen (defaults until they choose); unknown or unowned ids fall back safely.
export function choiceOf(snap,who){
  const row=(snap?.shopChoices??[]).find(c=>c.profile_id===who);if(!row)return DEFAULT_CHOICE;
  const ok=(id,kind)=>item(id)?.kind===kind;
  return {heart:ok(row.heart,'heart')?row.heart:DEFAULT_CHOICE.heart,theme:ok(row.theme,'theme')?row.theme:DEFAULT_CHOICE.theme,
    mascots:Array.isArray(row.mascots)?row.mascots.filter(m=>ok(m,'mascot')).slice(0,2):DEFAULT_CHOICE.mascots};
}
// Toggle a mascot in your choice (two at most; the newest replaces the oldest).
export function toggleMascot(list,id){return list.includes(id)?list.filter(m=>m!==id):[...list,id].slice(-2);}
