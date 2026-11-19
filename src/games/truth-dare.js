// Truth or dare: take turns, any time, at the spice level you pick (mild, hot, Harissa; this phone remembers).
// Turns are saved through record_game_event (backend/005); the level is part of each card's id.
import {currentTruthDare,whoseTurn,drawCard,cardKey,levelOf,LEVELS} from './rules.js';
import {icon} from '../design/icons.js';

const SPICE='play.spice';
const readSpice=()=>{try{const v=Number(localStorage.getItem(SPICE));return LEVELS.includes(v)?v:1;}catch{return 1;}};

export function createTruthDare({el,button,t,copy,me,person,partner,record,notify}){
  const root=el('article',undefined,'card game-card');root.id='truthDare';
  let drawn=null,draft='',busy=false,snap=null,spice=readSpice();
  function spicePicker(){
    const row=el('div',undefined,'spice-picker');row.setAttribute('role','radiogroup');copy(row,()=>t('game.td.spice'),'aria-label');
    for(const l of LEVELS){
      const b=button(()=>t('game.td.level'+l),()=>{spice=l;try{localStorage.setItem(SPICE,String(l));}catch{}render();},'spice');
      b.setAttribute('role','radio');b.setAttribute('aria-checked',String(l===spice));b.dataset.level=String(l);
      const dots=el('span',undefined,'spice-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<l;i++)dots.append(icon('flame',14));b.prepend(dots);
      row.append(b);
    }
    return row;
  }
  function render(next){
    snap=next??snap;if(!snap)return;root.replaceChildren();
    const turns=currentTruthDare(snap.gameEvents),turn=whoseTurn(turns,me()),p=partner();
    const head=el('div',undefined,'game-head');head.append(icon('dice',22),el('h3',()=>t('game.td.title'),'title'));
    root.append(head,el('p',()=>t('game.td.intro'),'small'));
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
        root.append(el('p',()=>t('game.td.spice'),'eyebrow'),spicePicker());
        const row=el('div',undefined,'game-actions');
        for(const kind of ['truth','dare'])row.append(button(()=>t('game.td.'+kind),()=>{drawn={kind,card:drawCard(kind,turns,Math.random,spice)};render();},kind==='truth'?'primary':''));
        root.append(row);
      }else{
        const card=el('div',undefined,'game-draw');card.dataset.kind=drawn.kind;card.dataset.level=String(levelOf(drawn.card));
        card.append(el('p',()=>t('game.td.'+drawn.kind)+' · '+t('game.td.level'+levelOf(drawn.card)),'eyebrow'),el('p',()=>t(cardKey(drawn.card)),'title'));
        const label=el('label',()=>t('game.td.response'));const area=document.createElement('textarea');area.id='tdResponse';area.maxLength=500;area.dir='auto';area.value=draft;area.oninput=()=>{draft=area.value;};label.htmlFor=area.id;
        const done=button(()=>t('game.td.done'),async e=>{if(busy)return;busy=true;const b=e.currentTarget;b.disabled=true;try{if(await record({game:'truth_dare',kind:drawn.kind,card:drawn.card,response:draft.trim()||null})){drawn=null;draft='';}}finally{busy=false;if(b.isConnected)b.disabled=false;render();}},'primary');
        card.append(label,area,done);root.append(card);
      }
    }
    copy(root.appendChild(el('p',undefined,'small')),()=>t('game.td.turns',{count:turns.length}));
    if(turns.length)root.append(button(()=>t('game.td.finish'),async e=>{const b=e.currentTarget;b.disabled=true;try{if(await record({game:'truth_dare',kind:'finish'}))notify(()=>t('game.td.finished'));}finally{if(b.isConnected)b.disabled=false;}},'quiet'));
  }
  function clear(){snap=null;drawn=null;draft='';root.replaceChildren();}
  return {element:root,render,clear};
}
