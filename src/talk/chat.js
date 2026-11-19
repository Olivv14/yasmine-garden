// Talk: the chat between the two of you. Messages arrive live through the private room pair:<pair>:talk
// (the database sends them, backend/008), history loads 50 at a time, and a message that could not be
// sent waits in an outbox and retries (its client id makes a retry safe). Photos and voice notes use the
// private uploads; your partner's devices get a push through dispatch-notification (backend/009).
// Every label comes from the catalog; the words in bubbles are your own.
import {icon} from '../design/icons.js';
import {openSheet} from '../design/sheet.js';
import {spotifyOpenUrl,isCoverUrl} from '../music/links.js';
import {mergeMessages,unreadCount,lastSeenId,newDay,applyReaction,outboxAdd,outboxRemove,fitSize} from './model.js';

const PAGE=50,EMOJI=['❤️','😂','😮','😢','🔥','👍'],OUTBOX='talk.outbox',MAX_VOICE_MS=120000,BUCKET='connection-private';
const uid=()=>crypto.randomUUID();
const readBox=()=>{try{const v=JSON.parse(localStorage.getItem(OUTBOX)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
const writeBox=b=>{try{localStorage.setItem(OUTBOX,JSON.stringify(b));}catch{}};
const missingTable=e=>['42P01','PGRST205','PGRST200'].includes(e?.code);

export function createChat({$,el,button,t,copy,locale,getClient,getApi,getSnapshot,me,person,navigate,onUnread,playlistSongs}){
  let list=[],reactions={},reads={},media=new Map(),urls=new Map(),hasEarlier=false,available=null,loading=false,channel=null,joining=false;
  let lastTyping=0,partnerTypingAt=0,online=false,replyTo=null,box=readBox(),failed=new Set(),pending=new Set(),visible=false,readTimer=null,tick=null;
  let recorder=null,recChunks=[],recStart=0,recTimer=null,stickToBottom=true;
  const snap=()=>getSnapshot(),pairId=()=>snap()?.pairId,partner=()=>snap()?.members?.find(m=>m.profile_id!==me())?.profile_id??null;
  const client=()=>getClient(),api=()=>getApi();
  const listEl=$('chatList'),input=$('chatInput'),form=$('chatForm');
  const timeFmt=v=>new Intl.DateTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{hour:'2-digit',minute:'2-digit'}).format(new Date(v));
  const dayFmt=v=>{const d=new Date(v),days=Math.round((new Date(d.toDateString())-new Date(new Date().toDateString()))/86400000);
    return Math.abs(days)<2?new Intl.RelativeTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{numeric:'auto'}).format(days,'day'):new Intl.DateTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{weekday:'short',day:'numeric',month:'short'}).format(d);};

  // ---- data
  async function load(){
    if(loading||!api()?.context||!pairId())return;loading=true;
    try{
      const q=client().from('messages').select('*').eq('pair_id',pairId()).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE);
      const {data,error}=await q;if(error)throw error;
      available=true;hasEarlier=data.length===PAGE;list=mergeMessages([],data);
      await Promise.all([loadReactions(data.map(m=>m.id)),loadReads(),loadMedia(data.filter(m=>['photo','voice'].includes(m.kind)).map(m=>m.id))]);
      connect();render(true);retryOutbox();sweepUploads();
    }catch(e){if(missingTable(e)){available=false;render();}}
    finally{loading=false;}
  }
  async function loadEarlier(){
    const oldest=list[0];if(!oldest||!hasEarlier)return;
    const {data,error}=await client().from('messages').select('*').eq('pair_id',pairId()).lt('created_at',oldest.created_at).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE);
    if(error)return;hasEarlier=data.length===PAGE;const before=listEl.scrollHeight;list=mergeMessages(list,data);
    await Promise.all([loadReactions(data.map(m=>m.id)),loadMedia(data.filter(m=>['photo','voice'].includes(m.kind)).map(m=>m.id))]);
    render();listEl.scrollTop=listEl.scrollHeight-before;
  }
  async function loadReactions(ids){if(!ids.length)return;const {data}=await client().from('message_reactions').select('*').in('message_id',ids);for(const r of data??[])reactions=applyReaction(reactions,r);}
  async function loadReads(){const {data}=await client().from('chat_reads').select('*').eq('pair_id',pairId());for(const r of data??[])reads[r.profile_id]=r.last_read_at;}
  async function loadMedia(ids){if(!ids.length)return;const {data}=await client().from('media_files').select('*').in('message_id',ids);for(const m of data??[])media.set(m.message_id,m);render();}
  async function urlFor(row){
    if(urls.has(row.id))return urls.get(row.id);
    const job=api().download(row).then(blob=>URL.createObjectURL(blob));urls.set(row.id,job);
    try{return await job;}catch{urls.delete(row.id);return null;}
  }

  // ---- the live room: database events (message, edit, delete, reaction, read) and our own (typing, media)
  async function connect(){
    if(channel||joining||!pairId())return;joining=true;
    try{await client().realtime.setAuth();}catch{}
    channel=client().channel('pair:'+pairId()+':talk',{config:{private:true,broadcast:{self:false},presence:{key:me()}}});
    channel.on('broadcast',{event:'message'},({payload})=>{list=mergeMessages(list,[payload]);pending.delete(payload.id);if(payload.sender_id!==me())partnerTypingAt=0;render();scheduleRead();})
      .on('broadcast',{event:'edit'},({payload})=>{list=mergeMessages(list,[payload]);render();})
      .on('broadcast',{event:'delete'},({payload:gone})=>{const old=list.find(m=>m.id===gone?.id);if(!old)return;list=mergeMessages(list,[{...old,deleted_at:gone.deleted_at,body:null,payload:null}]);render();})
      .on('broadcast',{event:'reaction'},({payload})=>{reactions=applyReaction(reactions,payload);render();})
      .on('broadcast',{event:'read'},({payload})=>{reads[payload.profile_id]=payload.last_read_at;render();})
      .on('broadcast',{event:'typing'},()=>{partnerTypingAt=Date.now();paintStatus();})
      .on('broadcast',{event:'media'},({payload})=>{if(payload?.message_id)loadMedia([payload.message_id]);})
      .on('presence',{event:'sync'},()=>{online=Object.keys(channel.presenceState()).some(k=>k!==me());paintStatus();})
      .subscribe(async st=>{joining=false;if(st==='SUBSCRIBED')await channel.track({at:Date.now()}).catch(()=>{});
        else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){const c=channel;channel=null;if(c)client()?.removeChannel(c);}});
    clearInterval(tick);tick=setInterval(paintStatus,1500);
  }
  const roomSend=(event,payload)=>channel?.send({type:'broadcast',event,payload}).catch(()=>{});
  // An upload interrupted more than ten minutes ago is removed, so it never holds your 100 MiB.
  async function sweepUploads(){
    const {data}=await client().from('media_files').select('*').eq('owner_id',me()).not('message_id','is',null).neq('status','ready');
    for(const m of data??[]){if(m.status==='pending'&&Date.now()-Date.parse(m.created_at)<600000)continue;
      try{if(m.status==='pending')await api().rpc('mark_media_delete',{p_id:m.id});await client().storage.from(BUCKET).remove([m.object_key]).catch(()=>{});await api().rpc('finish_media_delete',{p_id:m.id},true);}catch{}}
  }

  // ---- sending
  function draft(kind,body,payload){return {id:uid(),pair_id:pairId(),sender_id:me(),kind,body:body??null,payload:payload??null,reply_to:replyTo?.id??null,created_at:new Date().toISOString(),edited_at:null,deleted_at:null};}
  async function deliver(m){
    pending.add(m.id);failed.delete(m.id);render();
    try{
      const row=await api().rpc('send_message',{p_id:m.id,p_kind:m.kind,p_body:m.body,p_payload:m.payload,p_reply_to:m.reply_to});
      list=mergeMessages(list,[row]);pending.delete(m.id);box=outboxRemove(box,m.id);writeBox(box);render();
      // the partner's phones: a push, best effort (the message is already saved and live)
      client().functions.invoke('dispatch-notification',{body:{event_id:m.id}}).catch(()=>{});
      return row;
    }catch(e){pending.delete(m.id);failed.add(m.id);render();throw e;}
  }
  async function send(kind,body,payload){
    if(!available)return;const m=draft(kind,body,payload);replyTo=null;paintReply();
    list=mergeMessages(list,[m]);stickToBottom=true;
    if(kind==='text'||kind==='song'||kind==='game'||kind==='word'){box=outboxAdd(box,m);writeBox(box);}
    try{return await deliver(m);}catch{return null;}
  }
  function retryOutbox(){for(const m of box){if(m.pair_id&&m.pair_id!==pairId())continue;list=mergeMessages(list,[m]);deliver(m).catch(()=>{});}}
  window.addEventListener('online',()=>{if(available)retryOutbox();});

  async function sendFile(kind,blob,filename,payload=null){
    const m=draft(kind,null,payload);list=mergeMessages(list,[m]);stickToBottom=true;render();
    try{
      await deliver(m);
      const row=await api().rpc('reserve_message_media',{p_id:uid(),p_message_id:m.id,p_filename:filename.slice(0,200),p_mime_type:blob.type});
      media.set(m.id,row);urls.set(row.id,Promise.resolve(URL.createObjectURL(blob)));render();
      const up=await client().storage.from(BUCKET).upload(row.object_key,blob,{upsert:false,contentType:blob.type,cacheControl:'0'});
      if(up.error)throw up.error;
      media.set(m.id,await api().rpc('finalize_media',{p_id:row.id}));render();
      roomSend('media',{message_id:m.id});
    }catch{failed.add(m.id);render();}
  }
  async function shrinkPhoto(file){
    try{const bmp=await createImageBitmap(file);const {w,h}=fitSize(bmp.width,bmp.height);const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close?.();
      return await new Promise(r=>c.toBlob(b=>r(b),'image/jpeg',.85));}catch{return file.type.startsWith('image/')?file:null;}
  }

  // ---- voice notes (MediaRecorder; iPhone records audio/mp4)
  async function toggleVoice(){
    if(recorder){finishVoice(true);return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){copy($('chatStatus'),()=>t('record.unsupported'));return;}
    let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch{copy($('chatStatus'),()=>t('record.denied'));return;}
    const type=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported?.(x))??'';
    recorder=new MediaRecorder(stream,type?{mimeType:type}:{});recChunks=[];recStart=Date.now();
    recorder.ondataavailable=e=>{if(e.data.size)recChunks.push(e.data);};
    recorder.start(250);form.classList.add('recording');$('chatVoice').replaceChildren(icon('stop',18));copy($('chatVoice'),()=>t('talk.stopVoice'),'aria-label');
    recTimer=setInterval(()=>{const s=Math.round((Date.now()-recStart)/1000);copy($('chatStatus'),()=>t('talk.recording',{seconds:s}));if(Date.now()-recStart>=MAX_VOICE_MS)finishVoice(true);},500);
  }
  function finishVoice(keep){
    const r=recorder;if(!r)return;recorder=null;clearInterval(recTimer);form.classList.remove('recording');
    $('chatVoice').replaceChildren(icon('mic',18));copy($('chatVoice'),()=>t('talk.voice'),'aria-label');copy($('chatStatus'),'');
    r.onstop=()=>{r.stream.getTracks().forEach(x=>x.stop());if(!keep||!recChunks.length)return;
      const type=(r.mimeType||'audio/webm').split(';')[0];const blob=new Blob(recChunks,{type});
      if(blob.size>25*1024*1024)return;sendFile('voice',blob,type==='audio/mp4'?'voice.m4a':'voice.webm',{duration_ms:Date.now()-recStart});};
    r.stop();
  }

  // ---- read marks: when the chat is on screen, mark what the partner sent as read
  function scheduleRead(){
    clearTimeout(readTimer);if(!visible||document.hidden||!available)return;
    const last=[...list].reverse().find(m=>m.sender_id!==me()&&!pending.has(m.id));
    if(!last||Date.parse(last.created_at)<=Date.parse(reads[me()]??0))return;
    readTimer=setTimeout(async()=>{try{const r=await api().rpc('mark_chat_read',{p_until:last.created_at});reads[me()]=r.last_read_at;render();}catch{}},900);
  }
  document.addEventListener('visibilitychange',()=>{scheduleRead();paintUnread();});

  // ---- drawing
  function paintStatus(){
    const p=partner(),typing=Date.now()-partnerTypingAt<4000;
    $('chatPresence').classList.toggle('on',online);
    if(recorder)return;
    copy($('chatStatus'),()=>p?(typing?t('talk.typing',{name:person(p)}):online?t('talk.online',{name:person(p)}):''):'');
  }
  function paintReply(){
    const box=$('chatReplying');box.hidden=!replyTo;box.replaceChildren();if(!replyTo)return;
    const quote=el('p',undefined,'small');quote.textContent=replyTo.body??'';quote.dir='auto';
    box.append(el('p',()=>t('talk.replyingTo',{name:person(replyTo.sender_id)}),'tiny'),quote,(()=>{const b=button(()=>'',()=>{replyTo=null;paintReply();},'icon-button');b.append(icon('close',16));copy(b,()=>t('talk.cancelReply'),'aria-label');return b;})());
  }
  function content(m){
    const box=el('div',undefined,'msg-content');
    if(m.deleted_at){box.append(el('p',()=>t('talk.deleted'),'msg-deleted'));return box;}
    if(m.kind==='photo'){const row=media.get(m.id),fig=el('div',undefined,'msg-photo');
      if(row){const img=document.createElement('img');img.alt='';copy(img,()=>t('talk.photoAlt',{name:person(m.sender_id)}),'alt');img.loading='lazy';urlFor(row).then(u=>{if(u)img.src=u;});fig.append(img);}
      else fig.append(el('p',()=>t('talk.uploading'),'tiny'));box.append(fig);}
    if(m.kind==='voice'){const row=media.get(m.id);
      if(row&&row.status==='ready'||row&&row.owner_id===me()){const a=document.createElement('audio');a.controls=true;a.preload='none';copy(a,()=>t('talk.voiceFrom',{name:person(m.sender_id)}),'aria-label');urlFor(row).then(u=>{if(u)a.src=u;});box.append(a);}
      else box.append(el('p',()=>t('talk.uploading'),'tiny'));}
    if(m.kind==='song'&&m.payload){const card=el('div',undefined,'msg-song');
      if(isCoverUrl(m.payload.cover_url)){const img=document.createElement('img');img.src=m.payload.cover_url;img.alt='';img.referrerPolicy='no-referrer';img.width=44;img.height=44;card.append(img);}
      const words=el('div');const ti=el('p',undefined,'song-title');ti.textContent=m.payload.title??'';ti.dir='auto';const ar=el('p',undefined,'small');ar.textContent=m.payload.artist??'';ar.dir='auto';words.append(ti,ar);
      const url=spotifyOpenUrl({ref:m.payload.ref,title:m.payload.title,artist:m.payload.artist});
      card.append(words);if(url)card.append(button(()=>t('music.openSpotify'),()=>window.open(url,'_blank','noopener,noreferrer'),'quiet'));box.append(card);}
    if(m.kind==='game'){box.append(el('p',()=>t('talk.gameInvite',{name:person(m.sender_id)}),'msg-game'),button(()=>t('talk.playNow'),()=>navigate('play'),'primary'));}
    if(m.kind==='word'&&m.payload){const w=el('p',undefined,'culture-word');w.textContent=m.payload.word??'';if(m.payload.lang)w.lang=m.payload.lang;const mean=el('p',undefined,'culture-meaning');mean.textContent=m.payload.meaning??'';box.append(w,mean);}
    if(m.body){const p=el('p',undefined,'msg-text');p.textContent=m.body;p.dir='auto';box.append(p);}
    return box;
  }
  function bubble(m,seenId){
    const mine=m.sender_id===me(),b=el('div',undefined,'msg '+(mine?'mine':'theirs')+(m.deleted_at?' deleted':''));b.dataset.id=m.id;
    if(m.reply_to){const q=list.find(x=>x.id===m.reply_to);const quote=el('p',undefined,'msg-quote');quote.dir='auto';
      if(q)quote.textContent=q.deleted_at?'':(q.body??q.payload?.title??'');if(q?.deleted_at)copy(quote,()=>t('talk.deleted'));b.append(quote);}
    b.append(content(m));
    const meta=el('p',undefined,'msg-meta');const when=el('span');when.textContent=timeFmt(m.created_at);meta.append(when);
    if(m.edited_at&&!m.deleted_at)meta.append(el('span',()=>t('talk.edited')));
    if(pending.has(m.id))meta.append(el('span',()=>t('talk.sending')));
    if(failed.has(m.id)){const r=button(()=>t('talk.notSent'),()=>deliver(m).catch(()=>{}),'link');meta.append(r);}
    if(seenId===m.id)meta.append(el('span',()=>t('talk.seen'),'msg-seen'));
    b.append(meta);
    const rs=Object.values(reactions[m.id]??{});if(rs.length){const chip=el('p',undefined,'msg-reactions');chip.textContent=rs.join(' ');b.append(chip);}
    if(!m.deleted_at)b.onclick=e=>{if(e.target.closest('button,audio,a'))return;actions(m);};
    return b;
  }
  function render(toBottom=false){
    if(!listEl)return;
    const near=listEl.scrollHeight-listEl.scrollTop-listEl.clientHeight<120;
    listEl.replaceChildren();
    if(available===false){listEl.append(el('p',()=>t('talk.needsUpdate'),'muted chat-empty'));return;}
    if(hasEarlier)listEl.append(button(()=>t('talk.earlier'),()=>loadEarlier(),'link chat-earlier'));
    if(available&&!list.length)listEl.append(el('p',()=>t('talk.empty'),'muted chat-empty'));
    const seenId=lastSeenId(list.filter(m=>!pending.has(m.id)),me(),reads[partner()]);
    list.forEach((m,i)=>{if(newDay(list[i-1],m)){const d=el('p',undefined,'chat-day');d.textContent=dayFmt(m.created_at);listEl.append(d);}listEl.append(bubble(m,seenId));});
    if(toBottom||near||stickToBottom){listEl.scrollTop=listEl.scrollHeight;stickToBottom=false;}
    paintUnread();
  }
  // the Talk tab's count: nothing while you are looking at the chat
  const paintUnread=()=>onUnread?.(visible&&!document.hidden?0:unreadCount(list,me(),reads[me()]));

  // ---- what you can do with a message
  function actions(m){
    const mine=m.sender_id===me();
    const sheet=openSheet({title:h=>copy(h,()=>t('talk.react')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'msg-actions'});
    const row=el('div',undefined,'emoji-row');const current=(reactions[m.id]??{})[me()];
    for(const e of EMOJI){const b=button(()=>'',async()=>{sheet.close();try{await api().rpc('react_message',{p_message_id:m.id,p_emoji:current===e?null:e},true);reactions=applyReaction(reactions,{message_id:m.id,profile_id:me(),emoji:current===e?null:e});render();}catch{}},'emoji'+(current===e?' on':''));b.textContent=e;b.setAttribute('aria-pressed',String(current===e));row.append(b);}
    const acts=el('div',undefined,'sheet-actions');
    acts.append(button(()=>t('talk.reply'),()=>{sheet.close();replyTo=m;paintReply();input.focus();},'quiet'));
    if(mine&&['text','photo','voice'].includes(m.kind))acts.append(button(()=>t('talk.edit'),()=>{sheet.close();editMessage(m);},'quiet'));
    if(mine)acts.append(button(()=>t('talk.delete'),async()=>{sheet.close();if(!confirm(t('talk.deleteConfirm')))return;
      try{const row=await api().rpc('delete_message',{p_id:m.id});list=mergeMessages(list,[row]);render();
        const up=media.get(m.id);if(up&&up.owner_id===me()){await client().storage.from(BUCKET).remove([up.object_key]).catch(()=>{});await api().rpc('finish_media_delete',{p_id:up.id},true).catch(()=>{});media.delete(m.id);}}catch{}},'quiet danger'));
    sheet.body.append(row,acts);
  }
  function editMessage(m){
    const sheet=openSheet({title:h=>copy(h,()=>t('talk.edit')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'music-form'});
    const area=document.createElement('textarea');area.rows=3;area.maxLength=4000;area.value=m.body??'';area.dir='auto';
    const save=button(()=>t('common.save'),async e=>{e.currentTarget.disabled=true;try{const row=await api().rpc('edit_message',{p_id:m.id,p_body:area.value});list=mergeMessages(list,[row]);render();sheet.close();}catch{}finally{if(e.currentTarget?.isConnected)e.currentTarget.disabled=false;}},'primary');
    sheet.body.append(area,save);setTimeout(()=>area.focus(),50);
  }
  function openExtras(){
    const sheet=openSheet({title:h=>copy(h,()=>t('talk.more')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'music-form'});
    sheet.body.append(button(()=>t('talk.inviteGame'),()=>{sheet.close();send('game',null,{game:'hockey'});},'primary'));
    const songs=playlistSongs?.()??[];
    if(songs.length){sheet.body.append(el('p',()=>t('talk.shareSong'),'eyebrow'));
      for(const s of songs.slice(0,30)){const b=button(()=>'',()=>{sheet.close();send('song',null,{title:s.title,artist:s.artist??null,ref:s.ref,cover_url:s.cover_url??null});},'inbox-row');b.textContent=[s.title,s.artist].filter(Boolean).join(' · ');b.dir='auto';sheet.body.append(b);}}
  }

  // ---- the composer
  form.onsubmit=e=>{e.preventDefault();const text=input.value.trim();if(!text)return;input.value='';autosize();send('text',text,null);};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
  const autosize=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,140)+'px';};
  input.addEventListener('input',()=>{autosize();if(Date.now()-lastTyping>2500){lastTyping=Date.now();roomSend('typing',{});}});
  $('chatPhoto').onclick=()=>$('chatPhotoInput').click();
  $('chatPhotoInput').onchange=async()=>{const f=$('chatPhotoInput').files?.[0];$('chatPhotoInput').value='';if(!f)return;const blob=await shrinkPhoto(f);if(blob)sendFile('photo',blob,'photo.jpg');};
  $('chatVoice').onclick=()=>toggleVoice();
  $('chatMore').onclick=()=>openExtras();
  listEl.addEventListener('scroll',()=>{if(listEl.scrollTop<40&&hasEarlier)loadEarlier();});

  return {
    // the chat pane became visible (or not): load once, mark as read while it is on screen
    shown(on){visible=on;if(on){if(available===null)load();else{render(true);scheduleRead();}}else paintUnread();},
    refresh(){if(available===null||!api()?.context)return;if(!channel)connect();},
    start(){if(available===null)load();},
    clear(){const c=channel;channel=null;if(c)client()?.removeChannel(c);clearInterval(tick);clearTimeout(readTimer);if(recorder)finishVoice(false);
      for(const u of urls.values())u.then(x=>x&&URL.revokeObjectURL(x)).catch(()=>{});urls.clear();media.clear();
      list=[];reactions={};reads={};available=null;hasEarlier=false;replyTo=null;failed.clear();pending.clear();online=false;listEl.replaceChildren();paintReply();onUnread?.(0);},
  };
}
