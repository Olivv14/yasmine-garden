// The shop (approved ShopThemes / ShopMascots / ShopHearts): spend your points on themes, mascots and heart buttons.
// Buying and choosing go through backend/012 (shop_buy, shop_choose); the server counts your points and decides.
// Also applies what each of you chose: your theme on your phone, your heart on your button (with its burst), the
// Champion's crown on your profile, and both your mascots living on the app (mascots.js).
import {openSheet} from '../design/sheet.js';
import {ITEMS,item,wallet,itemState,choiceOf,toggleMascot,beatChampion} from './items.js';
import {heartArt,heartParticle,HEART_TINT} from './heart-art.js';
import {createMascots} from './mascots.js';
import {icon} from '../design/icons.js';

const TABS=['themes','mascots','hearts'],KIND={themes:'theme',mascots:'mascot',hearts:'heart'};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createShop({el,button,t,copy,getSnapshot,me,partner,person,rpc,notify}){
  let sheet=null,tab='themes',busy=false,tryKind=null;
  const mascots=createMascots({t,copy});
  const ready=()=>Array.isArray(getSnapshot()?.shopChoices);

  // ---- what you chose shows everywhere
  function apply(){
    const snap=getSnapshot();if(!snap||!me())return;
    const mine=choiceOf(snap,me()),theirs=partner()?choiceOf(snap,partner()):null;
    document.documentElement.dataset.shopTheme=mine.theme.split('.')[1];
    paintHeart(item(mine.heart)?.art??'heart');
    document.getElementById('profileBubble')?.classList.toggle('has-crown',beatChampion(snap,me()));
    mascots.show([...mine.mascots.map(id=>({sheet:item(id).sheet,owner:'me'})),...(theirs?.mascots??[]).map(id=>({sheet:item(id).sheet,owner:'partner'}))]);
    if(sheet?.open)paint();
  }
  function paintHeart(kind){
    const b=document.getElementById('affectionButton');if(!b)return;
    b.querySelector('.icon,.heart-art')?.remove();const art=heartArt(kind,30);art.classList.add('heart-art');b.prepend(art);
    const [a,c]=HEART_TINT[kind]??HEART_TINT.heart;b.style.setProperty('--heart-a',a);b.style.setProperty('--heart-b',c);b.dataset.heart=kind;
  }
  // every tap on the heart sends a little burst of its own shape
  function burst(from,kind){
    if(reduced())return;const r=from.getBoundingClientRect(),layer=el('div',undefined,'heart-burst');layer.setAttribute('aria-hidden','true');
    layer.style.left=(r.left+r.width/2)+'px';layer.style.top=(r.top+r.height/2)+'px';
    for(let i=0;i<10;i++){const p=heartParticle(kind),a=-Math.PI/2+(i-4.5)*.3,d=46+(i%3)*18;p.style.setProperty('--dx',Math.cos(a)*d+'px');p.style.setProperty('--dy',Math.sin(a)*d+'px');p.style.animationDelay=(i*.025)+'s';layer.append(p);}
    document.body.append(layer);setTimeout(()=>layer.remove(),1300);
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('#affectionButton');if(b&&!b.disabled)burst(b,b.dataset.heart??'heart');},true);

  // ---- the shop sheet
  function open(start='themes'){
    tab=TABS.includes(start)?start:'themes';
    if(sheet?.open){paint();return;}
    sheet=openSheet({title:h=>copy(h,()=>t('shop.title')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),size:'full',className:'shop-sheet',onClose:()=>{sheet=null;}});
    paint();
  }
  function paint(){
    if(!sheet)return;const snap=getSnapshot(),body=sheet.body;body.replaceChildren();
    if(!ready()){body.append(el('p',()=>t('shop.notReady'),'small'));return;}
    const w=wallet(snap,me());
    const coins=el('span',undefined,'shop-coins');coins.append(icon('sparkles',16),el('span',()=>t('shop.points',{count:w.left})));body.append(coins);
    const tabs=el('div',undefined,'shop-tabs');tabs.setAttribute('role','tablist');
    for(const id of TABS){const b=button(()=>t('shop.tab.'+id),()=>{tab=id;paint();},'shop-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(id===tab));tabs.append(b);}
    body.append(tabs);
    const kind=KIND[tab],items=ITEMS.filter(i=>i.kind===kind);
    if(kind==='heart')body.append(heartStage(snap));
    if(kind==='mascot')body.append(el('p',()=>t('shop.mascotsHint'),'small shop-hint'));
    const grid=el('div',undefined,'shop-grid shop-'+kind);
    for(const i of items)grid.append(tile(snap,i));
    body.append(grid,el('p',()=>t('shop.hint'),'small shop-hint'));
  }
  // the big heart you can try, and what your partner's phone shows
  function heartStage(snap){
    const kind=item(tryKind??choiceOf(snap,me()).heart)?.art??'heart';
    const box=el('div',undefined,'shop-heart-stage');
    const big=button(undefined,e=>burst(e.currentTarget,kind),'shop-heart-big');big.append(heartArt(kind,76));
    const [a,c]=HEART_TINT[kind];big.style.setProperty('--heart-a',a);big.style.setProperty('--heart-b',c);copy(big,()=>t('shop.tryHeart'),'aria-label');
    const note=el('p',()=>t('shop.sent.'+kind,{name:person(me())}),'shop-heart-note');
    box.append(big,el('p',()=>t('shop.tryHeart'),'small'),note);return box;
  }
  function tile(snap,i){
    const st=itemState(snap,me(),i.id),t0=el('div',undefined,'shop-tile');t0.dataset.state=st;t0.dataset.item=i.id;
    const art=el('span',undefined,'shop-art');
    if(i.kind==='heart'){const k=i.art;art.append(heartArt(k,36));const [a,c]=HEART_TINT[k];art.style.setProperty('--heart-a',a);art.style.setProperty('--heart-b',c);art.classList.add('heart-swatch');
      t0.onclick=()=>{tryKind=i.id;paint();};}
    else if(i.kind==='mascot'){art.classList.add('mascot-swatch','m-'+i.sheet);}
    else art.classList.add('theme-swatch','th-'+i.id.split('.')[1]);
    t0.append(art,el('b',()=>t('shop.item.'+i.id)));
    if(i.kind==='mascot')t0.append(el('small',()=>t('shop.desc.'+i.id)));
    const act=action(snap,i,st);if(act)t0.append(act);
    return t0;
  }
  function action(snap,i,st){
    if(st==='using'){
      if(i.kind!=='mascot')return el('span',()=>t('shop.using'),'shop-state using');
      return button(()=>t('shop.using'),()=>choose(snap,i),'shop-act using');}
    if(st==='owned')return button(()=>t('shop.use'),()=>choose(snap,i),'shop-act');
    if(st==='locked')return el('span',()=>t('shop.locked'),'shop-state locked');
    if(st==='unlockable')return button(()=>t('shop.unlock'),()=>buy(i),'shop-act buy');
    const b=button(()=>t('shop.buy',{price:i.price}),()=>buy(i),'shop-act buy');b.disabled=st==='expensive';
    if(st==='expensive')copy(b,()=>t('shop.notEnough'),'title');return b;
  }
  async function buy(i){
    if(busy)return;busy=true;
    try{await rpc('shop_buy',{p_id:crypto.randomUUID(),p_item:i.id});notify(()=>t('shop.bought',{name:t('shop.item.'+i.id)}));
      const snap=getSnapshot();if(snap)await choose(snap,i,true);}
    catch(e){notify(()=>e?.code==='PT402'?t('shop.notEnough'):t('common.unknownError'));}
    finally{busy=false;paint();}
  }
  async function choose(snap,i,justBought=false){
    const c=choiceOf(snap,me());
    const next={heart:i.kind==='heart'?i.id:c.heart,theme:i.kind==='theme'?i.id:c.theme,mascots:i.kind==='mascot'?(justBought&&c.mascots.includes(i.id)?c.mascots:toggleMascot([...c.mascots],i.id)):[...c.mascots]};
    try{await rpc('shop_choose',{p_heart:next.heart,p_theme:next.theme,p_mascots:next.mascots});}catch{notify(()=>t('common.unknownError'));}
  }
  return {open,apply,clear(){mascots.show([]);delete document.documentElement.dataset.shopTheme;sheet?.close();}};
}
