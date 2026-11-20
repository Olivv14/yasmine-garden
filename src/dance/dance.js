// The dance studio (approved DanceStudioDuo): the two of you as silhouettes dancing at sunset, full screen.
// Copy my step: film a short step (15 s), your partner watches it and films their copy, you give the copy 1 to 3
// hearts. "Our steps" plays a step and its copy side by side; the dance diary lists everything you danced;
// "Dance with me" plays the style's beat while the silhouettes dance.
// Steps and copies are Talk messages of kind 'dance' with a video (backend/013, the usual private uploads), so they
// also show in your chat; the hearts are dance_ratings (rate_dance).
import {trackContext} from '../sound.js';
import {STYLES,STEP_SECONDS,todayStyle,styleOf,streak,pairs,nextMove,dances} from './dance-model.js';
import {icon} from '../design/icons.js';

const BUCKET='connection-private',MAX_BYTES=25*1024*1024;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgNS='http://www.w3.org/2000/svg';

// the sunset over the sea, the railing and the palm leaves (the mockup's art, without inline styles)
function sunset(){
  const box=document.createElement('div');box.className='ds-sky';box.setAttribute('aria-hidden','true');
  box.innerHTML='<svg viewBox="0 0 390 470" preserveAspectRatio="none"><defs><linearGradient id="dsSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2250"/><stop offset=".35" stop-color="#8A4A6A"/><stop offset=".62" stop-color="#F08A5A"/><stop offset=".66" stop-color="#FFC27A"/></linearGradient><radialGradient id="dsSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4C8"/><stop offset=".55" stop-color="#FFC870"/><stop offset="1" stop-color="#FF9A50"/></radialGradient><radialGradient id="dsHalo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFC27A" stop-opacity=".7"/><stop offset="1" stop-color="#FF8A5A" stop-opacity="0"/></radialGradient><linearGradient id="dsSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8664A"/><stop offset="1" stop-color="#3A2030"/></linearGradient></defs>'
    +'<rect width="390" height="300" fill="url(#dsSky)"/><circle cx="195" cy="250" r="190" fill="url(#dsHalo)"/><circle cx="195" cy="262" r="96" fill="url(#dsSun)"/><rect y="300" width="390" height="170" fill="url(#dsSea)"/>'
    +[0,1,2,3,4,5,6,7].map(i=>`<rect x="${140-8*i}" y="${306+9*i}" width="${110+16*i}" height="2.4" rx="1.2" fill="#FFD9A0" opacity="${(.7-.07*i).toFixed(2)}" class="ds-shim"/>`).join('')
    +'<path d="M0 300 L60 292 L90 296 L130 288 L150 300Z" fill="#3A2028" opacity=".7"/><path d="M300 300 L330 286 L360 292 L390 284 V300Z" fill="#3A2028" opacity=".7"/>'
    +'<g fill="#120A0E"><rect x="0" y="434" width="390" height="40"/><rect x="0" y="404" width="390" height="6"/>'+Array.from({length:18},(_,i)=>`<rect x="${8+22*i}" y="408" width="5" height="28" rx="2"/>`).join('')+'</g>'
    +'<path d="M0 0 H70 C60 40 30 70 0 90Z M390 0 H320 C330 36 356 64 390 80Z" fill="#0E080C"/><g fill="#0E080C">'
    +[[20,30,20],[44,50,-10],[10,66,40],[350,26,-20],[372,48,10],[330,44,30]].map(([x,y,r])=>`<path d="M${x} ${y} q6 -10 12 0 q-6 6 -12 0z" transform="rotate(${r} ${x} ${y})"/>`).join('')+'</g></svg>';
  box.querySelectorAll('.ds-shim').forEach((r,i)=>{const y=307+9*i;r.style.transformOrigin=`195px ${y}px`;r.style.animationDelay=(i*.3)+'s';});
  const floor=document.createElement('div');floor.className='ds-floor';const glow=document.createElement('div');glow.className='ds-floor-glow';floor.append(glow);
  return [box,floor];
}

