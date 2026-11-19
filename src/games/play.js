// Play tab: this week's points and your seeds, games waiting for you, the four games, and recent results.
// Truth or dare and hockey results are game_events (backend/005, 010); word duels and know-me are rounds
// played in turns (backend/010). Every label comes from the catalog.
import {createTruthDare} from './truth-dare.js';
import {createHockey} from './hockey.js';
import {createDuel} from './duel-ui.js';
import {createKnowMe} from './knowme-ui.js';
import {finishedGames,turnsPerFinish} from './rules.js';
import {pointsBy,weekStart,seeds,waitingForMe,finishedRounds,answersOf} from './score.js';
import {authorTone} from '../garden/model.js';
import {icon} from '../design/icons.js';

const MISSING=['PGRST202','42883','42P01'];
export function createPlay({$,el,button,t,copy,locale,getSnapshot,getClient,me,person,rpc,notify,navigate,openPlant,onWaiting,onRound}){
  const mount=$('playMount');
  const partner=()=>getSnapshot()?.members.map(m=>m.profile_id).find(id=>id!==me())??null;
  const tones=()=>{const s=getSnapshot();return s?{me:authorTone(me(),s.members,s.profiles),partner:authorTone(partner(),s.members,s.profiles)}:{me:'oliver',partner:'yasmine'};};
  // Returns true when saved. Missing backend/005 shows one clear message instead of a raw error.
  async function record({id=crypto.randomUUID(),game,kind,card=null,response=null,scoreMe=null,scorePartner=null}){
    try{await rpc('record_game_event',{p_id:id,p_game:game,p_kind:kind,p_card_id:card,p_response:response,p_score_me:scoreMe,p_score_partner:scorePartner});return true;}
    catch(e){if(MISSING.includes(e?.code)){notify(()=>t('game.needsUpdate'));return false;}notify(e?.uiKey?()=>t(e.uiKey):()=>t('common.unknownError'));return false;}
  }
  // Your partner's phones get a push for a new round or your answer; best effort (the round is already saved).
  const dispatch=id=>getClient()?.functions.invoke('dispatch-notification',{body:{event_id:id}}).catch(()=>{});
  async function start({id,game,deck,items,picks,ms}){
    try{await rpc('play_start',{p_id:id,p_game:game,p_deck:deck??null,p_items:items,p_picks:picks,p_ms:ms??null});}
    catch(e){if(MISSING.includes(e?.code))notify(()=>t('game.needsUpdate'));return false;}
    dispatch(id);return true;
  }
  async function answer({id,roundId,picks,ms}){
    try{await rpc('play_answer',{p_id:id,p_round_id:roundId,p_picks:picks,p_ms:ms??null});}
    catch(e){if(e?.code==='PT409')return true;if(MISSING.includes(e?.code))notify(()=>t('game.needsUpdate'));return false;}
    dispatch(id);return true;
  }
  const shared={el,button,t,copy,locale,me,person,partner,getSnapshot,start,answer};
  const td=createTruthDare({el,button,t,copy,me,person,partner,record,notify});
  const hockey=createHockey({el,button,t,copy,getClient,pairId:()=>getSnapshot()?.pairId,me,isHost:()=>getSnapshot()?.members.find(m=>m.profile_id===me())?.slot===1,partner,person,tones,record,notify});
  const duel=createDuel(shared),knowme=createKnowMe(shared);
  const GAMES={td:{icon:'dice',title:'game.td.title',hint:'play.td.hint',game:td},hockey:{icon:'live',title:'game.hockey.title',hint:'play.hockey.hint',game:hockey},
    duel:{icon:'duel',title:'duel.title',hint:'play.duel.hint',game:duel},knowme:{icon:'knowme',title:'knowme.title',hint:'play.knowme.hint',game:knowme}};

  const board=el('section',undefined,'card play-board');board.id='playBoard';
  const turns=el('section',undefined,'play-turns');turns.id='playTurns';
  const tiles=el('section',undefined,'play-games');tiles.id='playGames';
  const stage=el('section',undefined,'play-stage');stage.id='playStage';stage.hidden=true;
  const history=el('section',undefined,'card game-history');
  mount.append(board,turns,tiles,stage,history);
  let open=null;

  tiles.append(el('h3',()=>t('play.gamesTitle'),'eyebrow play-games-title'));
  const grid=el('div',undefined,'play-grid');tiles.append(grid);
  for(const [id,g] of Object.entries(GAMES)){
    const b=button(()=>'',()=>show(id),'play-tile');b.dataset.game=id;b.id='tile-'+id;
    const art=el('span',undefined,'play-tile-icon');art.append(icon(g.icon,26));
    b.append(art,el('span',()=>t(g.title),'play-tile-title'),el('span',()=>t(g.hint),'play-tile-hint'));grid.append(b);
  }
  // One game at a time on the stage; "All games" goes back to the tiles.
  function show(id,then){
    if(open&&open!==id)stopGames();open=id;tiles.hidden=!!id;stage.hidden=!id;stage.replaceChildren();
    if(!id)return;
    const back=button(()=>t('play.back'),()=>{stopGames();show(null);},'link play-back');back.prepend(icon('back',16));
    stage.append(back,GAMES[id].game.element);
    if(id==='td')td.render(getSnapshot());
    if(then)then();else GAMES[id].game.render?.(getSnapshot());
    stage.scrollIntoView?.({block:'start'});
  }
  function stopGames(){hockey.stop();duel.stop();knowme.stop();}
  // A round from the bell or a "Your turn" card: play it if it waits for you, otherwise show its result.
  function openRound(roundId){
    const snap=getSnapshot(),r=snap?.playRounds?.find(x=>x.id===roundId);if(!r)return false;
    const id=r.game==='word_duel'?'duel':'knowme',g=GAMES[id].game,mine=answersOf(snap,r.id).some(a=>a.profile_id===me());
    show(id,()=>mine?g.showResult(r):g.open(r));onRound?.(r.id);return true;
  }

  function paintBoard(snap){
    const pts=pointsBy(snap,weekStart()),p=partner(),s=seeds(snap,me()),max=Math.max(1,...pts.values());
    board.replaceChildren(el('p',()=>t('play.week'),'eyebrow'));
    const row=el('div',undefined,'play-scores');
    for(const id of [me(),p].filter(Boolean)){
      const col=el('div',undefined,'play-score');col.dataset.tone=authorTone(id,snap.members,snap.profiles);
      const n=el('p',undefined,'play-points');n.textContent=new Intl.NumberFormat(locale()==='aeb-TN'?'ar-TN':locale()).format(pts.get(id)??0);
      const who=el('p',undefined,'small');who.textContent=person(id);who.dir='auto';
      const bar=el('span',undefined,'play-bar');bar.style.setProperty('--fill',((pts.get(id)??0)/max*100).toFixed(1)+'%');
      col.append(n,who,bar);row.append(col);
    }
    const seed=el('div',undefined,'play-seeds');seed.append(icon('sprout',20),el('p',()=>t('play.seeds',{count:s.left}),'body-strong'));
    board.append(row,seed,el('p',()=>t('play.seedsHint'),'small muted'));
    if(s.left>0){const b=button(()=>t('play.plantNow'),()=>{navigate('garden');setTimeout(()=>openPlant(),250);},'quiet');b.prepend(icon('shovel',16));board.append(b);}
  }
  function paintTurns(snap){
    const waiting=waitingForMe(snap,me());turns.replaceChildren();onWaiting?.(waiting.length);
    if(!waiting.length){turns.hidden=true;return;}turns.hidden=false;
    turns.append(el('h3',()=>t('play.turnTitle'),'eyebrow'));
    for(const r of waiting.slice(0,3)){
      const card=el('article',undefined,'card play-turn');card.dataset.game=r.game;
      if(r.game==='word_duel'){
        const theirs=answersOf(snap,r.id).find(a=>a.profile_id===r.started_by);
        card.append(icon('duel',22),el('p',()=>t('duel.challenge',{name:person(r.started_by),deck:t('duel.deck.'+r.deck),score:theirs?.score??0,total:r.items.length})),button(()=>t('duel.play'),()=>openRound(r.id),'primary'));
      }else card.append(icon('knowme',22),el('p',()=>t('knowme.challenge',{name:person(r.started_by)})),button(()=>t('knowme.guess'),()=>openRound(r.id),'primary'));
      turns.append(card);
    }
  }
  function paintHistory(snap){
    history.replaceChildren(el('h3',()=>t('game.history'),'title'));
    const date=v=>new Intl.DateTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{dateStyle:'medium'}).format(new Date(v));
    const turnsBy=turnsPerFinish(snap.gameEvents);
    const items=[
      ...finishedGames(snap.gameEvents).filter(g=>g.game!=='hockey_bot'||g.profile_id===me()).map(g=>({at:Date.parse(g.created_at),line:()=>{
        if(g.game==='hockey'){const [a,b]=g.profile_id===me()?[g.score_me,g.score_partner]:[g.score_partner,g.score_me];return t('game.finishedHockey',{a,b,date:date(g.created_at)});}
        if(g.game==='hockey_bot')return t('game.finishedBot',{a:g.score_me,b:g.score_partner,date:date(g.created_at)});
        return t('game.finishedTd',{count:turnsBy.get(g.id)??0,date:date(g.created_at)});}})),
      ...finishedRounds(snap).map(({round:r,at})=>({at,round:r.id,line:()=>{
        const a=answersOf(snap,r.id);
        if(r.game==='word_duel'){const mine=a.find(x=>x.profile_id===me()),theirs=a.find(x=>x.profile_id!==me());return t('game.finishedDuel',{a:mine?.score??0,b:theirs?.score??0,date:date(at)});}
        const g=a.find(x=>x.role==='guess');return t('game.finishedKnowMe',{score:g?.score??0,total:r.items.length,date:date(at)});}})),
    ].sort((x,y)=>y.at-x.at).slice(0,8);
    if(!items.length){history.append(el('p',()=>t('game.historyEmpty'),'small'));return;}
    const ul=document.createElement('ul');ul.className='game-list';
    for(const it of items){const li=document.createElement('li');
      if(it.round){const b=button(it.line,()=>openRound(it.round),'link');li.append(b);}else copy(li,it.line);
      ul.append(li);}
    history.append(ul);
  }
  function render(){
    const snap=getSnapshot();if(!snap)return;
    paintBoard(snap);paintTurns(snap);paintHistory(snap);
    if(open==='td')td.render(snap);else if(open==='duel')duel.render();else if(open==='knowme')knowme.render();
  }
  function clear(){stopGames();td.clear();duel.clear();knowme.clear();board.replaceChildren();turns.replaceChildren();history.replaceChildren();show(null);onWaiting?.(0);}
  return {render,clear,stop:()=>stopGames(),openRound,show};
}
