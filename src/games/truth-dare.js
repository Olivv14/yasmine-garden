// Truth or dare: take turns, any time. Turns are saved through record_game_event (backend/005).
import {currentTruthDare,whoseTurn,drawCard,cardKey} from './rules.js';
import {icon} from '../design/icons.js';

export function createTruthDare({el,button,t,copy,me,person,partner,record,notify}){
  const root=el('article',undefined,'card game-card');root.id='truthDare';
  let drawn=null,draft='',busy=false,snap=null;
  function render(next){
    snap=next??snap;if(!snap)return;root.replaceChildren();
    const turns=currentTruthDare(snap.gameEvents),turn=whoseTurn(turns,me()),p=partner();
    const head=el('div',undefined,'game-head');head.append(icon('dice',22),el('h3',()=>t('game.td.title'),'title'));
    root.append(head,el('p',()=>t('game.td.intro'),'small'));
    const status=el('p',()=>turn==='anyone'?t('game.td.firstTurn'):turn==='me'?t('game.td.yourTurn'):t('game.td.partnerTurn',{name:person(p)}),'body-strong');
    status.setAttribute('role','status');root.append(status);
    const last=turns[turns.length-1];
    if(last){const line=el('p',()=>t('game.td.last',{name:person(last.profile_id),kind:t('game.td.'+last.kind),card:t(cardKey(last.card_id))}),'small');line.dataset.tone=last.profile_id===me()?'me':'partner';root.append(line);
      if(last.response){const q=el('blockquote',undefined,'game-response');q.dir='auto';q.textContent=last.response;root.append(q);}}
    if(turn!=='partner'){
      if(!drawn){const row=el('div',undefined,'game-actions');for(const kind of ['truth','dare'])row.append(button(()=>t('game.td.'+kind),()=>{drawn={kind,card:drawCard(kind,turns)};render();},kind==='truth'?'primary':''));root.append(row);}
      else{
        const card=el('div',undefined,'game-draw');card.dataset.kind=drawn.kind;
        card.append(el('p',()=>t('game.td.'+drawn.kind),'eyebrow'),el('p',()=>t(cardKey(drawn.card)),'title'));
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
