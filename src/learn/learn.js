// Learn (plan phase 4): decks the app ships (Italian for both of you, Venezuelan Spanish, Tunisian Derja) and words
// your partner teaches you with their own voice. Spaced repetition decides what comes back (learn-model.js, FSRS);
// each review is saved (backend/014) so your progress follows you and every 10 reviews a day is a point.
// Exercises: a new word is introduced, then you choose its meaning, type it, or hear it. "Say it" sends your voice
// to your partner, who answers with a heart or "again" in the chat. No AI: corrections come from each other.
import {openSheet} from '../design/sheet.js';
import {icon} from '../design/icons.js';
import {loadDecks} from '../games/duel-ui.js';
import {teachCard,stateMap,session,modeFor,choiceSet,checkTyped,ratingFor,review,serialize,wordOfDay,stats,meaningOf,previews,RATING,startedToday,DECK_LANG} from './learn-model.js';

const DECKS=['it','ve','tn','w'],KEY='learn.deck',BUCKET='connection-private';
const VOICE={it:['it-IT','it'],ve:['es-VE','es-419','es-US','es'],tn:['ar-TN','ar']};
const readDeck=()=>{try{const v=localStorage.getItem(KEY);return DECKS.includes(v)?v:'it';}catch{return 'it';}};
const voiceFor=deck=>{try{const vs=speechSynthesis.getVoices();return (VOICE[deck]??[]).map(l=>vs.find(v=>v.lang?.toLowerCase().startsWith(l.toLowerCase()))).find(Boolean)??null;}catch{return null;}};

