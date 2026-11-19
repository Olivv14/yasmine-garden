// Word duel: seven words from a deck, ten seconds each; then your partner plays the same words.
// Rounds are saved with play_start / play_answer (backend/010); the server counts the right answers.
import {DUEL_SIZE,DUEL_SECONDS,DUEL_DECKS,pickItems,choices,duelOutcome,outcomeText} from './duel.js';
import {answersOf,waitingForThem,finishedRounds} from './score.js';
import {icon} from '../design/icons.js';

let decksJob=null;
// The decks load on first use, in their own file, so the app starts without them.
export const loadDecks=()=>decksJob??=import('../../experience/decks.json',{with:{type:'json'}}).then(m=>m.default).catch(e=>{decksJob=null;throw e;});
const DECK_KEY='play.duelDeck',WORD_LANG={it:'it',ve:'es-VE',tn:'ar-TN'};
const readDeck=()=>{try{const v=localStorage.getItem(DECK_KEY);return DUEL_DECKS.includes(v)?v:'it';}catch{return 'it';}};

export function createDuel({el,button,t,copy,locale,me,person,partner,getSnapshot,start,answer}){
  const root=el('article',undefined,'card game-card duel');root.id='wordDuel';
  // view: home (pick a deck), play (a word on screen), after (your score, saved or not), result (a finished round)
  let deck=readDeck(),run=null,tick=0,saving=false,failed=false,view='home',shownResult=null;
  const name=()=>person(partner());
  const head=()=>{const h=el('div',undefined,'game-head');h.append(icon('duel',22),el('h3',()=>t('duel.title'),'title'));return h;};

  // ---- home: pick a deck and start; what waits for your partner; your last result
  function home(){
    view='home';shownResult=null;const snap=getSnapshot();root.replaceChildren(head(),el('p',()=>t('duel.intro',{name:name()}),'small'));
    root.append(el('p',()=>t('duel.deckLabel'),'eyebrow'));
    const row=el('div',undefined,'spice-picker');row.setAttribute('role','radiogroup');copy(row,()=>t('duel.deckLabel'),'aria-label');
    for(const d of DUEL_DECKS){const b=button(()=>t('duel.deck.'+d),()=>{deck=d;try{localStorage.setItem(DECK_KEY,d);}catch{}home();},'spice');
      b.setAttribute('role','radio');b.setAttribute('aria-checked',String(d===deck));b.dataset.deck=d;row.append(b);}
    root.append(row);
    const go=button(()=>t('duel.start'),()=>begin(null),'primary');go.id='duelStart';root.append(go);
    for(const r of waitingForThem(snap,me()).filter(r=>r.game==='word_duel').slice(0,2))root.append(el('p',()=>t('duel.waiting',{name:name()}),'small muted'));
    const last=finishedRounds(snap).find(f=>f.round.game==='word_duel');if(last)root.append(result(last.round));
  }
  function result(round){
    const snap=getSnapshot(),a=answersOf(snap,round.id),mine=a.find(x=>x.profile_id===me()),theirs=a.find(x=>x.profile_id!==me());
    const o=duelOutcome(mine,theirs),box=el('div',undefined,'duel-result');box.dataset.outcome=o??'';
    if(o)box.append(icon(o==='won'||o==='tieYou'?'crown':'duel',18),el('p',()=>t(...outcomeText(o,mine,theirs,name())),'body-strong'));
    return box;
  }

  // ---- playing: one word at a time
  async function begin(round){
    let data;try{data=await loadDecks();}catch{root.append(el('p',()=>t('common.unknownError'),'error'));return;}
    const items=round?round.items:pickItems(data.cards,deck,DUEL_SIZE);
    const cards=items.map(id=>data.cards.find(c=>c.id===id)).filter(Boolean);
    if(cards.length!==items.length){root.append(el('p',()=>t('game.needsUpdate'),'error'));return;}
    run={round,id:round?crypto.randomUUID():crypto.randomUUID(),deck:round?.deck??deck,items,cards,all:data.cards,idx:0,picks:[],ms:0,shownAt:0,picked:null};
    failed=false;view='play';word();
  }
  function word(){
    clearInterval(tick);const c=run.cards[run.idx],seed=run.round?.id??run.id;
    root.replaceChildren(head(),el('p',()=>t('duel.progress',{n:run.idx+1,total:run.cards.length}),'eyebrow'));
    const bar=el('div',undefined,'duel-timer');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(DUEL_SECONDS));
    const fill=el('span');bar.append(fill);root.append(bar);
    const w=el('p',undefined,'duel-word');w.textContent=c.word;w.lang=WORD_LANG[c.deck]??'';w.dir='auto';root.append(w);
    if(c.roman){const r=el('p',undefined,'duel-roman');r.textContent=c.roman;r.lang='aeb-Latn';r.dir='ltr';root.append(r);}
    root.append(el('p',()=>t('duel.question'),'small'));
    const opts=el('div',undefined,'duel-options'),feedback=el('p',undefined,'duel-feedback');feedback.setAttribute('role','status');
    const list=choices(c,run.all,locale(),seed),right=list.find(o=>o.correct).text;
    const finish=pick=>{
      if(run.picked!==null)return;clearInterval(tick);
      const spent=Math.min(DUEL_SECONDS*1000,Math.round(performance.now()-run.shownAt));run.ms+=pick===-1?DUEL_SECONDS*1000:spent;
      run.picked=pick;run.picks.push(pick===-1?-1:list[pick].correct?1:0);
      for(const [i,b] of [...opts.children].entries()){b.disabled=true;if(list[i].correct)b.classList.add('right');else if(i===pick)b.classList.add('wrong');}
      copy(feedback,()=>pick===-1?t('duel.late',{meaning:right}):list[pick].correct?t('duel.right'):t('duel.wrong',{meaning:right}));
      feedback.dataset.ok=String(pick!==-1&&list[pick].correct);
      const last=run.idx===run.cards.length-1;
      const next=button(()=>t(last?'duel.finish':'duel.next'),()=>{if(last)save();else{run.idx++;run.picked=null;word();}},'primary');next.id='duelNext';
      root.append(next);next.focus({preventScroll:true});
    };
    list.forEach((o,i)=>{const b=button(()=>'',()=>finish(i),'duel-option');b.textContent=o.text;b.dir='auto';opts.append(b);});
    root.append(opts,feedback);
    run.shownAt=performance.now();run.picked=null;opts.firstChild?.focus({preventScroll:true});
    const paint=()=>{const left=Math.max(0,DUEL_SECONDS-(performance.now()-run.shownAt)/1000);fill.style.inlineSize=(left/DUEL_SECONDS*100)+'%';
      bar.setAttribute('aria-valuenow',String(Math.ceil(left)));copy(bar,()=>t('duel.timeLeft',{seconds:Math.ceil(left)}),'aria-label');
      if(left<=0)finish(-1);};
    paint();tick=setInterval(paint,100);
  }
  async function save(){
    if(saving)return;saving=true;failed=false;
    root.replaceChildren(head(),el('p',()=>t('duel.score',{score:run.picks.filter(p=>p===1).length,total:run.cards.length}),'title duel-score'),el('p',()=>t('common.loading'),'small'));
    try{
      const ok=run.round?await answer({id:run.id,roundId:run.round.id,picks:run.picks,ms:run.ms}):await start({id:run.id,game:'word_duel',deck:run.deck,items:run.items,picks:run.picks,ms:run.ms});
      if(!ok)throw new Error('not saved');
      const done=run;run=null;after(done);
    }catch{failed=true;after(run);}
    finally{saving=false;}
  }
  function after(done){
    const score=done.picks.filter(p=>p===1).length;
    root.replaceChildren(head(),el('p',()=>t('duel.score',{score,total:done.cards.length}),'title duel-score'));
    if(failed){root.append(el('p',()=>t('common.unknownError'),'error'),button(()=>t('common.retry'),()=>save(),'primary'));return;}
    if(done.round)root.append(result(done.round));else root.append(el('p',()=>t('duel.sent',{name:name()}),'body-strong'));
    root.append(button(()=>t('duel.again'),()=>home(),''));
    view='after';shownResult=done.round?.id??null;
  }
  return {element:root,
    // a new snapshot: refresh the home view, or the result box of the round on screen; never interrupt a word
    render(){if(view==='home')return home();if((view==='after'||view==='result')&&shownResult){const r=getSnapshot()?.playRounds?.find(x=>x.id===shownResult);if(r)root.querySelector('.duel-result')?.replaceWith(result(r));}},
    open(round){clearInterval(tick);shownResult=null;if(round)begin(round);else home();},
    showResult(round){clearInterval(tick);run=null;view='result';shownResult=round.id;root.replaceChildren(head(),result(round),button(()=>t('duel.again'),()=>{shownResult=null;home();},''));},
    clear(){clearInterval(tick);run=null;shownResult=null;view='home';root.replaceChildren();},
    // leaving Play mid-duel drops the unfinished round (nothing was saved yet)
    stop(){clearInterval(tick);if(view==='play'&&!saving){run=null;view='home';}}};
}
