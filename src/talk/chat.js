// Talk: the chat between the two of you. Messages arrive live through the private room pair:<pair>:talk
// (the database sends them, backend/008), history loads 50 at a time, and a message that could not be
// sent waits in an outbox and retries (its client id makes a retry safe). Photos and voice notes use the
// private uploads; your partner's devices get a push through dispatch-notification (backend/009).
// Every label comes from the catalog; the words in bubbles are your own.
import {icon} from '../design/icons.js';
import {openSheet} from '../design/sheet.js';
import {spotifyOpenUrl,isCoverUrl} from '../music/links.js';
import {openEditor,filterCss} from './editor.js';
import {mergeMessages,unreadCount,lastSeenId,newDay,applyReaction,outboxAdd,outboxRemove,fitSize} from './model.js';

const PAGE=50,EMOJI=['❤️','😂','😮','😢','🔥','👍'],OUTBOX='talk.outbox',MAX_VOICE_MS=120000,BUCKET='connection-private';
const uid=()=>crypto.randomUUID();
const readBox=()=>{try{const v=JSON.parse(localStorage.getItem(OUTBOX)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
const writeBox=b=>{try{localStorage.setItem(OUTBOX,JSON.stringify(b));}catch{}};
const missingTable=e=>['42P01','PGRST205','PGRST200'].includes(e?.code);

export function createChat({$,el,button,t,copy,locale,getClient,getApi,getSnapshot,me,person,navigate,onUnread,playlistSongs,photoOf=()=>null,onCallButton=null}){
  let list=[],reactions={},reads={},media=new Map(),urls=new Map(),hasEarlier=false,available=null,loading=false,channel=null,joining=false;
  let lastTyping=0,partnerTypingAt=0,online=false,replyTo=null,box=readBox(),failed=new Set(),pending=new Set(),visible=false,readTimer=null,tick=null;
  let views=new Map(),stickers=[],voiceDraft=null,callHandlers=new Set(),recorder=null,recChunks=[],recStart=0,recTimer=null,stickToBottom=true,letters=new Map(),askedLetters=new Set();
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
      await Promise.all([loadLetters(data.filter(m=>m.kind==='letter').map(m=>m.id)),loadReactions(data.map(m=>m.id)),loadReads(),loadMedia(data.filter(m=>['photo','voice','word','video'].includes(m.kind)).map(m=>m.id)),loadViews(data.filter(m=>m.payload?.view).map(m=>m.id)),loadStickers()]);
      connect();render(true);retryOutbox();sweepUploads();
    }catch(e){if(missingTable(e)){available=false;render();}}
    finally{loading=false;}
  }
  async function loadEarlier(){
    const oldest=list[0];if(!oldest||!hasEarlier)return;
    const {data,error}=await client().from('messages').select('*').eq('pair_id',pairId()).lt('created_at',oldest.created_at).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE);
    if(error)return;hasEarlier=data.length===PAGE;const before=listEl.scrollHeight;list=mergeMessages(list,data);
    await Promise.all([loadLetters(data.filter(m=>m.kind==='letter').map(m=>m.id)),loadReactions(data.map(m=>m.id)),loadMedia(data.filter(m=>['photo','voice','word','video'].includes(m.kind)).map(m=>m.id)),loadViews(data.filter(m=>m.payload?.view).map(m=>m.id))]);
    render();listEl.scrollTop=listEl.scrollHeight-before;
  }
  async function loadReactions(ids){if(!ids.length)return;const {data}=await client().from('message_reactions').select('*').in('message_id',ids);for(const r of data??[])reactions=applyReaction(reactions,r);}
  // a letter's words: the server gives them to the writer, and to the other one from the day it opens
  async function loadLetters(ids){if(!ids.length)return;const {data}=await client().from('sealed_letters').select('id,body').in('id',ids);for(const r of data??[])letters.set(r.id,r.body);}
  async function loadReads(){const {data}=await client().from('chat_reads').select('*').eq('pair_id',pairId());for(const r of data??[])reads[r.profile_id]=r.last_read_at;}
  async function loadMedia(ids){if(!ids.length)return;const {data}=await client().from('media_files').select('*').in('message_id',ids);for(const m of data??[])media.set(m.message_id,m);render();}
  // how often a view-once / view-twice photo or video has been opened (by whom)
  async function loadViews(ids){if(!ids.length)return;const {data}=await client().from('message_views').select('message_id,viewer_id,views').in('message_id',ids);for(const r of data??[])views.set(r.message_id+':'+r.viewer_id,r.views);}
  // your own stickers, made from your photos: both of you can use them
  async function loadStickers(){const {data,error}=await client().from('stickers').select('id,owner_id,image,created_at').is('deleted_at',null).order('created_at',{ascending:true});if(!error)stickers=data??[];}
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
    channel.on('broadcast',{event:'message'},({payload})=>{if(payload?.kind==='letter')loadLetters([payload.id]).then(()=>render());if(payload?.kind==='text'&&payload.sender_id!==me()&&!list.some(m=>m.id===payload.id))document.dispatchEvent(new CustomEvent('chat-words',{detail:payload.body}));list=mergeMessages(list,[payload]);pending.delete(payload.id);if(payload.sender_id!==me())partnerTypingAt=0;render();scheduleRead();})
      .on('broadcast',{event:'edit'},({payload})=>{list=mergeMessages(list,[payload]);render();})
      .on('broadcast',{event:'delete'},({payload:gone})=>{const old=list.find(m=>m.id===gone?.id);if(!old)return;list=mergeMessages(list,[{...old,deleted_at:gone.deleted_at,body:null,payload:null}]);render();})
      .on('broadcast',{event:'reaction'},({payload})=>{reactions=applyReaction(reactions,payload);render();})
      .on('broadcast',{event:'read'},({payload})=>{reads[payload.profile_id]=payload.last_read_at;render();})
      .on('broadcast',{event:'typing'},()=>{partnerTypingAt=Date.now();paintStatus();})
      .on('broadcast',{event:'call'},({payload})=>{for(const fn of callHandlers)try{fn(payload);}catch{}})
      .on('broadcast',{event:'viewed'},({payload})=>{if(payload?.message_id){views.set(payload.message_id+':'+payload.viewer_id,payload.views);render();}})
      .on('broadcast',{event:'sticker'},()=>{loadStickers();})
      .on('broadcast',{event:'media'},({payload})=>{if(payload?.message_id)loadMedia([payload.message_id]);})
      .on('presence',{event:'sync'},()=>{const was=online;online=Object.keys(channel.presenceState()).some(k=>k!==me());paintStatus();if(was!==online)document.dispatchEvent(new CustomEvent('partner-presence',{detail:online}));})
      .subscribe(async st=>{joining=false;if(st==='SUBSCRIBED'&&!document.hidden)await channel.track({at:Date.now()}).catch(()=>{});
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
    if(!available)return;if(kind==='text')document.dispatchEvent(new CustomEvent('chat-words',{detail:body}));const m=draft(kind,body,payload);replyTo=null;paintReply();
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
      if(blob.size>25*1024*1024)return;showVoice({blob,filename:type==='audio/mp4'?'voice.m4a':'voice.webm',duration_ms:Date.now()-recStart});};
    r.stop();
  }

  // listen before sending (approved PolishTalk): play it, record again, delete, or send
  function showVoice(d){
    dropVoice();voiceDraft={...d,url:URL.createObjectURL(d.blob)};
    const bar=el('div',undefined,'voice-preview');bar.id='chatVoicePreview';
    const del=button(()=>'',()=>dropVoice(),'round-button');del.append(icon('trash',18));copy(del,()=>t('talk.voiceDelete'),'aria-label');
    const a=document.createElement('audio');a.controls=true;a.src=voiceDraft.url;a.preload='metadata';copy(a,()=>t('talk.voicePreview'),'aria-label');
    const again=button(()=>'',()=>{dropVoice();toggleVoice();},'round-button');again.append(icon('mic',18));copy(again,()=>t('talk.voiceAgain'),'aria-label');
    const go=button(()=>'',()=>{const v=voiceDraft;if(!v)return;voiceDraft=null;bar.remove();form.classList.remove('previewing');sendFile('voice',v.blob,v.filename,{duration_ms:v.duration_ms});setTimeout(()=>URL.revokeObjectURL(v.url),60000);},'round-button primary-round');go.append(icon('send',18));copy(go,()=>t('talk.voiceSend'),'aria-label');
    bar.append(del,a,again,go);form.querySelector('.chat-row').before(bar);form.classList.add('previewing');
  }
  function dropVoice(){const v=voiceDraft;voiceDraft=null;$('chatVoicePreview')?.remove();form.classList.remove('previewing');if(v){v.blob=null;URL.revokeObjectURL(v.url);}}

  // ---- photos and videos: opened full screen; view-once and view-twice open through the server, which counts
  const viewLimit=m=>m.payload?.view==='once'?1:m.payload?.view==='twice'?2:null;
  const seenTimes=(m,who)=>views.get(m.id+':'+who)??0;
  async function openViewer(m,row){
    const mine=m.sender_id===me(),limit=viewLimit(m);
    if(limit&&!mine){try{const n=await api().rpc('view_media',{p_message_id:m.id},true);views.set(m.id+':'+me(),Number(n)||1);}catch{views.set(m.id+':'+me(),limit);render();return;}}
    const u=await urlFor(row);if(!u)return;
    const v=el('div',undefined,'media-viewer');v.setAttribute('role','dialog');v.setAttribute('aria-modal','true');
    const close=()=>{v.remove();document.documentElement.classList.remove('viewer-open');document.removeEventListener('keydown',key);
      // a photo you may only see once or twice is not kept on this phone
      if(limit&&!mine){urls.delete(row.id);URL.revokeObjectURL(u);}render();};
    const key=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',key);
    let node;
    if(m.kind==='video'){node=document.createElement('video');node.controls=true;node.autoplay=true;node.playsInline=true;node.setAttribute('playsinline','');node.src=u;
      const st=+m.payload?.start||0,en=+m.payload?.end||0;node.onloadedmetadata=()=>{if(st)node.currentTime=st;};
      node.ontimeupdate=()=>{if(en&&node.currentTime>=en){node.pause();node.currentTime=st;}};}
    else{node=document.createElement('img');node.src=u;copy(node,()=>t('talk.photoAlt',{name:person(m.sender_id)}),'alt');}
    node.className='media-viewer-item';const f=filterCss(m.payload?.filter);if(f)node.style.filter=f;
    const x=button(()=>'',close,'media-viewer-close');x.append(icon('close',20));copy(x,()=>t('common.close'),'aria-label');
    if(limit)v.append(el('p',()=>t('talk.view.'+m.payload.view),'media-viewer-tag'));
    v.append(node,x);v.onclick=e=>{if(e.target===v)close();};document.body.append(v);document.documentElement.classList.add('viewer-open');x.focus();
  }
  function mediaBubble(m,box){
    const row=media.get(m.id),limit=viewLimit(m),mine=m.sender_id===me();
    if(limit){const left=limit-seenTimes(m,mine?partner():me()),gone=left<=0;
      const chip=button(()=>'',()=>{if(row&&(mine||!gone))openViewer(m,row);},'msg-ephemeral'+(gone?' opened':''));
      chip.append(icon(m.kind==='video'?'video':'camera',18),el('span',()=>gone?t('talk.opened'):t((m.kind==='video'?'talk.videoOnce.':'talk.photoOnce.')+m.payload.view)));
      if(!gone&&!mine&&limit===2&&left===1)chip.append(el('span',()=>t('talk.oneLeft'),'tiny'));
      if(!row)chip.append(el('span',()=>t('talk.uploading'),'tiny'));box.append(chip);return;}
    const fig=el('div',undefined,'msg-photo'+(m.kind==='video'?' msg-video':''));
    if(row){if(m.kind==='video'){const vid=document.createElement('video');vid.muted=true;vid.playsInline=true;vid.setAttribute('playsinline','');vid.preload='metadata';
        urlFor(row).then(u=>{if(u)vid.src=u+'#t='+(+m.payload?.start||0.1);});const f=filterCss(m.payload?.filter);if(f)vid.style.filter=f;fig.append(vid,(()=>{const pl=el('span',undefined,'msg-play');pl.append(icon('playTrack',22));return pl;})());}
      else{const img=document.createElement('img');img.alt='';copy(img,()=>t('talk.photoAlt',{name:person(m.sender_id)}),'alt');img.loading='lazy';urlFor(row).then(u=>{if(u)img.src=u;});fig.append(img);}
      fig.onclick=e=>{e.stopPropagation();openViewer(m,row);};}
    else fig.append(el('p',()=>t('talk.uploading'),'tiny'));box.append(fig);
  }

  // ---- stickers: send one, or make one from a photo (a round cut-out, kept small)
  async function makeSticker(file){
    try{const bmp=await createImageBitmap(file);let data=null;
      for(const size of [320,256,200,160]){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
        const s=Math.min(bmp.width,bmp.height);g.beginPath();g.arc(size/2,size/2,size/2-3,0,Math.PI*2);g.closePath();g.save();g.clip();
        g.drawImage(bmp,(bmp.width-s)/2,(bmp.height-s)/2,s,s,0,0,size,size);g.restore();g.lineWidth=6;g.strokeStyle='#FFFFFF';g.stroke();
        let d=c.toDataURL('image/webp',.86);if(!d.startsWith('data:image/webp'))d=c.toDataURL('image/png');if(d.length<=270000){data=d;break;}}
      bmp.close?.();if(!data)return null;
      const row=await api().rpc('save_sticker',{p_id:uid(),p_image:data});stickers=[...stickers.filter(x=>x.id!==row.id),row];roomSend('sticker',{});return row;}
    catch{copy($('chatStatus'),()=>t('talk.stickerFailed'));return null;}
  }
  function stickerSheet(){
    const sheet=openSheet({title:h=>copy(h,()=>t('talk.stickers')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'sticker-sheet'});
    let editing=false;const grid=el('div',undefined,'sticker-grid');
    const paint=()=>{grid.replaceChildren();if(!stickers.length)grid.append(el('p',()=>t('talk.stickersEmpty'),'small muted'));
      for(const s of stickers){const b=button(()=>'',async()=>{if(editing){if(s.owner_id!==me())return;try{await api().rpc('delete_sticker',{p_id:s.id},true);stickers=stickers.filter(x=>x.id!==s.id);roomSend('sticker',{});paint();}catch{}return;}
          sheet.close();send('sticker',null,{sticker:s.id});},'sticker-pick'+(editing&&s.owner_id===me()?' removing':''));
        const i=new Image();i.src=s.image;i.alt='';b.append(i);copy(b,()=>editing?t('talk.stickerRemove'):t('talk.stickerSend'),'aria-label');grid.append(b);}};
    const pick=document.createElement('input');pick.type='file';pick.accept='image/*';pick.hidden=true;
    pick.onchange=async()=>{const f=pick.files?.[0];pick.value='';if(!f)return;make.disabled=true;await makeSticker(f);make.disabled=false;paint();};
    const make=button(()=>t('talk.stickerMake'),()=>pick.click(),'primary');
    const edit=button(()=>t('talk.stickerEdit'),()=>{editing=!editing;edit.setAttribute('aria-pressed',String(editing));paint();},'quiet');
    sheet.body.append(grid,el('div',undefined,'sheet-actions'),pick);sheet.body.lastChild.previousSibling.append(make,edit);paint();
  }

  // ---- read marks: when the chat is on screen, mark what the partner sent as read
  function scheduleRead(){
    clearTimeout(readTimer);if(!visible||document.hidden||!available)return;
    const last=[...list].reverse().find(m=>m.sender_id!==me()&&!pending.has(m.id));
    if(!last||Date.parse(last.created_at)<=Date.parse(reads[me()]??0))return;
    readTimer=setTimeout(async()=>{try{const r=await api().rpc('mark_chat_read',{p_until:last.created_at});reads[me()]=r.last_read_at;render();}catch{}},900);
  }
  // "here" means the app is open on screen: leaving it (another app, locked phone) stops showing you as here at once
  const showHere=on=>{if(!channel)return;(on?channel.track({at:Date.now()}):channel.untrack()).catch(()=>{});};
  document.addEventListener('visibilitychange',()=>{scheduleRead();paintUnread();showHere(!document.hidden);});
  addEventListener('pagehide',()=>showHere(false));addEventListener('pageshow',()=>showHere(!document.hidden));

  // ---- drawing
  function paintStatus(){
    const p=partner(),typing=Date.now()-partnerTypingAt<4000;paintHead();
    $('chatPresence').classList.toggle('on',online);
    if(recorder)return;
    copy($('chatStatus'),()=>p?(typing?t('talk.typing',{name:person(p)}):online?t('talk.online',{name:person(p)}):''):'');
  }
  function paintReply(){
    const box=$('chatReplying');box.hidden=!replyTo;box.replaceChildren();if(!replyTo)return;
    const quote=el('p',undefined,'small');quote.textContent=replyTo.body??(['photo','video','voice','sticker'].includes(replyTo.kind)?t('talk.kind.'+replyTo.kind):'');quote.dir='auto';
    box.append(el('p',()=>t('talk.replyingTo',{name:person(replyTo.sender_id)}),'tiny'),quote,(()=>{const b=button(()=>'',()=>{replyTo=null;paintReply();},'icon-button');b.append(icon('close',16));copy(b,()=>t('talk.cancelReply'),'aria-label');return b;})());
  }
  function content(m){
    const box=el('div',undefined,'msg-content');
    if(m.deleted_at){box.append(el('p',()=>t('talk.deleted'),'msg-deleted'));return box;}
    if(m.kind==='photo'||m.kind==='video')mediaBubble(m,box);
    if(m.kind==='sticker'){const s=stickers.find(x=>x.id===m.payload?.sticker),fig=el('div',undefined,'msg-sticker');
      if(s){const i=new Image();i.src=s.image;copy(i,()=>t('talk.stickerFrom',{name:person(m.sender_id)}),'alt');fig.append(i);}else fig.append(el('p',()=>t('talk.stickerGone'),'tiny'));box.append(fig);}
    if(m.kind==='voice'){const row=media.get(m.id);
      if(row&&row.status==='ready'||row&&row.owner_id===me()){const a=document.createElement('audio');a.controls=true;a.preload='none';copy(a,()=>t('talk.voiceFrom',{name:person(m.sender_id)}),'aria-label');urlFor(row).then(u=>{if(u)a.src=u;});box.append(a);}
      else box.append(el('p',()=>t('talk.uploading'),'tiny'));
      // practising a word: the partner answers with a heart or "again"
      if(m.payload?.learn?.word){const w=el('p',undefined,'msg-learn');copy(w,()=>m.sender_id===me()?t('talk.youPractised',{word:m.payload.learn.word}):t('talk.practising',{name:person(m.sender_id),word:m.payload.learn.word}));box.append(w);
        if(m.sender_id!==me()){const row=el('div',undefined,'msg-learn-row');
          row.append(button(()=>t('talk.learnHeart'),async()=>{try{await api().rpc('react_message',{p_message_id:m.id,p_emoji:'❤️'},true);reactions=applyReaction(reactions,{message_id:m.id,profile_id:me(),emoji:'❤️'});render();}catch{}},'quiet'),
            button(()=>t('talk.learnAgain'),()=>send('text',t('talk.learnAgainText',{word:m.payload.learn.word}),null),'quiet'));box.append(row);}}}
    if(m.kind==='song'&&m.payload){const card=el('div',undefined,'msg-song');
      if(isCoverUrl(m.payload.cover_url)){const img=document.createElement('img');img.src=m.payload.cover_url;img.alt='';img.referrerPolicy='no-referrer';img.width=44;img.height=44;card.append(img);}
      const words=el('div');const ti=el('p',undefined,'song-title');ti.textContent=m.payload.title??'';ti.dir='auto';const ar=el('p',undefined,'small');ar.textContent=m.payload.artist??'';ar.dir='auto';words.append(ti,ar);
      const url=spotifyOpenUrl({ref:m.payload.ref,title:m.payload.title,artist:m.payload.artist});
      card.append(words);if(url)card.append(button(()=>t('music.openSpotify'),()=>window.open(url,'_blank','noopener,noreferrer'),'quiet'));box.append(card);}
    if(m.kind==='letter'&&m.payload){const card=el('div',undefined,'msg-letter'+(sealed(m)?' sealed':''));const mine=m.sender_id===me();
      if(sealed(m)){card.append(el('span',undefined,'letter-seal'),el('p',()=>mine?t('letter.sealedMine',{name:person(partner()),date:dateFmt(m.payload.opens_at)}):t('letter.sealed',{name:person(m.sender_id),date:dateFmt(m.payload.opens_at)}),'letter-line'));
        if(mine){const p=el('p',undefined,'letter-body');p.textContent=letters.get(m.id)??'';p.dir='auto';card.append(p);}}
      else{card.append(el('p',()=>t('letter.opened',{name:person(m.sender_id),date:dateFmt(String(m.created_at).slice(0,10))}),'letter-line'));const p=el('p',undefined,'letter-body');p.textContent=letters.get(m.id)??'';p.dir='auto';card.append(p);if(!letters.has(m.id)&&!askedLetters.has(m.id)){askedLetters.add(m.id);loadLetters([m.id]).then(()=>{if(letters.has(m.id))render();});}}
      box.append(card);return box;}
    if(m.kind==='dance'&&m.payload){const card=el('div',undefined,'msg-dance');card.append(icon('dance',22),
      el('p',()=>{const style=t('dance.style.'+(m.payload.style??'bachata'));if(m.sender_id===me())return m.payload.role==='copy'?t('talk.danceCopyMine',{name:person(partner())}):t('talk.danceStepMine',{name:person(partner()),style});return m.payload.role==='copy'?t('talk.danceCopy',{name:person(m.sender_id)}):t('talk.danceStep',{name:person(m.sender_id),style});}),
      button(()=>t('talk.openStudio'),()=>document.dispatchEvent(new CustomEvent('open-game',{detail:'dance'})),'primary'));box.append(card);}
    if(m.kind==='game'){box.append(el('p',()=>t('talk.gameInvite',{name:person(m.sender_id)}),'msg-game'),button(()=>t('talk.playNow'),()=>navigate('play'),'primary'));}
    if(m.kind==='word'&&m.payload){if(m.payload.teach)box.append(el('p',()=>t('talk.taughtWord',{name:person(m.sender_id)}),'tiny'));const w=el('p',undefined,'culture-word');w.textContent=m.payload.word??'';if(m.payload.lang)w.lang=m.payload.lang;const mean=el('p',undefined,'culture-meaning');mean.textContent=m.payload.meaning??'';box.append(w,mean);
      const row=media.get(m.id);if(row&&(row.status==='ready'||row.owner_id===me())){const a=document.createElement('audio');a.controls=true;a.preload='none';copy(a,()=>t('talk.voiceFrom',{name:person(m.sender_id)}),'aria-label');urlFor(row).then(u=>{if(u)a.src=u;});box.append(a);}
      if(m.payload.teach&&m.sender_id!==me())box.append(button(()=>t('talk.learnIt'),()=>navigate('learn'),'quiet'));}
    if(m.body){const p=el('p',undefined,'msg-text');p.textContent=m.body;p.dir='auto';box.append(p);}
    return box;
  }
  function bubble(m,seenId){
    const mine=m.sender_id===me(),b=el('div',undefined,'msg '+(mine?'mine':'theirs')+(m.deleted_at?' deleted':'')+(m.kind==='sticker'?' sticker':''));b.dataset.id=m.id;
    if(m.reply_to){const q=list.find(x=>x.id===m.reply_to);const quote=el('p',undefined,'msg-quote');quote.dir='auto';
      if(q)quote.textContent=q.deleted_at||sealed(q)?'':(q.body??q.payload?.title??(['photo','video','voice','sticker'].includes(q.kind)?t('talk.kind.'+q.kind):''));if(q?.deleted_at)copy(quote,()=>t('talk.deleted'));b.append(quote);}
    b.append(content(m));
    const meta=el('p',undefined,'msg-meta');const when=el('span');when.textContent=timeFmt(m.created_at);meta.append(when);
    if(m.edited_at&&!m.deleted_at)meta.append(el('span',()=>t('talk.edited')));
    if(pending.has(m.id))meta.append(el('span',()=>t('talk.sending')));
    if(failed.has(m.id)){const r=button(()=>t('talk.notSent'),()=>deliver(m).catch(()=>{}),'link');meta.append(r);}
    if(seenId===m.id)meta.append(el('span',()=>t('talk.seen'),'msg-seen'));
    b.append(meta);
    const rs=Object.values(reactions[m.id]??{});if(rs.length){const chip=el('p',undefined,'msg-reactions');chip.textContent=rs.join(' ');b.append(chip);}
    if(!m.deleted_at)b.onclick=e=>{if(e.target.closest('button,audio,video,a'))return;actions(m);};
    // swipe a message sideways to answer it
    if(!m.deleted_at){let sx=null,sy=0;b.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
      b.addEventListener('touchmove',e=>{if(sx===null)return;const dx=e.touches[0].clientX-sx;if(Math.abs(e.touches[0].clientY-sy)>30){sx=null;b.style.transform='';return;}b.style.transform='translateX('+Math.max(-70,Math.min(70,dx))+'px)';},{passive:true});
      b.addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;b.style.transform='';if(Math.abs(dx)>60){replyTo=m;paintReply();input.focus();}});}
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
    sheet.body.append(button(()=>t('talk.stickers'),()=>{sheet.close();stickerSheet();},'primary'),button(()=>t('talk.inviteGame'),()=>{sheet.close();send('game',null,{game:'hockey'});},'primary'),
      button(()=>t('letter.write'),()=>{sheet.close();writeLetter();},'quiet letter-open'));
    const songs=playlistSongs?.()??[];
    if(songs.length){sheet.body.append(el('p',()=>t('talk.shareSong'),'eyebrow'));
      for(const s of songs.slice(0,30)){const b=button(()=>'',()=>{sheet.close();send('song',null,{title:s.title,artist:s.artist??null,ref:s.ref,cover_url:s.cover_url??null});},'inbox-row');b.textContent=[s.title,s.artist].filter(Boolean).join(' · ');b.dir='auto';sheet.body.append(b);}}
  }

  // ---- a letter for later: written now, sealed until the day you choose
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const sealed=m=>m.kind==='letter'&&String(m.payload?.opens_at??'')>today();
  const dateFmt=v=>{const [y,mo,d]=String(v).split('-').map(Number);return new Intl.DateTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{day:'numeric',month:'long',year:'numeric'}).format(new Date(y,mo-1,d));};
  function nextAnniversary(){const since=snap()?.pairStory?.together_since;if(!since)return null;const [,m,d]=since.split('-');const y=new Date().getFullYear();
    let c=`${y}-${m}-${d}`;if(c<=today())c=`${y+1}-${m}-${d}`;return c;}
  async function sendLetter(text,day){
    const m=draft('letter',null,{opens_at:day});letters.set(m.id,text);list=mergeMessages(list,[m]);pending.add(m.id);stickToBottom=true;render();
    try{const row=await api().rpc('send_letter',{p_id:m.id,p_body:text,p_opens_at:day});list=mergeMessages(list,[row]);pending.delete(m.id);render();
      client().functions.invoke('dispatch-notification',{body:{event_id:m.id}}).catch(()=>{});}
    catch{pending.delete(m.id);list=list.filter(x=>x.id!==m.id);letters.delete(m.id);render();copy($('chatStatus'),()=>t('dance.sendFailed'));}
  }
  function writeLetter(){
    const sheet=openSheet({title:h=>copy(h,()=>t('letter.title')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'letter-sheet'});
    const area=document.createElement('textarea');area.rows=8;area.maxLength=4000;area.dir='auto';area.className='letter-text';copy(area,()=>t('letter.placeholder',{name:person(partner())}),'placeholder');
    const tomorrow=new Date(Date.now()+86400000),min=tomorrow.getFullYear()+'-'+String(tomorrow.getMonth()+1).padStart(2,'0')+'-'+String(tomorrow.getDate()).padStart(2,'0');
    const when=document.createElement('input');when.type='date';when.min=min;when.value=nextAnniversary()??min;when.className='letter-date';copy(when,()=>t('letter.opensOn'),'aria-label');
    const picks=el('div',undefined,'letter-picks');const anniv=nextAnniversary();
    if(anniv)picks.append(button(()=>t('letter.anniversary'),()=>{when.value=anniv;},'quiet'));
    picks.append(button(()=>t('letter.inMonth'),()=>{const d=new Date();d.setMonth(d.getMonth()+1);when.value=d.toISOString().slice(0,10);},'quiet'),
      button(()=>t('letter.inYear'),()=>{const d=new Date();d.setFullYear(d.getFullYear()+1);when.value=d.toISOString().slice(0,10);},'quiet'));
    const go=button(()=>t('letter.seal'),async()=>{const text=area.value.trim();if(!text||!when.value||when.value<min)return;go.disabled=true;sheet.close();
      await sendLetter(text,when.value);},'primary');
    sheet.body.append(area,el('label',()=>t('letter.opensOn'),'eyebrow'),when,picks,el('p',()=>t('letter.hint',{name:person(partner())}),'small'),go);
    area.focus();
  }

  // ---- the composer
  form.onsubmit=e=>{e.preventDefault();const text=input.value.trim();if(!text)return;input.value='';autosize();send('text',text,null);};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
  const autosize=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,140)+'px';};
  input.addEventListener('input',()=>{autosize();if(Date.now()-lastTyping>2500){lastTyping=Date.now();roomSend('typing',{});}});
  $('chatPhoto').onclick=()=>$('chatPhotoInput').click();
  $('chatPhotoInput').accept='image/*,video/*';
  $('chatPhotoInput').onchange=async()=>{const f=$('chatPhotoInput').files?.[0];$('chatPhotoInput').value='';if(!f)return;
    if(f.type.startsWith('video/')&&f.size>25*1024*1024){copy($('chatStatus'),()=>t('talk.videoTooBig'));return;}
    // the editor works on a lighter copy of a big photo; the original never leaves the phone
    const file=f.type.startsWith('image/')?(await shrinkPhoto(f).then(b=>b?new File([b],'photo.jpg',{type:b.type||'image/jpeg'}):f)):f;
    openEditor({file,t,copy,el,button,stickers:()=>stickers,onSend:({kind,blob,filename,payload})=>{sendFile(kind,blob,filename,Object.keys(payload).length?payload:null);}});};
  $('chatVoice').onclick=()=>toggleVoice();
  // the chat's own header (approved PolishTalk): face, name, online / typing, calls, and full screen
  (()=>{const head=form.closest('.chat')?.querySelector('.chat-head');if(!head||head.dataset.dressed)return;head.dataset.dressed='1';
    const back=button(()=>'',()=>full(false),'chat-head-back');back.append(icon('back',18));copy(back,()=>t('common.close'),'aria-label');
    const face=el('span',undefined,'chat-face');face.id='chatFace';const who=el('div',undefined,'chat-who');const name=el('p',undefined,'chat-name');name.id='chatName';
    who.append(name,$('chatStatus'));head.prepend(back,face);$('chatPresence').after(who);
    const callA=button(()=>'',()=>onCallButton?.('audio'),'chat-head-btn');callA.id='chatCall';callA.append(icon('phone',18));copy(callA,()=>t('call.voice'),'aria-label');
    const callV=button(()=>'',()=>onCallButton?.('video'),'chat-head-btn');callV.id='chatVideo';callV.append(icon('video',18));copy(callV,()=>t('call.video'),'aria-label');
    const big=button(()=>'',()=>full(!document.documentElement.classList.contains('chat-full')),'chat-head-btn');big.id='chatFull';big.append(icon('expand',18));copy(big,()=>t('talk.fullScreen'),'aria-label');
    head.append(callA,callV,big);})();
  function full(on){document.documentElement.classList.toggle('chat-full',on);const b=$('chatFull');if(b){b.replaceChildren(icon(on?'shrink':'expand',18));}render(true);}
  function paintHead(){const p=partner(),face=$('chatFace'),name=$('chatName');if(!face||!name)return;name.textContent=p?person(p):'';name.dir='auto';
    const src=p?photoOf(p):null;const cur=face.querySelector('img');if(src){if(cur?.getAttribute('src')!==src){const i=new Image();i.src=src;i.alt='';face.replaceChildren(i);}}else face.textContent=(p?person(p):'?').charAt(0).toUpperCase();}
  $('chatMore').onclick=()=>openExtras();
  listEl.addEventListener('scroll',()=>{if(listEl.scrollTop<40&&hasEarlier)loadEarlier();});

  document.addEventListener('write-letter',()=>writeLetter());
  return {
    // calls ride on the same private room: offers, answers and network candidates as 'call' events
    callSignal(payload){if(!channel)connect();return roomSend('call',payload);},
    onCall(fn){callHandlers.add(fn);return()=>callHandlers.delete(fn);},
    partnerOnline:()=>online,
    // the chat pane became visible (or not): load once, mark as read while it is on screen
    shown(on){visible=on;if(!on)document.documentElement.classList.remove('chat-full');if(on){if(available===null)load();else{render(true);scheduleRead();}}else paintUnread();},
    refresh(){if(available===null||!api()?.context)return;if(!channel)connect();},
    start(){if(available===null)load();},
    clear(){letters=new Map();askedLetters=new Set();const c=channel;channel=null;if(c)client()?.removeChannel(c);clearInterval(tick);clearTimeout(readTimer);if(recorder)finishVoice(false);dropVoice();views=new Map();stickers=[];document.documentElement.classList.remove('chat-full');
      for(const u of urls.values())u.then(x=>x&&URL.revokeObjectURL(x)).catch(()=>{});urls.clear();media.clear();
      list=[];reactions={};reads={};available=null;hasEarlier=false;replyTo=null;failed.clear();pending.clear();online=false;listEl.replaceChildren();paintReply();onUnread?.(0);},
  };
}
