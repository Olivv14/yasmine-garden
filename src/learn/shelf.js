// The discovery shelf in Learn: every Tunisian and Venezuelan thing hidden in the 3D garden, as a little replica on
// its country's shelf. Found ones stand there in colour (tap: its word, what it means, hear it, see it in the
// garden); the rest wait as dashed outlines. The orchid (Venezuela's flower) sits on the Venezuelan shelf.
import {CULTURE} from '../garden3d/culture.js';
import {loadDiscoveries,partnerDiscoveries} from '../garden3d/discoveries.js';
import {icon} from '../design/icons.js';
import {SHELF_ART} from './shelf-art.js';

const NS='http://www.w3.org/2000/svg';
const SHELVES=[{from:'tn',items:CULTURE.filter(c=>c.from==='tn')},{from:'ve',items:CULTURE.filter(c=>c.from!=='tn')}];
const VOICE={tn:['fr-FR','fr'],ve:['es-VE','es-419','es-US','es']};
function replica(id,scale=1){const [w,h,body]=SHELF_ART[id]??[40,40,''];const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox',`0 0 ${w} ${h}`);
  s.setAttribute('width',String(Math.round(w*scale)));s.setAttribute('height',String(Math.round(h*scale)));s.setAttribute('aria-hidden','true');s.innerHTML=body;return s;}
const voiceFor=from=>{try{const vs=speechSynthesis.getVoices();return (VOICE[from]??[]).map(l=>vs.find(v=>v.lang?.toLowerCase().startsWith(l.toLowerCase()))).find(Boolean)??null;}catch{return null;}};

export function createShelf({el,button,t,copy,locale,getSnapshot,me,partner,person,showInGarden,prizes,openChest}){
  const root=el('section',undefined,'shelf');root.id='learnShelf';
  let picked=null;
  const date=iso=>{try{return new Intl.DateTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{day:'numeric',month:'short'}).format(new Date(iso));}catch{return '';}};
  function render(){
    const snap=getSnapshot();if(!snap||!me()){root.replaceChildren();return;}
    const mine=loadDiscoveries(),theirs=partnerDiscoveries(snap.gardenDiscoveries,partner()),when=new Map((snap.gardenDiscoveries??[]).filter(r=>r.profile_id===me()).map(r=>[r.spot,r.found_at]));
    const total=CULTURE.length,found=CULTURE.filter(c=>mine.has(c.id)).length,pct=Math.round(found/total*100);
    root.replaceChildren();
    const head=el('div',undefined,'shelf-head');const words=el('div');words.append(el('h3',()=>t('shelf.title'),'shelf-title'),el('p',()=>t('shelf.count',{found,total}),'shelf-sub'));
    const ring=el('span',undefined,'shelf-ring');ring.style.setProperty('--p',pct+'%');const inner=el('span',undefined,'shelf-ring-in');inner.textContent=pct+'%';ring.append(inner);
    head.append(words,ring);root.append(head);
    for(const sh of SHELVES){
      const got=sh.items.filter(c=>mine.has(c.id)).length,full=got===sh.items.length;
      const label=el('p',()=>t('shelf.from.'+sh.from,{found:got,total:sh.items.length}),'shelf-label');label.dataset.from=sh.from;
      root.append(label);
      for(let r=0;r<sh.items.length;r+=5){
      const wood=el('div',undefined,'shelf-wood'+(full?' full':''));wood.dataset.from=sh.from;
      for(const c of sh.items.slice(r,r+5)){
        const have=mine.has(c.id),theirsOnly=!have&&theirs.has(c.id);
        const b=button(()=>'',()=>{picked=picked===c.id?null:c.id;render();if(picked)root.querySelector('.shelf-card')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});},'shelf-item'+(have?' found':' missing')+(picked===c.id?' picked':''));
        b.dataset.id=c.id;copy(b,()=>have||theirsOnly?t(`culture.${c.id}.title`):t('shelf.hidden'),'aria-label');
        if(have)b.append(replica(c.id,.72));
        else{const q=el('span',undefined,'shelf-unknown');q.append(icon('question',20));b.append(q);if(theirsOnly){const f=el('span',undefined,'shelf-them');f.textContent=(person(partner())||'?').trim().charAt(0).toUpperCase();b.append(f);}}
        wood.append(b);
      }
      root.append(wood);}
      if(full){root.append(el('p',()=>t('shelf.full.'+sh.from),'shelf-full'));
        // the country's legendary chest (backend/020): opened once, by you
        const got=(snap.rewardBoxes??[]).find(b=>b.owner_id===me()&&b.source==='chest:'+sh.from);
        if(prizes&&openChest&&snap.hasRewards){const c=button(()=>got?t('shelf.chestOpened',{item:prizes.name(got.item??'points')}):t('shelf.openChest'),()=>got?prizes.view(got):prizes.open(()=>t('shelf.chestTitle.'+sh.from),()=>openChest(sh.from)),'shelf-chest'+(got?' got':''));
          c.prepend(icon('box',18));root.append(c);}}
    }
    if(picked)root.append(card(CULTURE.find(c=>c.id===picked),mine,theirs,when));
    else root.append(el('p',()=>found?t('shelf.pick'):t('shelf.empty'),'shelf-hint'));
    const goal=el('div',undefined,'shelf-goal');goal.append(icon('star',20),el('span',()=>t('shelf.goalChest')));root.append(goal);
  }
  function card(c,mine,theirs,when){
    const box=el('article',undefined,'shelf-card');const have=mine.has(c.id),theirsOnly=!have&&theirs.has(c.id);
    const row=el('div',undefined,'shelf-card-row');
    if(have||theirsOnly)row.append(replica(c.id,.95));else{const q=el('span',undefined,'shelf-unknown big');q.append(icon('question',30));row.append(q);}
    const words=el('div',undefined,'shelf-card-words');
    if(have){const at=when.get(c.id);words.append(el('p',()=>at?t('shelf.foundByYouOn',{date:date(at)}):t('shelf.foundByYou'),'shelf-eyebrow'));}
    else if(theirsOnly)words.append(el('p',()=>t('shelf.foundBy',{name:person(partner())}),'shelf-eyebrow'));
    else words.append(el('p',()=>t('shelf.notYet'),'shelf-eyebrow'));
    if(have){const w=el('p',undefined,'shelf-word');w.textContent=c.word;if(c.lang)w.lang=c.lang;w.dir='ltr';
      words.append(w,el('p',()=>t(`culture.${c.id}.meaning`)+' · '+t(`culture.${c.id}.title`),'shelf-meaning'));}
    else words.append(el('p',()=>theirsOnly?t('shelf.partnerHint',{name:person(partner())}):t('shelf.hiddenHint'),'shelf-meaning'));
    row.append(words);box.append(row);
    const acts=el('div',undefined,'shelf-card-acts');
    if(have&&'speechSynthesis' in window&&c.from!=='both'){const hear=button(()=>t('shelf.hear'),()=>{try{const v=voiceFor(c.from),u=new SpeechSynthesisUtterance(c.word.split(',')[0]);if(v){u.voice=v;u.lang=v.lang;}u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}},'shelf-btn dark');hear.prepend(icon('sound',16));acts.append(hear);}
    if(have||theirsOnly){const see=button(()=>t('shelf.see'),()=>showInGarden?.(c.id),'shelf-btn line');see.prepend(icon('sprout',16));acts.append(see);}
    if(acts.childElementCount)box.append(acts);
    return box;
  }
  return {element:root,render,clear(){picked=null;root.replaceChildren();}};
}