export function createLearn({$,el,button,t,copy,locale,getSnapshot,getClient,getApi,me,person,notify}){
  const page=$('page-learn');if(!page)return {render(){},clear(){}};
  const home=el('section',undefined,'learn-home');page.querySelector('.section-head')?.after(home);
  let deck=readDeck(),all=null,teachMsgs=[],voices=new Map(),urls=new Map(),overlay=null,run=null,loadedAt=0;
  const partner=()=>getSnapshot()?.members?.find(m=>m.profile_id!==me())?.profile_id??null;
  const lang=()=>locale();

  async function data(){
    if(!all){try{all=(await loadDecks()).cards;}catch{all=[];}}
    if(Date.now()-loadedAt>20000&&getClient()&&getSnapshot()?.pairId){loadedAt=Date.now();
      try{const {data:rows}=await getClient().from('messages').select('*').eq('pair_id',getSnapshot().pairId).eq('kind','word').is('deleted_at',null).order('created_at',{ascending:false}).limit(300);
        teachMsgs=(rows??[]).filter(m=>m.payload?.teach);
        const ids=teachMsgs.map(m=>m.id);if(ids.length){const {data:files}=await getClient().from('media_files').select('*').in('message_id',ids).eq('status','ready');voices=new Map((files??[]).map(f=>[f.message_id,f]));}}
      catch{}}
  }
  // the cards of the deck you picked; "From your partner" are the words they taught you
  const cardsOf=d=>d==='w'?teachMsgs.filter(m=>m.sender_id!==me()).map(teachCard).filter(Boolean):(all??[]).filter(c=>c.deck===d);
  const states=()=>stateMap(getSnapshot()?.learnState,me());

  async function render(){
    await data();const snap=getSnapshot();if(!snap||!me()){home.replaceChildren();return;}
    const cards=cardsOf(deck),st=stats(cards,states()),theirs=stats(cardsOf(deck==='w'?'w':deck),stateMap(snap.learnState,partner()));
    home.replaceChildren();
    const chips=el('div',undefined,'learn-decks');chips.setAttribute('role','tablist');
    for(const d of DECKS){const b=button(()=>d==='w'?t('learn.deck.w',{name:person(partner())}):t('learn.deck.'+d),()=>{deck=d;try{localStorage.setItem(KEY,d);}catch{};render();},'learn-deck');
      b.setAttribute('role','tab');b.setAttribute('aria-selected',String(d===deck));chips.append(b);}
    home.append(chips);
    const wod=wordOfDay(cardsOf(deck==='w'?'it':deck));
    if(wod){const card=el('article',undefined,'learn-wod');card.append(el('p',()=>t('learn.wordOfDay'),'learn-eyebrow'));
      const w=el('p',undefined,'learn-word');w.textContent=wod.word;w.lang=DECK_LANG[wod.deck]??'';w.dir='auto';
      const say=el('p',undefined,'learn-say');say.textContent=wod.say??'';
      const mean=el('p',undefined,'learn-meaning');mean.textContent=meaningOf(wod,lang());mean.dir='auto';
      card.append(w,say,mean,listenButton(wod));home.append(card);}
    const nums=el('div',undefined,'learn-stats');
    for(const [n,key] of [[st.due,'learn.due'],[st.learned,'learn.learned'],[st.xp,'learn.xp']]){const s=el('div',undefined,'learn-stat');const b=el('b');b.textContent=String(n);s.append(b,el('span',()=>t(key)));nums.append(s);}
    home.append(nums);
    if(partner())home.append(el('p',()=>t('learn.partnerXp',{name:person(partner()),count:theirs.xp}),'small learn-partner'));
    const queue=session(cards,states(),{newToday:startedToday(snap.learnState,me())});
    const start=button(()=>queue.length?t('learn.start',{count:queue.length}):t('learn.allDone'),()=>startSession(queue,cards),'primary learn-start');start.disabled=!queue.length;
    const teach=button(()=>t('learn.teach',{name:person(partner())}),()=>teachSheet(),'quiet learn-teach');teach.prepend(icon('mic',16));
    home.append(start,teach);
    if(deck==='w'&&!cards.length)home.append(el('p',()=>t('learn.noTaught',{name:person(partner())}),'small'));
  }
  function listenButton(card){
    const voice=card.message?voices.get(card.message):null,tts='speechSynthesis' in window&&!!voiceFor(card.deck);
    if(!voice&&!tts)return el('span');
    const b=button(()=>'',()=>listen(card),'learn-listen');b.append(icon('sound',18));copy(b,()=>t('learn.listen'),'aria-label');return b;
  }
  async function listen(card){
    const voice=card.message?voices.get(card.message):null;
    if(voice){try{if(!urls.has(voice.id))urls.set(voice.id,URL.createObjectURL(await getApi().download(voice)));const a=new Audio(urls.get(voice.id));await a.play();}catch{}return;}
    try{const v=voiceFor(card.deck),u=new SpeechSynthesisUtterance(String(card.word).split(/[,،/]/)[0]);if(v){u.voice=v;u.lang=v.lang;}u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}
  }

  // ---- the session, full screen
  function startSession(queue,cards){
    if(!queue.length)return;run={queue:[...queue],cards,i:0,done:0,xp:0,started:Date.now()};
    overlay=el('div',undefined,'learn-session');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');copy(overlay,()=>t('learn.sessionLabel'),'aria-label');
    document.body.append(overlay);document.documentElement.classList.add('learn-open');next();
  }
  function closeSession(){overlay?.remove();overlay=null;run=null;document.documentElement.classList.remove('learn-open');render();}
  function frame(){
    overlay.replaceChildren();
    const top=el('div',undefined,'ls-top');const close=button(()=>'',()=>closeSession(),'ls-close');close.append(icon('close',18));copy(close,()=>t('common.close'),'aria-label');
    const bar=el('div',undefined,'ls-progress'),fill=el('i');fill.style.inlineSize=(run.i/run.queue.length*100).toFixed(1)+'%';bar.append(fill);
    top.append(close,bar);const body=el('div',undefined,'ls-card');overlay.append(top,body);return body;
  }
  function next(){
    if(!run)return;if(run.i>=run.queue.length){finish();return;}
    const card=run.queue[run.i],state=states().get(card.id)??null,canSpeak='speechSynthesis' in window&&!!voiceFor(card.deck);
    const mode=modeFor(card,state,{canSpeak,hasVoice:!!(card.message&&voices.get(card.message)),seed:me()});
    const body=frame();body.dataset.mode=mode;run.shownAt=Date.now();
    const word=()=>{const w=el('p',undefined,'learn-word');w.textContent=card.word;w.lang=DECK_LANG[card.deck]??card.lang??'';w.dir='auto';return w;};
    const meaning=()=>{const m=el('p',undefined,'learn-meaning');m.textContent=meaningOf(card,lang());m.dir='auto';return m;};
    if(card.from)body.append(el('p',()=>t('learn.taughtBy',{name:person(card.from)}),'learn-eyebrow'));
    if(mode==='intro'){
      const say=el('p',undefined,'learn-say');say.textContent=card.say??'';
      body.append(el('p',()=>t('learn.newWord'),'learn-eyebrow'),word(),say,meaning(),listenButton(card));
      const sayIt=button(()=>t('learn.sayIt',{name:person(partner())}),()=>recordSay(card,sayIt),'quiet');sayIt.prepend(icon('mic',16));
      body.append(sayIt,rateRow(card,state,['again','good','easy']));return;}
    if(mode==='choice'||mode==='listen'){
      if(mode==='listen'){body.append(el('p',()=>t('learn.whatHear'),'learn-eyebrow'));const l=listenButton(card);l.classList.add('big');body.append(l);setTimeout(()=>listen(card),300);}
      else body.append(el('p',()=>t('learn.whatMeans'),'learn-eyebrow'),word());
      const opts=el('div',undefined,'ls-options');
      for(const o of choiceSet(card,run.cards.length>=4?run.cards:(all??[]),lang(),me()+run.i)){
        const b=button(()=>'',()=>{for(const x of opts.children)x.disabled=true;b.classList.add(o.correct?'right':'wrong');
          if(!o.correct)[...opts.children].find(x=>x.dataset.right==='1')?.classList.add('right');
          if(mode==='listen')body.insertBefore(word(),opts);
          answer(card,state,o.correct?'right':'wrong');},'ls-option');b.textContent=o.text;b.dir='auto';b.dataset.right=o.correct?'1':'0';opts.append(b);}
      body.append(opts);return;}
    // type it
    body.append(el('p',()=>t('learn.typeIt'),'learn-eyebrow'),meaning());
    const form=el('form',undefined,'ls-type'),input=document.createElement('input');input.autocomplete='off';input.autocapitalize='off';input.spellcheck=false;input.dir='auto';copy(input,()=>t('learn.typeHere'),'placeholder');
    const go=button(()=>t('learn.check'),null,'primary');go.type='submit';form.append(input,go);
    form.onsubmit=e=>{e.preventDefault();if(input.disabled)return;const r=checkTyped(card,input.value);input.disabled=true;go.disabled=true;form.classList.add(r);
      body.append(el('p',()=>r==='right'?t('learn.right'):r==='almost'?t('learn.almost'):t('learn.wrong'),'ls-verdict'),word());answer(card,state,r);};
    body.append(form);setTimeout(()=>input.focus(),50);
  }
  // after a new word: you say how well it stuck (with when it comes back)
  function rateRow(card,state,keys){
    const row=el('div',undefined,'ls-rate'),pv=previews(state);
    for(const k of keys){const b=button(()=>'',()=>save(card,state,RATING[k]),'ls-rate-'+k);b.append(el('b',()=>t('learn.rate.'+k)),el('small',()=>when(pv[k])));row.append(b);}
    return row;
  }
  const when=ms=>{const m=Math.round(ms/60000);if(m<60)return t('learn.inMinutes',{count:Math.max(1,m)});const d=Math.round(ms/86400000);return d<1?t('learn.inHours',{count:Math.round(ms/3600000)}):t('learn.inDays',{count:d});};
  function answer(card,state,result){
    const rating=ratingFor(result,Date.now()-run.shownAt);
    const cont=button(()=>t('learn.next'),()=>save(card,state,rating),'primary ls-next');overlay.querySelector('.ls-card').append(cont);cont.focus();
    if(result!=='wrong')navigator.vibrate?.(10);
  }
  async function save(card,state,rating){
    if(!run)return;const nextState=review(state,rating,new Date());
    try{const row=await getApi().rpc('learn_review',{p_card_key:card.id,p_state:serialize(nextState)});
      const snap=getSnapshot();if(snap){snap.learnState=[...(snap.learnState??[]).filter(r=>!(r.profile_id===me()&&r.card_key===card.id)),row];
        const day=new Date().toISOString().slice(0,10),d=(snap.learnDays??[]).find(x=>x.profile_id===me()&&x.day===day);
        if(d)d.reviews++;else snap.learnDays=[...(snap.learnDays??[]),{profile_id:me(),day,reviews:1}];}
      run.xp++;}
    catch(e){if(e?.code!=='PT409'){notify(()=>t('common.unknownError'));return;}}
    // forgotten cards come back at the end of today's session
    if(rating===RATING.again&&run.queue.filter(c=>c.id===card.id).length<3)run.queue.push(card);
    run.i++;next();
  }
  function finish(){
    const body=frame();body.dataset.mode='done';
    body.append(el('p',()=>t('learn.doneTitle'),'learn-word'),el('p',()=>t('learn.doneXp',{count:run.xp}),'learn-meaning'),
      button(()=>t('learn.backToDecks'),()=>closeSession(),'primary'));
  }

  // ---- your voice: "say it" to your partner, and teaching a word
  async function record(seconds=6){
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});const type=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported?.(x))??'';
    const rec=new MediaRecorder(stream,type?{mimeType:type}:{}),chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    return {stop:()=>new Promise(r=>{rec.onstop=()=>{stream.getTracks().forEach(x=>x.stop());r(new Blob(chunks,{type:(rec.mimeType||type||'audio/webm').split(';')[0]}));};rec.stop();}),start(){rec.start(250);},seconds};
  }
  async function sendVoice(kind,blob,payload,body=null){
    const id=crypto.randomUUID();
    await getApi().rpc('send_message',{p_id:id,p_kind:kind,p_body:body,p_payload:payload,p_reply_to:null});
    if(blob){const row=await getApi().rpc('reserve_message_media',{p_id:crypto.randomUUID(),p_message_id:id,p_filename:(blob.type.includes('mp4')?'say.m4a':'say.webm'),p_mime_type:blob.type});
      const up=await getClient().storage.from(BUCKET).upload(row.object_key,blob,{upsert:false,contentType:blob.type,cacheControl:'0'});if(up.error)throw up.error;
      await getApi().rpc('finalize_media',{p_id:row.id});}
    getClient().functions.invoke('dispatch-notification',{body:{event_id:id}}).catch(()=>{});return id;
  }
  async function recordSay(card,btn){
    if(btn.dataset.rec){btn.dataset.rec='';const blob=await btn._rec.stop();copy(btn,()=>t('learn.sending'));
      try{await sendVoice('voice',blob,{learn:{word:card.word,card:card.id}});copy(btn,()=>t('learn.sent',{name:person(partner())}));btn.disabled=true;}catch{copy(btn,()=>t('common.unknownError'));}return;}
    try{btn._rec=await record();btn._rec.start();btn.dataset.rec='1';copy(btn,()=>t('learn.stopSay'));}catch{notify(()=>t('record.denied'));}
  }
  function teachSheet(){
    const sheet=openSheet({title:h=>copy(h,()=>t('learn.teachTitle',{name:person(partner())})),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'learn-teach-sheet'});
    const form=el('form',undefined,'learn-teach-form');
    const field=(key,max)=>{const i=document.createElement('input');i.maxLength=max;i.dir='auto';i.required=key!=='learn.teachSay';const l=el('label',()=>t(key));l.append(i);form.append(l);return i;};
    const word=field('learn.teachWord',80),meaning=field('learn.teachMeaning',160),say=field('learn.teachSay',80);
    let rec=null,blob=null;const status=el('p',undefined,'small');
    const voice=button(()=>t('learn.recordWord'),async()=>{
      if(rec){blob=await rec.stop();rec=null;copy(voice,()=>t('learn.recordAgain'));copy(status,()=>t('learn.voiceReady'));return;}
      try{rec=await record();rec.start();copy(voice,()=>t('learn.stopSay'));copy(status,()=>t('learn.recording'));}catch{copy(status,()=>t('record.denied'));}},'quiet');voice.prepend(icon('mic',16));
    const send=button(()=>t('learn.teachSend'),null,'primary');send.type='submit';
    form.append(voice,status,send);
    form.onsubmit=async e=>{e.preventDefault();if(!word.value.trim()||!meaning.value.trim())return;send.disabled=true;
      try{if(rec){blob=await rec.stop();rec=null;}
        await sendVoice('word',blob,{word:word.value.trim(),meaning:meaning.value.trim(),say:say.value.trim()||undefined,teach:true});
        notify(()=>t('learn.taught',{name:person(partner())}));sheet.close();loadedAt=0;render();}
      catch{copy(status,()=>t('common.unknownError'));send.disabled=false;}};
    sheet.body.append(el('p',()=>t('learn.teachHint',{name:person(partner())}),'small'),form);word.focus();
  }
  return {render,clear(){home.replaceChildren();overlay?.remove();overlay=null;run=null;teachMsgs=[];loadedAt=0;}};
}
