// Play tab: this week's points and your seeds, games waiting for you, and the four games.
// Truth or dare and hockey results are game_events (backend/005, 010); word duels and know-me are rounds
// played in turns (backend/010). Every label comes from the catalog.
import {createTruthDare} from './truth-dare.js';
import {createHockey} from './hockey.js';
import {createPool} from './pool.js';
import {SCENE_ART} from './scene-art.js';
import {createDuel} from './duel-ui.js';
import {createKnowMe} from './knowme-ui.js';
import {pointsBy,weekStart,seeds,waitingForMe,answersOf} from './score.js';
import {authorTone} from '../garden/model.js';
import {icon} from '../design/icons.js';

const MISSING=['PGRST202','42883','42P01'];
export function createPlay({$,el,button,t,copy,locale,getSnapshot,getClient,me,person,photoOf=()=>null,rpc,notify,navigate,openPlant,onWaiting,onRound}){
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
  const hockey=createHockey({el,button,t,copy,getClient,pairId:()=>getSnapshot()?.pairId,me,isHost:()=>getSnapshot()?.members.find(m=>m.profile_id===me())?.slot===1,partner,person,tones,record,notify,photo:photoOf});
  const pool=createPool({el,button,t,copy,getClient,pairId:()=>getSnapshot()?.pairId,me,isHost:()=>getSnapshot()?.members.find(m=>m.profile_id===me())?.slot===1,partner,person,tones,record,photo:photoOf});
  const duel=createDuel(shared),knowme=createKnowMe(shared);
  const GAMES={td:{icon:'dice',title:'game.td.title',hint:'play.td.hint',game:td},hockey:{icon:'live',title:'game.hockey.title',hint:'play.hockey.hint',game:hockey},pool:{icon:'pool',title:'pool.title',hint:'play.pool.hint',game:pool},
    duel:{icon:'duel',title:'duel.title',hint:'play.duel.hint',game:duel},knowme:{icon:'knowme',title:'knowme.title',hint:'play.knowme.hint',game:knowme}};

  const board=el('section',undefined,'card play-board');board.id='playBoard';
  const turns=el('section',undefined,'play-turns');turns.id='playTurns';
  const tiles=el('section',undefined,'play-games');tiles.id='playGames';
  const stage=el('section',undefined,'play-stage');stage.id='playStage';stage.hidden=true;
  mount.append(board,turns,tiles,stage);
  let open=null;

  tiles.append(el('h3',()=>t('play.gamesTitle'),'eyebrow play-games-title'));
  const grid=el('div',undefined,'play-grid');tiles.append(grid);
  for(const [id,g] of Object.entries(GAMES)){
    const b=button(()=>'',()=>show(id),'play-tile');b.dataset.game=id;b.id='tile-'+id;
    const art=el('span',undefined,'play-tile-icon');art.append(icon(g.icon,26));
    b.append(art,el('span',()=>t(g.title),'play-tile-title'),el('span',()=>t(g.hint),'play-tile-hint'));grid.append(b);
  }
  // One game at a time on the stage; "All games" goes back to the tiles.
  // Every game opens full screen over the app, in the dusk garden; "‹ Games" goes back to the tiles.
  const backdrop=el('div',undefined,'scene-art game-backdrop');backdrop.innerHTML=SCENE_ART.hockeyScene;backdrop.firstElementChild?.setAttribute('preserveAspectRatio','xMidYMid slice');backdrop.setAttribute('aria-hidden','true');
  function show(id,then){
    if(open&&open!==id)stopGames();open=id;tiles.hidden=!!id;stage.hidden=!id;stage.replaceChildren();
    document.documentElement.classList.toggle('game-full',!!id);stage.dataset.game=id??'';
    // full screen means above everything: the stage moves to the top of the page while a game is open
    if(id&&stage.parentElement!==document.body)document.body.append(stage);
    if(!id&&stage.parentElement!==mount)mount.append(stage);
    if(!id)return;
    const back=button(()=>t('games.back'),()=>{stopGames();show(null);},'link play-back');back.prepend(icon('back',16));
    const bar=el('div',undefined,'game-bar');bar.append(back);
    stage.append(backdrop,bar,GAMES[id].game.element);
    if(id==='td')td.render(getSnapshot());
    if(then)then();else GAMES[id].game.render?.(getSnapshot());
    stage.scrollTop=0;
  }
  function stopGames(){hockey.stop();pool.stop();duel.stop();knowme.stop();}
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
      // your faces instead of coloured dots: the photo when there is one, else the initial in your colour
      const face=el('span',undefined,'play-face');const src=photoOf(id);
      if(src){const img=document.createElement('img');img.src=src;img.alt='';face.append(img);}else face.textContent=(person(id)||'?').trim().charAt(0).toUpperCase();
      const top=el('div',undefined,'play-score-top');top.append(face,n);
      col.append(top,who,bar);row.append(col);
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
  function render(){
    const snap=getSnapshot();if(!snap)return;
    paintBoard(snap);paintTurns(snap);
    if(open==='td')td.render(snap);else if(open==='duel')duel.render();else if(open==='knowme')knowme.render();
  }
  function clear(){document.documentElement.classList.remove('game-full');stopGames();td.clear();duel.clear();knowme.clear();board.replaceChildren();turns.replaceChildren();show(null);onWaiting?.(0);}
  return {render,clear,stop:()=>{stopGames();if(open)show(null);},openRound,show};
}