export function createDance({el,button,t,copy,me,person,partner,getSnapshot,getClient,getApi,notify}){
  const root=el('div',undefined,'game-card dance-card');
  let messages=[],ratings=[],media=new Map(),urls=new Map(),loaded=false,busy=false,style=todayStyle(),sub=null,beat=null,cam=null,recorder=null,recTimer=null;
  const client=()=>getClient(),api=()=>getApi(),pairId=()=>getSnapshot()?.pairId;

  async function load(){
    if(!client()||!pairId())return;
    try{
      const {data,error}=await client().from('messages').select('*').eq('pair_id',pairId()).eq('kind','dance').is('deleted_at',null).order('created_at',{ascending:false}).limit(200);
      if(error)throw error;messages=data??[];
      const ids=messages.map(m=>m.id);
      if(ids.length){const {data:files}=await client().from('media_files').select('*').in('message_id',ids);media=new Map((files??[]).map(f=>[f.message_id,f]));}
      const r=await client().from('dance_ratings').select('*').eq('pair_id',pairId());ratings=r.data??[];
      loaded=true;
    }catch{loaded='missing';}
    paint();
  }
  async function videoUrl(messageId){
    const row=media.get(messageId);if(!row||(row.status!=='ready'&&row.owner_id!==me()))return null;
    if(!urls.has(row.id))urls.set(row.id,api().download(row).then(b=>URL.createObjectURL(b)).catch(()=>{urls.delete(row.id);return null;}));
    return urls.get(row.id);
  }
  function videoEl(messageId,{muted=false,loop=true}={}){
    const v=document.createElement('video');v.playsInline=true;v.setAttribute('playsinline','');v.preload='metadata';v.loop=loop;v.muted=muted;v.className='ds-video';
    videoUrl(messageId).then(u=>{if(u)v.src=u;});return v;
  }

  // ---- the studio
  function paint(){
    stopBeat();root.replaceChildren();
    const [sky,floor]=sunset();const duo=el('div',undefined,'ds-duo');duo.setAttribute('role','img');
    copy(duo,()=>t('dance.duoLabel',{style:t('dance.style.'+style.id)}),'aria-label');
    const top=el('div',undefined,'ds-top');
    const studio=el('span',()=>t('dance.studio',{name:person(me())}),'ds-studio');
    const days=streak(messages);top.append(studio);
    if(days>0)top.append(el('span',()=>t('dance.streak',{count:days}),'ds-chip'));
    const beatLine=el('div',undefined,'ds-beat');const dot=el('span',undefined,'ds-dot');
    const styleBtn=button(()=>t('dance.beatLine',{style:t('dance.style.'+style.id),bpm:style.bpm,name:person(partner())}),()=>pickStyle(),'ds-style');
    beatLine.append(dot,styleBtn);beatLine.style.setProperty('--beat',(60/style.bpm).toFixed(3)+'s');
    root.append(sky,floor,duo,top,beatLine,card(),actions());
    root.style.setProperty('--beat',(60/style.bpm).toFixed(3)+'s');
  }
  function card(){
    const box=el('div',undefined,'ds-card'),move=loaded===true?nextMove(messages,ratings,me()):{kind:'film'};
    const head=el('div',undefined,'ds-card-head');head.append(el('b',()=>t('dance.copyTitle'),'ds-card-title'),el('span',()=>t('dance.today',{style:t('dance.style.'+todayStyle().id)}),'ds-today'));
    box.append(head);
    if(loaded==='missing'){box.append(el('p',()=>t('dance.needsUpdate'),'ds-text'));return box;}
    if(move.kind==='copy'){const s=move.pair.step;
      box.append(el('p',()=>t('dance.toCopy',{name:person(s.sender_id),style:t('dance.style.'+styleOf(s.payload.style).id)}),'ds-text'),
        button(()=>t('dance.watchCopy'),()=>film('copy',s),'primary ds-main'));}
    else if(move.kind==='rate'){
      box.append(el('p',()=>t('dance.toRate',{name:person(move.pair.copy.sender_id)}),'ds-text'),button(()=>t('dance.sideBySide'),()=>side(move.pair),'primary ds-main'));}
    else{
      box.append(el('p',()=>t('dance.howTo',{name:person(partner()),seconds:STEP_SECONDS}),'ds-text'));
      if(move.kind==='waiting')box.append(el('p',()=>t('dance.waiting',{name:person(partner())}),'ds-wait'));
      box.append(button(()=>t('dance.filmStep'),()=>film('step'),'primary ds-main'));}
    return box;
  }
  function actions(){
    const row=el('div',undefined,'ds-actions');
    row.append(button(()=>t('dance.diary'),()=>diary(),'ds-act'),button(()=>t('dance.ourSteps'),()=>ourSteps(),'ds-act'),
      button(()=>beat?t('dance.stopDancing'):t('dance.withMe'),()=>{beat?stopBeat():startBeat();paintActions();},'ds-act ds-act-gold'));
    return row;
  }
  function paintActions(){root.querySelector('.ds-actions')?.replaceWith(actions());root.classList.toggle('dancing',!!beat);}
  function pickStyle(){
    const sheet=overlay('ds-sheet');sheet.append(el('h3',()=>t('dance.pickStyle'),'ds-sheet-title'));
    const grid=el('div',undefined,'ds-styles');
    for(const s of STYLES){const b=button(()=>t('dance.style.'+s.id),()=>{style=s;closeOverlay();paint();},'ds-style-pick');b.setAttribute('aria-pressed',String(s.id===style.id));
      b.append(el('small',()=>t('dance.bpm',{bpm:s.bpm})));grid.append(b);}
    sheet.append(grid,closer());
  }

  // ---- "Dance with me": the style's beat (a soft click and a low drum) while the silhouettes dance
  function startBeat(){
    if(beat)return;let ac;try{ac=trackContext(new (window.AudioContext||window.webkitAudioContext)());}catch{return;}
    const step=60/style.bpm;let next=ac.currentTime+.08,n=0;
    const hit=(at,strong)=>{const o=ac.createOscillator(),g=ac.createGain();o.type=strong?'sine':'triangle';o.frequency.setValueAtTime(strong?110:880,at);o.frequency.exponentialRampToValueAtTime(strong?50:440,at+.12);
      g.gain.setValueAtTime(strong?.55:.12,at);g.gain.exponentialRampToValueAtTime(.001,at+.16);o.connect(g).connect(ac.destination);o.start(at);o.stop(at+.18);};
    const timer=setInterval(()=>{while(next<ac.currentTime+.25){hit(next,n%4===0||n%4===2);next+=step;n++;}},60);
    beat={ac,timer};root.classList.add('dancing');
  }
  function stopBeat(){if(!beat)return;clearInterval(beat.timer);beat.ac.close().catch(()=>{});beat=null;root.classList.remove('dancing');}

  // ---- filming: the camera, 3-2-1 on the beat, 15 seconds; for a copy, their step plays in the corner
  function overlay(cls){closeOverlay();const o=el('div',undefined,'ds-overlay '+cls);root.append(o);return o;}
  function closeOverlay(){stopCamera();root.querySelectorAll('.ds-overlay').forEach(o=>{o.querySelectorAll('video').forEach(v=>v.pause());o.remove();});}
  const closer=()=>{const b=button(()=>'',()=>{closeOverlay();paint();},'ds-close');b.append(icon('close',18));copy(b,()=>t('common.close'),'aria-label');return b;};
  function stopCamera(){clearInterval(recTimer);recTimer=null;if(recorder&&recorder.state!=='inactive'){recorder.onstop=null;recorder.stop();}recorder=null;cam?.getTracks().forEach(x=>x.stop());cam=null;}
  async function film(role,step=null){
    stopBeat();const o=overlay('ds-film');
    const live=document.createElement('video');live.className='ds-live';live.muted=true;live.playsInline=true;live.setAttribute('playsinline','');live.autoplay=true;
    const status=el('p',undefined,'ds-film-status'),ring=el('div',undefined,'ds-ring'),controls=el('div',undefined,'ds-film-controls');
    o.append(live,ring,status,controls,closer());
    if(step){const theirs=videoEl(step.id,{muted:false});theirs.classList.add('ds-pip');theirs.autoplay=true;o.append(theirs);theirs.play().catch(()=>{});}
    // phones without a camera here still can pick a video they filmed
    const pick=document.createElement('input');pick.type='file';pick.accept='video/*';pick.setAttribute('capture','user');pick.hidden=true;o.append(pick);
    pick.onchange=()=>{const f=pick.files?.[0];if(f)review(o,f,role,step);};
    const fromFile=button(()=>t('dance.pickVideo'),()=>pick.click(),'ds-secondary');
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){copy(status,()=>t('dance.noCamera'));controls.append(fromFile);return;}
    try{cam=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:1280}},audio:true});}
    catch{copy(status,()=>t('dance.cameraDenied'));controls.append(fromFile);return;}
    live.srcObject=cam;live.play().catch(()=>{});
    copy(status,()=>role==='copy'?t('dance.readyCopy'):t('dance.readyStep',{seconds:STEP_SECONDS}));
    const rec=button(()=>t('dance.record'),()=>countdown(o,role,step,status,controls),'primary ds-rec');rec.prepend(icon('video',18));
    controls.append(rec,fromFile);
  }
  function countdown(o,role,step,status,controls){
    controls.replaceChildren();let n=3;const beatMs=60000/style.bpm*2;
    const show=()=>{status.textContent=String(n);status.classList.add('ds-count');};show();
    const timer=setInterval(()=>{n--;if(n>0){show();return;}clearInterval(timer);status.classList.remove('ds-count');record(o,role,step,status,controls);},Math.max(500,Math.min(1000,beatMs)));
  }
  function record(o,role,step,status,controls){
    if(!cam)return;
    const type=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported?.(x))??'';
    const chunks=[];recorder=new MediaRecorder(cam,{...(type?{mimeType:type}:{}),videoBitsPerSecond:2500000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const started=Date.now();
    recorder.onstop=()=>{clearInterval(recTimer);recTimer=null;const kind=(recorder?.mimeType||type||'video/webm').split(';')[0];const blob=new Blob(chunks,{type:kind});recorder=null;
      cam?.getTracks().forEach(x=>x.stop());cam=null;review(o,blob,role,step);};
    const theirs=o.querySelector('.ds-pip');if(theirs){theirs.currentTime=0;theirs.play().catch(()=>{});}
    recorder.start(500);
    const stop=button(()=>t('dance.stopRec'),()=>recorder?.stop(),'ds-secondary');controls.append(stop);
    const ring=o.querySelector('.ds-ring');ring.classList.add('on');
    recTimer=setInterval(()=>{const s=(Date.now()-started)/1000;ring.style.setProperty('--done',Math.min(1,s/STEP_SECONDS).toFixed(3));
      copy(status,()=>t('dance.recording',{seconds:Math.max(0,Math.ceil(STEP_SECONDS-s))}));
      if(s>=STEP_SECONDS){clearInterval(recTimer);recTimer=null;recorder?.stop();}},200);
  }
  function review(o,blob,role,step){
    o.querySelectorAll('.ds-live,.ds-ring').forEach(n=>n.remove());const status=o.querySelector('.ds-film-status'),controls=o.querySelector('.ds-film-controls');
    const v=document.createElement('video');v.className='ds-live ds-review';v.playsInline=true;v.setAttribute('playsinline','');v.loop=true;v.controls=false;v.src=URL.createObjectURL(blob);v.play().catch(()=>{});o.prepend(v);
    if(blob.size>MAX_BYTES){copy(status,()=>t('dance.tooBig'));controls.replaceChildren(button(()=>t('dance.again'),()=>film(role,step),'ds-secondary'));return;}
    copy(status,()=>role==='copy'?t('dance.sendCopyQ',{name:person(step?.sender_id)}):t('dance.sendStepQ',{name:person(partner())}));
    controls.replaceChildren(button(()=>t('dance.send'),()=>send(blob,role,step,controls,status),'primary ds-rec'),button(()=>t('dance.again'),()=>film(role,step),'ds-secondary'));
  }
  async function send(blob,role,step,controls,status){
    if(busy)return;busy=true;controls.querySelectorAll('button').forEach(b=>b.disabled=true);copy(status,()=>t('dance.sending'));
    const id=crypto.randomUUID(),payload={role,style:role==='copy'?(step?.payload?.style??style.id):style.id,...(role==='copy'?{of:step.id}:{})};
    try{
      const msg=await api().rpc('send_message',{p_id:id,p_kind:'dance',p_body:null,p_payload:payload,p_reply_to:null});
      messages=[msg,...messages.filter(m=>m.id!==id)];
      const ext=blob.type.includes('mp4')?'mp4':blob.type.includes('quicktime')?'mov':'webm';
      const mime=['video/mp4','video/webm','video/quicktime'].includes(blob.type)?blob.type:'video/'+(ext==='mov'?'quicktime':ext);
      const row=await api().rpc('reserve_message_media',{p_id:crypto.randomUUID(),p_message_id:id,p_filename:(role==='copy'?'copy.':'step.')+ext,p_mime_type:mime});
      urls.set(row.id,Promise.resolve(URL.createObjectURL(blob)));media.set(id,row);
      const up=await client().storage.from(BUCKET).upload(row.object_key,blob,{upsert:false,contentType:mime,cacheControl:'0'});if(up.error)throw up.error;
      media.set(id,await api().rpc('finalize_media',{p_id:row.id}));
      client().functions.invoke('dispatch-notification',{body:{event_id:id}}).catch(()=>{});
      notify(()=>role==='copy'?t('dance.copySent',{name:person(step?.sender_id)}):t('dance.stepSent',{name:person(partner())}));
      closeOverlay();paint();
    }catch{copy(status,()=>t('dance.sendFailed'));controls.querySelectorAll('button').forEach(b=>b.disabled=false);}
    finally{busy=false;}
  }

  // ---- side by side, with the hearts
  function side(pair){
    stopBeat();const o=overlay('ds-side');
    const grid=el('div',undefined,'ds-side-grid');
    const a=el('figure',undefined,'ds-side-cell'),b=el('figure',undefined,'ds-side-cell');
    const va=videoEl(pair.step.id,{muted:false,loop:false}),vb=pair.copy?videoEl(pair.copy.id,{muted:true,loop:false}):null;
    a.append(va,el('figcaption',()=>t('dance.stepBy',{name:person(pair.step.sender_id)})));
    if(vb)b.append(vb,el('figcaption',()=>t('dance.copyBy',{name:person(pair.copy.sender_id)})));else b.append(el('p',()=>t('dance.noCopyYet',{name:person(partner())}),'ds-text'));
    grid.append(a,b);
    const play=button(()=>t('dance.playBoth'),()=>{for(const v of [va,vb].filter(Boolean)){v.currentTime=0;v.play().catch(()=>{});}},'primary ds-rec');play.prepend(icon('playTrack',16));
    o.append(el('h3',()=>t('dance.style.'+styleOf(pair.step.payload.style).id),'ds-sheet-title'),grid,play);
    if(pair.copy){
      const mine=pair.step.sender_id===me(),hearts=el('div',undefined,'ds-hearts');hearts.setAttribute('role','group');copy(hearts,()=>t('dance.giveHearts'),'aria-label');
      for(let n=1;n<=3;n++){const h=button(()=>'',()=>rate(pair,n),'ds-heart');h.append(icon('heart',26));h.classList.toggle('on',(pair.hearts??0)>=n);h.disabled=!mine;
        copy(h,()=>t('dance.hearts',{count:n}),'aria-label');hearts.append(h);}
      o.append(el('p',()=>mine?(pair.hearts?t('dance.youGave',{count:pair.hearts}):t('dance.rateHint',{name:person(pair.copy.sender_id)})):(pair.hearts?t('dance.theyGave',{name:person(pair.step.sender_id),count:pair.hearts}):t('dance.notRatedYet',{name:person(pair.step.sender_id)})),'ds-text'),hearts);
    }
    o.append(closer());
  }
  async function rate(pair,n){
    if(busy)return;busy=true;
    try{const row=await api().rpc('rate_dance',{p_copy_id:pair.copy.id,p_hearts:n});ratings=[...ratings.filter(r=>r.copy_id!==row.copy_id),row];
      side({...pair,hearts:n});notify(()=>t('dance.rated',{count:n,name:person(pair.copy.sender_id)}));}
    catch{notify(()=>t('common.unknownError'));}
    finally{busy=false;}
  }
  function ourSteps(){
    const o=overlay('ds-sheet');o.append(el('h3',()=>t('dance.ourSteps'),'ds-sheet-title'));
    const list=pairs(messages,ratings).filter(p=>p.copy);
    if(!list.length)o.append(el('p',()=>t('dance.noPairs'),'ds-text'));
    const grid=el('div',undefined,'ds-list');
    for(const p of list.slice(0,30)){const row=button(()=>'',()=>side(p),'ds-row');
      row.append(el('b',()=>t('dance.style.'+styleOf(p.step.payload.style).id)),el('span',()=>t('dance.pairLine',{step:person(p.step.sender_id),copy:person(p.copy.sender_id)})),
        el('span',()=>p.hearts?t('dance.hearts',{count:p.hearts}):t('dance.unrated'),'ds-row-hearts'));grid.append(row);}
    o.append(grid,closer());
  }
  function diary(){
    const o=overlay('ds-sheet');o.append(el('h3',()=>t('dance.diary'),'ds-sheet-title'));
    const all=dances(messages);if(!all.length)o.append(el('p',()=>t('dance.diaryEmpty'),'ds-text'));
    const fmt=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short'});
    const grid=el('div',undefined,'ds-list'),byId=new Map(pairs(messages,ratings).map(p=>[p.step.id,p]));
    for(const m of all.slice(0,60)){
      const row=button(()=>'',()=>{const p=m.payload.role==='step'?byId.get(m.id):byId.get(m.payload.of);if(p)side(p);},'ds-row');
      const when=el('span',undefined,'ds-row-date');when.textContent=fmt.format(new Date(m.created_at));
      row.append(when,el('b',()=>t('dance.style.'+styleOf(m.payload.style).id)),el('span',()=>m.payload.role==='step'?t('dance.stepBy',{name:person(m.sender_id)}):t('dance.copyBy',{name:person(m.sender_id)})));
      grid.append(row);}
    o.append(grid,closer());
  }

  return {element:root,render(){if(!loaded)paint();load();},stop(){closeOverlay();stopBeat();loaded=false;for(const u of urls.values())u.then(x=>x&&URL.revokeObjectURL(x));urls.clear();}};
}
