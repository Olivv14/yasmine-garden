// Play tab: truth or dare, live air hockey, recent games.
import {createTruthDare} from './truth-dare.js';
import {createHockey} from './hockey.js';
import {finishedGames,turnsPerFinish} from './rules.js';
import {authorTone} from '../garden/model.js';

export function createPlay({$,el,button,t,copy,locale,getSnapshot,getClient,me,person,rpc,notify}){
  const mount=$('playMount');
  const partner=()=>getSnapshot()?.members.map(m=>m.profile_id).find(id=>id!==me())??null;
  const tones=()=>{const s=getSnapshot();return s?{me:authorTone(me(),s.members,s.profiles),partner:authorTone(partner(),s.members,s.profiles)}:{me:'oliver',partner:'yasmine'};};
  // Returns true when saved. Missing backend/005 shows one clear message instead of a raw error.
  async function record({id=crypto.randomUUID(),game,kind,card=null,response=null,scoreMe=null,scorePartner=null}){
    try{await rpc('record_game_event',{p_id:id,p_game:game,p_kind:kind,p_card_id:card,p_response:response,p_score_me:scoreMe,p_score_partner:scorePartner});return true;}
    catch(e){if(['PGRST202','42883','42P01'].includes(e?.code)){notify(()=>t('game.needsUpdate'));return false;}notify(e?.uiKey?()=>t(e.uiKey):()=>t('common.unknownError'));return false;}
  }
  const td=createTruthDare({el,button,t,copy,me,person,partner,record,notify});
  const hockey=createHockey({el,button,t,copy,getClient,pairId:()=>getSnapshot()?.pairId,me,isHost:()=>getSnapshot()?.members.find(m=>m.profile_id===me())?.slot===1,partner,person,tones,record,notify});
  const history=el('section',undefined,'card game-history');
  mount.append(td.element,hockey.element,history);
  function render(){
    const snap=getSnapshot();if(!snap)return;td.render(snap);
    history.replaceChildren(el('h3',()=>t('game.history'),'title'));
    const list=finishedGames(snap.gameEvents).slice(0,8);
    if(!list.length){history.append(el('p',()=>t('game.historyEmpty'),'small'));return;}
    const ul=document.createElement('ul');ul.className='game-list';
    const turns=turnsPerFinish(snap.gameEvents);
    const date=v=>new Intl.DateTimeFormat(locale(),{dateStyle:'medium'}).format(new Date(v));
    for(const g of list){const li=document.createElement('li');
      if(g.game==='hockey'){const [a,b]=g.profile_id===me()?[g.score_me,g.score_partner]:[g.score_partner,g.score_me];copy(li,()=>t('game.finishedHockey',{a,b,date:date(g.created_at)}));}
      else copy(li,()=>t('game.finishedTd',{count:turns.get(g.id)??0,date:date(g.created_at)}));
      ul.append(li);}
    history.append(ul);
  }
  function clear(){hockey.stop();td.clear();history.replaceChildren();}
  return {render,clear,stop:()=>hockey.stop()};
}
