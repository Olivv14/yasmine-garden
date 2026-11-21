// What is inside the boxes (mockup QBox, backend/020): every prize has its points and an item. This module draws the
// items, names them, says what they do, and opens a box (the shaking box, then the prize with its own action).
// Used by the bottles' shells, the stamp album's rows and the shelf's chests. Words come from the catalog.
import {openSheet} from '../design/sheet.js';
import {icon} from '../design/icons.js';
import {item as shopItem} from '../shop/items.js';
import {heartArt} from '../shop/heart-art.js';

const NS='http://www.w3.org/2000/svg';
const svg=(vb,body,size=72)=>{const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox',vb);s.setAttribute('width',String(size));s.setAttribute('height',String(size));s.setAttribute('aria-hidden','true');s.innerHTML=body;return s;};
const JAS=(fill,core)=>`<g fill="${fill}"><ellipse cx="32" cy="16" rx="8" ry="13"/><ellipse cx="32" cy="16" rx="8" ry="13" transform="rotate(72 32 32)"/><ellipse cx="32" cy="16" rx="8" ry="13" transform="rotate(144 32 32)"/><ellipse cx="32" cy="16" rx="8" ry="13" transform="rotate(216 32 32)"/><ellipse cx="32" cy="16" rx="8" ry="13" transform="rotate(288 32 32)"/></g><circle cx="32" cy="32" r="6" fill="${core}"/>`;
const THEME_COLORS={sidi:['#1F5FA8','#F3EEE6','#5FB0E8'],salto:['#2E6A44','#C98A4A','#BFE3F2'],blaugrana:['#1F3A8A','#A51C4A','#F2C14E']};
const MASCOT_ART={
  bird:'<ellipse cx="32" cy="38" rx="18" ry="15" fill="#C9302C"/><circle cx="40" cy="26" r="11" fill="#C9302C"/><path d="M50 26l9 3-9 3z" fill="#F2C14E"/><circle cx="42" cy="24" r="2.6" fill="#1C1418"/><path d="M14 40l-10 6 12 0z" fill="#3A2416"/>',
  camel:'<path d="M10 40c3-11 10-14 17-7 5-9 14-8 17 3l5 2c5-5 9-3 9 2s-4 5-6 3l-5 9H14z" fill="#D9A86A"/><g stroke="#B5844A" stroke-width="4" stroke-linecap="round"><path d="M18 52v10M25 52v10M40 52v10M47 52v10"/></g><rect x="22" y="32" width="13" height="6" rx="2" fill="#C9443A"/>',
  chef:'<circle cx="32" cy="40" r="16" fill="#F6C9A8"/><path d="M16 26c-6-12 8-18 12-10 2-10 14-10 16 0 4-8 18-2 12 10z" fill="#FFFFFF"/><rect x="18" y="24" width="28" height="8" rx="2" fill="#FFFFFF"/><circle cx="26" cy="40" r="2.2" fill="#1C1418"/><circle cx="38" cy="40" r="2.2" fill="#1C1418"/><path d="M26 47c4 3 8 3 12 0" stroke="#3A2416" stroke-width="2" fill="none"/>'};

// the picture of an item
export function itemArt(id,size=72){
  if(id==='points')return svg('0 0 64 64','<circle cx="32" cy="32" r="26" fill="#F2C14E"/><circle cx="32" cy="32" r="20" fill="#FFD58A"/><path d="M32 18l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#E8A030"/>',size);
  if(id==='seed')return svg('0 0 64 64','<rect x="14" y="8" width="36" height="48" rx="4" fill="#FBF3E4" stroke="#C9A86B" stroke-width="2"/><path d="M14 18h36" stroke="#C9A86B" stroke-width="2" stroke-dasharray="3 3"/>'+'<g transform="translate(14 22) scale(.56)">'+JAS('#FF9EC2','#FFD58A')+'</g><path d="M32 50V40" stroke="#4A8A3A" stroke-width="3"/>',size);
  if(id==='sticker')return svg('0 0 64 64','<path d="M10 10h44v30L40 54H10z" fill="#FFFFFF" stroke="#E6D8BC" stroke-width="2"/><path d="M54 40H40v14z" fill="#E6D8BC"/>'+'<g transform="translate(14 12) scale(.5)">'+JAS('#FF9EC2','#F2C14E')+'</g>',size);
  if(id==='golden')return svg('0 0 64 64','<circle cx="32" cy="32" r="30" fill="#FFE07A" opacity=".35"/>'+JAS('#F2C14E','#FFF4E6')+'<g fill="#FFF4E6"><circle cx="12" cy="12" r="1.6"/><circle cx="54" cy="14" r="1.4"/><circle cx="52" cy="52" r="1.6"/></g>',size);
  const it=shopItem(id);
  if(it?.kind==='heart'){const h=heartArt(it.art,size);return h;}
  if(it?.kind==='theme'){const [a,b,c]=THEME_COLORS[id.split('.')[1]]??['#5A3C66','#FFD58A','#FF9EC2'];return svg('0 0 64 64',`<path d="M10 58V30a22 22 0 0 1 44 0v28z" fill="${a}"/><path d="M18 58V32a14 14 0 0 1 28 0v26z" fill="${b}"/><circle cx="32" cy="28" r="6" fill="${c}"/>`,size);}
  if(it?.kind==='mascot')return svg('0 0 64 64',MASCOT_ART[id.split('.')[1]]??MASCOT_ART.bird,size);
  return svg('0 0 64 64','<circle cx="32" cy="32" r="24" fill="#FFD58A"/>',size);
}
// its name and what it does
export const itemName=(t,id)=>id==='points'||id==='seed'||id==='sticker'||id==='golden'?t('prize.item.'+id):t('shop.item.'+id);
export function itemWhat(t,id){const k=shopItem(id)?.kind;return t('prize.what.'+(k??id));}

// all the items a box of each tier can hold (for "What can be inside")
export const TIER_ITEMS=Object.freeze({
  small:['seed','sticker','points'],
  big:['heart.kiss','heart.harissa','heart.flower','heart.jasmine','heart.star','heart.rose','heart.paw','heart.arepa','heart.moon','theme.sidi','theme.salto','theme.blaugrana'],
  legendary:['golden','mascot.bird','mascot.camel','mascot.chef']});

// a prize sticker for the chat: the item's picture on a white sticker, as a PNG
async function stickerImage(id){
  const s=itemArt(id==='sticker'?'golden':id,220);s.setAttribute('xmlns',NS);
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(s));
  const img=new Image();img.src=url;await img.decode();
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  g.fillStyle='#FFFFFF';g.beginPath();g.arc(128,128,124,0,Math.PI*2);g.fill();g.drawImage(img,18,18,220,220);
  return c.toDataURL('image/png');
}

