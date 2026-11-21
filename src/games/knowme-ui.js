// "How well do you know me?": you answer five questions about yourself, then your partner guesses.
// Your answers stay hidden from your partner until they have guessed (backend/010 read policy);
// the server counts the matches. Questions and answers come from the catalog in five languages.
import {KNOWME_SIZE,OPTIONS,questionKey,optionKey,pickQuestions} from './knowme.js';
import {answersOf,waitingForThem,waitingForMe,finishedRounds} from './score.js';
import {face} from './starts.js';
import {icon} from '../design/icons.js';

export function createKnowMe({el,button,t,copy,me,person,partner,getSnapshot,start,answer,photo=()=>null}){
  const root=el('article',undefined,'card game-card knowme');root.id='knowMe';
  // view: home, ask (answering, about you or guessing), after (saved, or failed to save), result
  let view='home',run=null,saving=false,failed=false,shownResult=null;
  const name=()=>person(partner());
  const head=()=>{const h=el('div',undefined,'game-head');h.append(icon('knowme',22),el('h3',()=>t('knowme.title'),'title'));return h;};

  // the start screen (mockup): the two of you, the five questions you are about to answer (the first ones
  // readable, the rest fading), how well your partner knew you last time, and the two ways in
  let preview=null;
  const recentMine=snap=>(snap?.playRounds??[]).filter(r=>r.game==='know_me'&&r.started_by===me()).slice(0,4).flatMap(r=>r.items);
  function home(){
    view='home';shownResult=null;const snap=getSnapshot();
    preview??=pickQuestions(recentMine(snap),KNOWME_SIZE);
    root.replaceChildren(head());
    const pair=el('div',undefined,'km-pair');const heart=el('span',undefined,'km-heart');heart.append(icon('heart',26));
    pair.append(face(el,me(),{photo,person,cls:'km-face me'}),heart,face(el,partner(),{photo,person,cls:'km-face them'}));
    root.append(pair,el('p',()=>t('gs.km.intro',{name:name()}),'km-intro'));
    const list=el('ol',undefined,'km-preview');
    preview.forEach((q,i)=>{const li=document.createElement('li');li.dataset.i=String(i);li.append(el('span',String(i+1),'km-n'),el('span',()=>t(questionKey(q)),'km-q'));list.append(li);});
    root.append(list);
    const last=finishedRounds(snap).find(f=>f.round.game==='know_me');
    if(last){const a=answersOf(snap,last.round.id),self=a.find(x=>x.role==='self'),guess=a.find(x=>x.role==='guess');
      if(self&&guess){const box=el('div',undefined,'km-last');const mine=self.profile_id===me();
        const score=el('b');score.textContent=t('gs.km.score',{score:guess.score,total:last.round.items.length});copy(score,()=>t('gs.km.score',{score:guess.score,total:last.round.items.length}));
        box.append(el('span',()=>mine?t('gs.km.knewYou',{name:name()}):t('gs.km.youKnew',{name:name()})),score,el('span',()=>t('gs.km.lastTime')));root.append(box);}}
    for(const r of waitingForThem(snap,me()).filter(r=>r.game==='know_me').slice(0,1))root.append(el('p',()=>t('knowme.waiting',{name:name()}),'small muted km-wait'));
    const toGuess=waitingForMe(snap,me()).find(r=>r.game==='know_me');
    const acts=el('div',undefined,'km-acts');
    const g=button(()=>toGuess?t('gs.km.guess',{name:name()}):t('gs.km.nothing',{name:name()}),()=>{if(toGuess)begin(toGuess);},'km-guess');g.disabled=!toGuess;
    const go=button(()=>t('gs.km.answer'),()=>begin(null),'km-answer');go.id='knowmeStart';
    acts.append(g,go);root.append(acts);
  }
  // A finished round: every question with the real answer and the guess.
  function result(round,compact=false){
    const snap=getSnapshot(),a=answersOf(snap,round.id),self=a.find(x=>x.role==='self'),guess=a.find(x=>x.role==='guess');
    const box=el('div',undefined,'knowme-result');if(!self||!guess)return box;
    const iAnswered=self.profile_id===me(),total=round.items.length;
    box.append(el('p',()=>iAnswered?t('knowme.theyGot',{name:name(),score:guess.score,total}):t('knowme.youGot',{score:guess.score,total}),'body-strong'));
    if(compact)return box;
    const list=el('ol',undefined,'knowme-list');
    round.items.forEach((q,i)=>{
      const li=document.createElement('li');const ok=self.picks[i]===guess.picks[i];li.dataset.ok=String(ok);
      li.append(el('p',()=>t(questionKey(q)),'knowme-q'));
      const real=()=>t(optionKey(q,self.picks[i])),guessed=()=>t(optionKey(q,guess.picks[i]));
      li.append(el('p',()=>iAnswered?t('knowme.yourAnswer',{answer:real()}):t('knowme.answerOf',{name:name(),answer:real()}),'small'));
      const g=el('p',()=>iAnswered?t('knowme.guessOf',{name:name(),answer:guessed()}):t('knowme.yourGuess',{answer:guessed()}),'small');g.prepend(icon(ok?'check':'close',14));li.append(g);
      list.append(li);
    });
    box.append(list);return box;
  }

  // ---- asking: five questions, four answers each
  function begin(round){
    const snap=getSnapshot();
    const recent=(snap?.playRounds??[]).filter(r=>r.game==='know_me'&&r.started_by===me()).slice(0,4).flatMap(r=>r.items);
    run={round,id:crypto.randomUUID(),items:round?round.items:(preview??pickQuestions(recent,KNOWME_SIZE)),idx:0,picks:[]};if(!round)preview=null;
    failed=false;view='ask';ask();
  }
  // the question on a cream card under a little sunset with the two of you
  function knowCard(q){
    const card=el('div',undefined,'knowme-card');const sky=el('div',undefined,'knowme-sky');sky.setAttribute('aria-hidden','true');
    sky.append(el('span',undefined,'knowme-sun'),el('span',undefined,'knowme-hill'),el('span',undefined,'knowme-pair'));
    card.append(sky,el('p',()=>t(questionKey(q)),'title knowme-question'),el('p',()=>run.round?t('knowme.guessFor',{name:name()}):t('knowme.aboutYou'),'knowme-for'));
    return card;
  }
  function ask(){
    const q=run.items[run.idx];
    root.replaceChildren(head(),el('p',()=>t('knowme.progress',{n:run.idx+1,total:run.items.length}),'eyebrow'),
      knowCard(q));
    const opts=el('div',undefined,'duel-options');
    OPTIONS.forEach((_,i)=>{const b=button(()=>t(optionKey(q,i)),()=>{run.picks.push(i);if(run.idx<run.items.length-1){run.idx++;ask();}else save();},'duel-option');b.dir='auto';opts.append(b);});
    if(run.idx>0)root.append(opts,button(()=>t('common.back'),()=>{run.idx--;run.picks.pop();ask();},'link'));else root.append(opts);
    opts.firstChild?.focus({preventScroll:true});
  }
  async function save(){
    if(saving)return;saving=true;failed=false;root.replaceChildren(head(),el('p',()=>t('common.loading'),'small'));
    try{
      const ok=run.round?await answer({id:run.id,roundId:run.round.id,picks:run.picks,ms:null}):await start({id:run.id,game:'know_me',deck:null,items:run.items,picks:run.picks,ms:null});
      if(!ok)throw new Error('not saved');
      const done=run;run=null;after(done);
    }catch{failed=true;after(run);}
    finally{saving=false;}
  }
  function after(done){
    view='after';root.replaceChildren(head());
    if(failed){root.append(el('p',()=>t('common.unknownError'),'error'),button(()=>t('common.retry'),()=>save(),'primary'));return;}
    if(done.round){shownResult=done.round.id;root.append(result(done.round));}
    else root.append(el('p',()=>t('knowme.sent',{name:name()}),'body-strong'));
    root.append(button(()=>t('knowme.again'),()=>begin(null),''),button(()=>t('play.back'),()=>home(),'link'));
  }
  return {element:root,
    render(){if(view==='home')return home();if((view==='after'||view==='result')&&shownResult){const r=getSnapshot()?.playRounds?.find(x=>x.id===shownResult);if(r)root.querySelector('.knowme-result')?.replaceWith(result(r));}},
    open(round){shownResult=null;if(round)begin(round);else home();},
    showResult(round){run=null;view='result';shownResult=round.id;root.replaceChildren(head(),result(round),button(()=>t('play.back'),()=>home(),'link'));},
    clear(){run=null;shownResult=null;view='home';root.replaceChildren();},
    stop(){if(view==='ask'&&!saving){run=null;view='home';}}};
}
