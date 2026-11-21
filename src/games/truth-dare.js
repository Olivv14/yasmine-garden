// Truth or dare: take turns, any time, at the spice level you pick (mild, hot, Harissa; this phone remembers).
// Turns are saved through record_game_event (backend/005); the level is part of each card's id.
import {currentTruthDare,whoseTurn,drawCard,cardKey,levelOf,LEVELS} from './rules.js';
import {icon} from '../design/icons.js';
import {pic} from './starts.js';

const SPICE='play.spice';
const readSpice=()=>{try{const v=Number(localStorage.getItem(SPICE));return LEVELS.includes(v)?v:1;}catch{return 1;}};

export function createTruthDare({el,button,t,copy,me,person,partner,record,notify}){
  const root=el('article',undefined,'card game-card');root.id='truthDare';
  let drawn=null,draft='',busy=false,snap=null,spice=readSpice();
  function spicePicker(){
    const row=el('div',undefined,'spice-picker');row.setAttribute('role','radiogroup');copy(row,()=>t('game.td.spice'),'aria-label');
    for(const l of LEVELS){
      const b=button(()=>t('game.td.level'+l),()=>{spice=l;try{localStorage.setItem(SPICE,String(l));}catch{}render();},'spice spice-tile');
      b.setAttribute('role','radio');b.setAttribute('aria-checked',String(l===spice));b.dataset.level=String(l);
      b.prepend(pic(['mild','hot','harissa'][l-1],'spice-pic'));
      row.append(b);
    }
    return row;
  }
  function render(next){
    snap=next??snap;if(!snap)return;root.replaceChildren();
    const turns=currentTruthDare(snap.gameEvents),turn=whoseTurn(turns,me()),p=partner();
    const head=el('div',undefined,'game-head');head.append(icon('dice',22),el('h3',()=>t('game.td.title'),'title'));
    root.append(head);
    if(!drawn){
      // the spice table: a truth card, a dare card and the little brazier
      const hero=el('div',undefined,'td-hero');hero.setAttribute('aria-hidden','true');
      hero.append(el('span',undefined,'td-hero-table'),el('span',()=>t('game.td.truth'),'td-hero-card truth'),el('span',()=>t('game.td.dare'),'td-hero-card dare'),pic('brazier','td-hero-fire'));
      root.append(hero);
    }
    root.append(el('p',()=>t('game.td.intro'),'small td-intro'));
    const status=el('p',()=>turn==='anyone'?t('game.td.firstTurn'):turn==='me'?t('game.td.yourTurn'):t('game.td.partnerTurn',{name:person(p)}),'body-strong');
    status.setAttribute('role','status');root.append(status);
    const last=turns[turns.length-1];
    if(last){
      const line=el('p',()=>t('game.td.last',{name:person(last.profile_id),kind:t('game.td.'+last.kind),card:t(cardKey(last.card_id))}),'small');
      line.dataset.tone=last.profile_id===me()?'me':'partner';
      const lvl=el('span',()=>t('game.td.level'+levelOf(last.card_id)),'spice-chip');lvl.dataset.level=String(levelOf(last.card_id));
      root.append(lvl,line);
      if(last.response){const q=el('blockquote',undefined,'game-response');q.dir='auto';q.textContent=last.response;root.append(q);}
    }
    if(turn!=='partner'){
      if(!drawn){
        root.append(el('p',()=>t('gs.td.howSpicy'),'td-how'),spicePicker());
        const mine=(snap.gameEvents??[]).filter(e=>e.game==='truth_dare'&&e.profile_id===me());
        root.append(el('p',()=>t('gs.td.counts',{truths:mine.filter(e=>e.kind==='truth').length,dares:mine.filter(e=>e.kind==='dare').length}),'td-counts'));
        const row=el('div',undefined,'game-actions td-big-row');
        for(const kind of ['truth','dare'])row.append(button(()=>t('game.td.'+kind),()=>{drawn={kind,card:drawCard(kind,turns,Math.random,spice)};render();},'td-big '+kind));
        root.append(row);
      }else{
        // back to the spice levels (and another card of the same kind), without leaving the game
        const nav=el('div',undefined,'td-nav');
        const back=button(()=>t('game.td.backSpice'),()=>{drawn=null;draft='';render();},'link td-back');back.prepend(icon('back',16));
        const again=button(()=>t('game.td.another'),()=>{drawn={kind:drawn.kind,card:drawCard(drawn.kind,turns,Math.random,spice)};draft='';render();},'link td-again');
        nav.append(back,again);root.append(nav);
        const card=el('div',undefined,'game-draw');card.dataset.kind=drawn.kind;card.dataset.level=String(levelOf(drawn.card));
        const chilis=el('div',undefined,'td-chilis');chilis.setAttribute('aria-hidden','true');for(let i=0;i<levelOf(drawn.card);i++)chilis.append(chili());
        card.append(chilis,el('p',()=>t('game.td.'+drawn.kind)+' · '+t('game.td.level'+levelOf(drawn.card)),'td-tag'),el('p',()=>t(cardKey(drawn.card)),'title'));
        const label=el('label',()=>t('game.td.response'));const area=document.createElement('textarea');area.id='tdResponse';area.maxLength=500;area.dir='auto';area.value=draft;area.oninput=()=>{draft=area.value;};label.htmlFor=area.id;
        const done=button(()=>t('game.td.done'),async e=>{if(busy)return;busy=true;const b=e.currentTarget;b.disabled=true;try{if(await record({game:'truth_dare',kind:drawn.kind,card:drawn.card,response:draft.trim()||null})){drawn=null;draft='';}}finally{busy=false;if(b.isConnected)b.disabled=false;render();}},'primary');
        card.append(label,area,done);root.append(card);
      }
    }
    copy(root.appendChild(el('p',undefined,'small')),()=>t('game.td.turns',{count:turns.length}));
    if(turns.length)root.append(button(()=>t('game.td.finish'),async e=>{const b=e.currentTarget;b.disabled=true;try{if(await record({game:'truth_dare',kind:'finish'}))notify(()=>t('game.td.finished'));}finally{if(b.isConnected)b.disabled=false;}},'quiet'));
    // the brazier at the bottom burns brighter at Hot and Harissa
    if(!drawn)return;
    const fire=el('div',undefined,'td-brazier');fire.dataset.level=String(drawn?levelOf(drawn.card):spice);fire.setAttribute('aria-hidden','true');
    fire.append(el('span',undefined,'td-glow'),el('span',undefined,'td-flame'),el('span',undefined,'td-flame two'),el('span',undefined,'td-bowl'));root.append(fire);
  }
  function chili(){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 40 60');
    s.innerHTML='<path d="M20 14 C8 22 6 40 14 56 C24 50 32 34 28 18 Z" fill="#E0201A"/><path d="M15 30 C14 38 15 46 17 52" stroke="#FF9A8A" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/><path d="M20 15 C20 8 25 4 30 4" stroke="#3E8A2A" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M15 16 C19 11 25 12 28 17" stroke="#3E8A2A" stroke-width="3" fill="none" stroke-linecap="round"/>';return s;}
  function clear(){snap=null;drawn=null;draft='';root.replaceChildren();}
  return {element:root,render,clear,leave(){drawn=null;draft='';}};
}