export function createPrizes({el,button,t,copy,person,partner,actions}){
  // the action of an item: plant, add the sticker, see it in the shop, or nothing (points)
  function itemAction(id){
    if(id==='seed'||id==='golden')return {label:()=>t('prize.plant'),run:()=>actions.plant(),close:true};
    if(id==='sticker')return {label:()=>t('prize.addSticker'),run:async b=>{b.disabled=true;try{await actions.saveSticker(await stickerImage('sticker'));copy(b,()=>t('prize.stickerAdded'));}catch{b.disabled=false;actions.notify(()=>t('bt.failed'));}},keep:true};
    if(shopItem(id))return {label:()=>t('prize.useIt'),run:()=>actions.openShop(),close:true};
    return null;
  }
  // a prize, shown (after opening, or again from the list)
  function show(sheet,prize){const body=sheet.body;
    const id=prize.item??'points';
    const card=el('div',undefined,'pz-card '+prize.tier);
    const banner=el('p',()=>t('bt.prize.'+prize.tier),'pz-banner');
    const art=el('div',undefined,'pz-art');art.append(itemArt(id,96));
    const name=el('p',()=>itemName(t,id),'pz-name');
    const what=el('p',()=>itemWhat(t,id),'pz-what');
    const pts=el('p',undefined,'pz-points');pts.textContent='+'+prize.points;
    card.append(banner,art,name,what,pts);
    const row=el('div',undefined,'pz-acts');
    const showIt=button(()=>t('prize.show',{name:person(partner())}),async e=>{const b=e.currentTarget;b.disabled=true;
      try{if(await actions.sendText(t('prize.showText',{item:itemName(t,id),tier:t('bt.prize.'+prize.tier)})))copy(b,()=>t('prize.shown'));else b.disabled=false;}catch{b.disabled=false;}},'pz-btn line');
    row.append(showIt);
    const a=itemAction(id);if(a){const go=button(a.label,e=>{const b=e.currentTarget;if(a.close)sheet.close();a.run(b);},'pz-btn main');row.append(go);}
    body.append(card,row);
  }
  // open a box: it shakes while the server draws the prize, then opens
  async function open(title,draw){
    const s=openSheet({title:h=>copy(h,title),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'bt-prize-sheet pz-sheet'});
    const stage=el('div',undefined,'bt-prize shaking');const box=el('div',undefined,'bt-box');box.append(el('span',undefined,'bt-box-lid'),el('span',undefined,'bt-box-body'),el('span',undefined,'bt-box-ribbon'));
    const label=el('p',()=>t('bt.opening'),'bt-prize-label');stage.append(el('span',undefined,'bt-rays'),box);s.body.append(stage,label);
    try{const [prize]=await Promise.all([draw(),new Promise(r=>setTimeout(r,1100))]);
      stage.classList.remove('shaking');stage.classList.add('open',prize.tier);
      setTimeout(()=>{stage.remove();label.remove();show(s,prize);},650);
      actions.notify(()=>t('prize.toast',{item:itemName(t,prize.item??'points'),points:prize.points}));return prize;}
    catch{stage.classList.remove('shaking');copy(label,()=>t('bt.failed'));return null;}
  }
  // a prize already opened, shown again
  function view(prize){const s=openSheet({title:h=>copy(h,()=>t('bt.prize.'+prize.tier)),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'pz-sheet'});show(s,prize);}
  // "What can be inside": every item of every tier, the ones you have in colour
  function catalog(owned){
    const s=openSheet({title:h=>copy(h,()=>t('prize.inside')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'pz-sheet pz-catalog'});
    for(const [tier,odds] of [['small','70%'],['big','25%'],['legendary','5%']]){
      const sec=el('section',undefined,'pz-tier '+tier);const head=el('div',undefined,'pz-tier-head');head.append(el('b',()=>t('bt.prize.'+tier)),el('span',()=>t('prize.odds.'+tier,{odds}),'pz-odds'));
      const grid=el('div',undefined,'pz-grid');
      for(const id of TIER_ITEMS[tier]){const have=owned(id);const c=el('div',undefined,'pz-cell'+(have?' have':''));c.append(itemArt(id,44),el('span',()=>itemName(t,id)));grid.append(c);}
      sec.append(head,grid);s.body.append(sec);}
    s.body.append(el('p',()=>t('prize.catalogHint'),'pz-hint'));
  }
  return {open,view,catalog,name:id=>itemName(t,id)};
}
