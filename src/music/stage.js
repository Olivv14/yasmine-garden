// Music: playlists you share, "Our dedicated songs", adding songs by link or from your uploads,
// and lyric cards that follow the song. Sound only: Spotify songs play in Spotify (never a video here),
// your own uploaded songs play in the app. Writes go through the 007 RPCs; every label is from the catalog.
import {openSheet} from '../design/sheet.js';
import {icon} from '../design/icons.js';
import {parseSongLink,lookupLink,spotifyOpenUrl,isCoverUrl} from './links.js';
import {fetchLyrics,lineAt,lyricsKey} from './lyrics.js';
import {createTogether,partnerPosition,needsSeek} from './together.js';

const uid=()=>crypto.randomUUID();
const DEFAULT_LISTEN_MS=4*60*1000;

export function createMusic({$,el,button,t,copy,getSnapshot,getClient,me,person,rpc,notify,playUpload,player,onNowPlaying,spotify=null}){
  let queue=[],qi=-1,userPaused=false,wasOn=false,advancing=false,inApp=false,sheet=null,selected=null,now=null,listen=null,lyrics=null,lyricsFor='',tick=null,ensuring=null,following=false;
  const together=createTogether({getClient,getPairId:()=>getSnapshot()?.pairId,me,onChange:()=>{paintTogether();onNowPlaying?.();}});
  const snap=()=>getSnapshot();
  const available=()=>Array.isArray(snap()?.playlists);
  const lists=()=>(snap()?.playlists??[]).filter(p=>!p.deleted_at).sort((a,b)=>(a.kind==='dedicated'?-1:b.kind==='dedicated'?1:0)||a.created_at.localeCompare(b.created_at));
  const items=id=>(snap()?.playlistItems??[]).filter(i=>i.playlist_id===id&&!i.deleted_at).sort((a,b)=>Number(a.position)-Number(b.position));
  const title=p=>p.kind==='dedicated'?t('music.dedicatedTitle'):p.title;
  const uploads=()=>(snap()?.content??[]).filter(c=>c.item_type==='track'&&!c.deleted_at&&(c.visibility==='shared'||c.owner_id===me()));

  // The pair's dedicated playlist exists once both phones have opened Music; creating it is idempotent.
  async function ensureDedicated(){
    if(!available()||lists().some(p=>p.kind==='dedicated'))return;
    ensuring??=rpc('ensure_dedicated_playlist',{p_id:uid()}).catch(()=>{}).finally(()=>{ensuring=null;});
    await ensuring;
  }

  // ---- what is playing: an uploaded song in the app, or a Spotify song followed by a timer
  const position=()=>{if(!now)return 0;if(now.source==='upload')return player.currentTime||0;if(inApp)return spotify.position()/1000;return listen?(Date.now()-listen.started)/1000:0;};
  const isPlaying=()=>!!now&&(now.source==='upload'?!player.paused&&!player.ended:inApp?spotify.playing():!!listen&&Date.now()-listen.started<listen.length);
  function openOutside(item){const url=spotifyOpenUrl(item);if(url)window.open(url,'_blank','noopener,noreferrer');listen={started:Date.now(),length:item.duration_ms||DEFAULT_LISTEN_MS};}
  function play(item,startAt=0){
    {const j=queue.findIndex(x=>x.id===item.id);if(j>=0)qi=j;}userPaused=false;wasOn=false;advancing=false;
    if(inApp&&now?.source!=='upload')spotify.stop();inApp=false;now=item;listen=null;
    if(item.source==='upload'){playUpload(item.ref);}
    else if(spotify?.connected()&&/^spotify:track:/.test(item.ref??'')){
      // inside the app (or on your Spotify app, controlled from here); only if neither works does Spotify open
      inApp=true;if(!player.paused)player.pause();paint();
      spotify.play(item.ref,startAt*1000).then(where=>{if(now!==item)return;if(!where){inApp=false;openOutside(item);}paint();onNowPlaying?.();});}
    else openOutside(item);
    if(item.source!=='upload')together.share({item,playing:true,position:0});
    loadLyrics(item);startTick();onNowPlaying?.();paint();
  }
  // ---- a real player: a list that plays on by itself, previous / next, pause / resume
  function playQueue(items,i=0){queue=items.slice();qi=i;if(queue[i])play(queue[i]);}
  function step(d){if(!queue.length)return false;const j=qi+d;if(j<0||j>=queue.length)return false;qi=j;play(queue[j]);return true;}
  async function toggle(){
    if(!now){if(queue.length)playQueue(queue,Math.max(0,qi));return;}
    if(now.source==='upload'){if(player.paused){userPaused=false;player.play().catch(()=>playUpload(now.ref));}else{userPaused=true;player.pause();}}
    else if(inApp){if(spotify.playing()){userPaused=true;await spotify.pause();}else{userPaused=false;await spotify.resume();}}
    else play(now);
    onNowPlaying?.();paint();}
  // the song ended by itself (not paused by you): the next one starts
  function checkEnd(){
    if(!now||advancing||userPaused)return;const on=isPlaying();
    if(now.source!=='upload'&&inApp){const d=(spotify.duration()||now.duration_ms||0),pos=spotify.position();
      if((d>0&&pos>=d-900)||(wasOn&&!on&&pos<1500)){advancing=true;if(!step(1)){stopListening();}return;}}
    wasOn=on;}
  player.addEventListener('ended',()=>{if(now?.source==='upload'&&!advancing){advancing=true;if(!step(1))onNowPlaying?.();}});
  // Join your partner: the same song from the same moment (your own uploads stay in sync to 1.5 s;
  // a Spotify song opens in Spotify at the start, so it is close but not exact).
  function join(){
    const p=together.partner();if(!p)return;
    const item=(getSnapshot()?.playlistItems??[]).find(i=>i.id===p.item.id)??p.item;
    following=true;play(item,item.source==='upload'?0:partnerPosition(p));
    if(item.source==='upload'){const seek=()=>{player.currentTime=partnerPosition(p);};if(player.readyState>=1)seek();else player.addEventListener('loadedmetadata',seek,{once:true});}
    else if(listen)listen.started=Date.now()-partnerPosition(p)*1000;
  }
  function stopListening(){if(inApp){spotify.stop();inApp=false;}listen=null;following=false;together.share({playing:false});onNowPlaying?.();paint();}
  function startTick(){clearInterval(tick);tick=setInterval(()=>{checkEnd();if(!isPlaying()&&listen){listen=null;together.share({playing:false});onNowPlaying?.();}
    const p=together.partner();
    if(following&&now?.source==='upload'&&p?.playing&&p.item.id===now.id&&!player.paused){const target=partnerPosition(p);if(needsSeek(player.currentTime,target))player.currentTime=target;}
    paintLyric();if(!isPlaying()&&!sheet&&!(inApp&&!userPaused))clearInterval(tick);},400);}
  for(const ev of ['play','pause','seeked','ended'])player.addEventListener(ev,()=>{if(now?.source==='upload')together.share({item:now,playing:!player.paused&&!player.ended,position:player.currentTime||0});});
  player.addEventListener('play',()=>{if(now?.source!=='upload'){if(inApp)spotify.stop();inApp=false;now=null;lyrics=null;}onNowPlaying?.();});

  async function loadLyrics(item){
    const song={title:item.title,artist:item.artist??'',durationMs:item.duration_ms??null},key=lyricsKey(song);
    if(lyricsFor===key)return;lyricsFor=key;lyrics={state:'loading'};paintLyric();
    try{const r=await fetchLyrics(song);if(lyricsFor!==key)return;lyrics={state:r.synced?.length?'synced':r.plain?'plain':r.instrumental?'instrumental':'none',...r};}
    catch{if(lyricsFor===key)lyrics={state:'none'};}
    paintLyric();
  }
  // The line being sung, as a small card like the garden's discoveries, with the next line faded.
  function lyricCard(){
    const box=el('div',undefined,'lyric-card');box.setAttribute('aria-live','polite');
    const st=lyrics?.state;
    if(!now||!st)return box;
    if(st==='loading'){box.append(el('p',()=>t('music.lyricsLoading'),'lyric-note'));return box;}
    if(st==='none'||st==='instrumental'){box.append(el('p',()=>t(st==='none'?'music.lyricsNone':'music.lyricsInstrumental'),'lyric-note'));return box;}
    if(st==='plain'){const p=el('p',undefined,'lyric-plain');p.textContent=lyrics.plain;p.dir='auto';box.append(el('p',()=>t('music.lyricsPlain'),'lyric-note'),p);return box;}
    const i=lineAt(lyrics.synced,position()),cur=lyrics.synced[i],next=lyrics.synced[i+1];
    const line=el('p',undefined,'lyric-line');line.textContent=cur?.text||'♪';line.dir='auto';
    const after=el('p',undefined,'lyric-next');after.textContent=next?.text??'';after.dir='auto';
    box.append(line,after);
    if(now.source!=='upload'&&!inApp)box.append(el('p',()=>t('music.listeningTimer'),'lyric-note'));
    return box;
  }
  // the lyric card is swapped only when its words change (not every 0.4 s)
  function paintLyric(){const slot=sheet?.body.querySelector('.lyric-slot');if(slot){const c=lyricCard(),key=c.textContent+'|'+c.childElementCount;if(slot.dataset.key!==key){slot.dataset.key=key;slot.replaceChildren(c);}}paintSeek();paintControls();onNowPlaying?.();}
  // the song's timeline: drag to go back or forward (your uploads, Spotify in the app, and the timer that follows Spotify outside)
  const length=()=>{if(!now)return 0;if(now.source==='upload')return isFinite(player.duration)?player.duration:0;if(inApp)return (spotify.duration()||now.duration_ms||0)/1000;return (listen?.length??now.duration_ms??0)/1000;};
  const clock=s=>{s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
  let dragging=false;
  function seekTo(sec){if(!now)return;
    if(now.source==='upload'){player.currentTime=sec;}
    else if(inApp){spotify.seek(sec*1000);together.share({item:now,playing:spotify.playing(),position:sec});}
    else if(listen){listen.started=Date.now()-sec*1000;together.share({item:now,playing:true,position:sec});}
    paintLyric();}
  function seekBar(){
    const box=el('div',undefined,'seek');const range=document.createElement('input');range.type='range';range.min='0';range.step='any';range.className='seek-range';copy(range,()=>t('music.seek'),'aria-label');
    const a=el('span',undefined,'seek-time'),b=el('span',undefined,'seek-time');
    range.addEventListener('input',()=>{dragging=true;a.textContent=clock(+range.value);});
    range.addEventListener('change',()=>{dragging=false;seekTo(+range.value);});
    range.addEventListener('pointerup',()=>{if(dragging){dragging=false;seekTo(+range.value);}});
    box.append(a,range,b);return box;}
  function paintSeek(){const box=sheet?.body.querySelector('.seek');if(!box)return;const [a,range,b]=box.children,len=length();
    box.hidden=!now||!len;if(box.hidden)return;const mx=String(Math.round(len*10)/10);if(range.max!==mx)range.max=mx;b.textContent=clock(len);
    if(!dragging){const pos=Math.min(len,position());range.value=String(Math.round(pos*10)/10);a.textContent=clock(pos);range.style.setProperty('--fill',(len?pos/len*100:0).toFixed(2)+'%');}}
  // The current lyric line, for the toad card on Home.
  const currentLine=()=>{if(!isPlaying()||lyrics?.state!=='synced')return '';return lyrics.synced[lineAt(lyrics.synced,position())]?.text??'';};

  // ---- the stage
  function open(){
    if(sheet?.open){sheet.dialog.focus();return;}
    sheet=openSheet({title:h=>copy(h,()=>t('garden.musicDoor')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),size:'full',className:'music-sheet',onClose:()=>{sheet=null;}});
    ensureDedicated();paint();startTick();
  }
  function togetherCard(){
    const box=el('div',undefined,'together-slot');const p=together.partner();
    if(!p?.playing)return box;
    const card=el('section',undefined,'card together-card');
    card.append(el('p',()=>t('together.listening',{name:person(p.profile_id),title:p.item.title}),'title'));
    const inSync=following&&now?.id===p.item.id&&isPlaying();
    card.append(inSync?el('p',()=>t('together.joined'),'small'):button(()=>t('together.join'),()=>join(),'primary'));
    box.append(card);return box;
  }
  function paintTogether(){const slot=sheet?.body.querySelector('.together-slot');if(slot)slot.replaceWith(togetherCard());}
  function paint(){
    together.connect();
    if(!sheet)return;const body=sheet.body;body.replaceChildren();
    body.append(togetherCard(),spotifyCard(),nowCard());
    if(!available()){body.append(el('p',()=>t('music.needsUpdate'),'small'));return;}
    const all=lists();if(!all.some(p=>p.id===selected))selected=all[0]?.id??null;
    const chips=el('div',undefined,'chip-row');chips.setAttribute('role','tablist');copy(chips,()=>t('music.playlists'),'aria-label');
    for(const p of all){const b=button(()=>title(p),()=>{selected=p.id;paint();},'chip');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(p.id===selected));if(p.visibility==='private')b.append(icon('lock',14));chips.append(b);}
    const add=button(()=>t('music.newPlaylist'),()=>openNewPlaylist(),'chip add-chip');chips.append(add);
    body.append(chips);
    const list=all.find(p=>p.id===selected);
    if(list)body.append(playlistView(list));
  }
  // Spotify on this phone: connect once, then songs play here
  function spotifyCard(){
    const box=el('section',undefined,'card spotify-card');if(!spotify)return box;
    const err=spotify.error(),hint=err==='premium'?'spotify.needsPremium':err==='no_device'?'spotify.openApp':err==='access_denied'?'spotify.denied':err?'spotify.failed':null;
    if(!spotify.connected()){box.append(el('p',()=>t('spotify.connectTitle'),'title'),el('p',()=>t('spotify.connectHint'),'small'),button(()=>t('spotify.connect'),()=>spotify.connect(),'primary'));
      if(hint)box.append(el('p',()=>t(hint),'small warn'));return box;}
    const row=el('div',undefined,'row between');row.append(el('p',()=>t('spotify.connectedAs',{name:spotify.name()??'Spotify'}),'small'),button(()=>t('spotify.disconnect'),()=>{spotify.disconnect();paint();},'link'));box.append(row);
    if(spotify.premium()===false)box.append(el('p',()=>t('spotify.needsPremium'),'small warn'));else if(hint)box.append(el('p',()=>t(hint),'small warn'));
    return box;
  }
  function nowCard(){
    const card=el('section',undefined,'card now-card');
    if(!now){card.append(el('p',()=>t('toad.nothing'),'muted'));return card;}
    const cover=now.cover_url&&isCoverUrl(now.cover_url)?Object.assign(document.createElement('img'),{src:now.cover_url,alt:'',width:72,height:72,className:'cover',referrerPolicy:'no-referrer'}):el('span',undefined,'cover placeholder');
    if(!cover.src)cover.append(icon('music',28));
    const name=el('p',undefined,'title now-title');name.textContent=now.title;name.dir='auto';
    const by=el('p',undefined,'muted now-artist');by.textContent=now.artist??'';by.dir='auto';
    const controls=nowControls();
    const head=el('div',undefined,'now-head');head.append(cover,el('div',undefined,'now-text'));head.lastChild.append(name,by);
    const seek=seekBar();
    const slot=el('div',undefined,'lyric-slot');slot.append(lyricCard());
    card.append(head,seek,controls,slot,el('p',()=>t('music.lyricsSource'),'tiny'));
    return card;
  }
  // Spotify sends short "paused" blips while a song loads or jumps: the button follows only a state that holds 0.45 s
  let seenOn=null,seenAt=0,steadyOn=false;
  const steadyPlaying=()=>{const on=spotify.playing();if(on!==seenOn){seenOn=on;seenAt=Date.now();}if(Date.now()-seenAt>=450)steadyOn=on;return steadyOn;};
  const controlsKey=()=>[now?.id,now?.source,inApp,inApp&&steadyPlaying(),inApp&&spotify.mode(),now?.source==='upload'&&player.paused,!!listen,spotify?.connected()].join('|');
  function nowControls(){
    const controls=el('div',undefined,'row now-controls');controls.dataset.key=controlsKey();
    if(now.source==='upload')controls.append(button(()=>player.paused?t('music.play'):t('music.pause'),()=>player.paused?playUpload(now.ref):player.pause(),'primary'));
    else if(inApp){const on=steadyPlaying();controls.append(button(()=>on?t('music.pause'):t('music.play'),async()=>{on?await spotify.pause():await spotify.resume();seenOn=steadyOn=spotify.playing();paint();onNowPlaying?.();},'primary'));
      if(spotify.mode()==='device')controls.append(el('p',()=>t('spotify.onDevice',{device:spotify.deviceName()??'Spotify'}),'tiny'));}
    else{controls.append(button(()=>t(spotify?.connected()?'music.play':'music.openSpotify'),()=>play(now),'primary'));if(listen)controls.append(button(()=>t('music.stopFollowing'),()=>stopListening(),'quiet'));}
    return controls;
  }
  // only the play/pause buttons change when the song starts or stops (not the whole stage)
  function paintControls(){const c=sheet?.body.querySelector('.now-controls');if(c&&now&&c.dataset.key!==controlsKey())c.replaceWith(nowControls());}
  // Spotify tells us about every small change while a song plays: the stage is rebuilt only when the
  // account itself changes (connected, name, Premium, error, where it plays)
  let spotSig=null;
  function spotifyChanged(){
    const sig=spotify?[spotify.connected(),spotify.name(),spotify.premium(),spotify.error(),spotify.mode(),spotify.deviceName()].join('|'):'';
    if(sig!==spotSig){spotSig=sig;paint();}else paintControls();
  }
  function playlistView(list){
    const box=el('section',undefined,'playlist-view');
    const head=el('div',undefined,'row between');
    const h=el('h3',()=>title(list),'title');h.dir='auto';head.append(h);
    if(list.kind==='custom'&&list.owner_id===me()){const acts=el('div',undefined,'row');acts.append(button(()=>t('music.renamePlaylist'),()=>openNewPlaylist(list),'quiet'),button(()=>t('music.deletePlaylist'),async()=>{if(!confirm(t('music.deletePlaylistConfirm')))return;await rpc('delete_playlist',{p_id:list.id,p_expected_version:list.version},true).catch(()=>{});},'quiet danger'));head.append(acts);}
    box.append(head);
    if(list.kind==='dedicated')box.append(el('p',()=>t('music.dedicateHint'),'small'));
    else if(list.visibility==='private')box.append(el('p',()=>t('music.playlistPrivate'),'pill'));
    const songs=items(list.id),ol=el('ol',undefined,'song-list');
    if(!songs.length)box.append(el('p',()=>t('music.emptyPlaylist'),'muted'));
    songs.forEach((s,i)=>ol.append(songRow(list,s,songs[i-1],songs[i+1],songs[i-2])));
    box.append(ol,button(()=>t('music.addSong'),()=>openAdd(list),'primary add-song'));
    return box;
  }
  function songRow(list,s,prev,next,beforePrev){
    const li=el('li',undefined,'song'+(now?.id===s.id?' playing':''));
    const art=s.cover_url&&isCoverUrl(s.cover_url)?Object.assign(document.createElement('img'),{src:s.cover_url,alt:'',width:44,height:44,className:'cover',referrerPolicy:'no-referrer',loading:'lazy'}):el('span',undefined,'cover placeholder');
    if(!art.src)art.append(icon('music',18));
    const text=el('div',undefined,'song-text');
    const name=el('p',undefined,'song-title');name.textContent=s.title;name.dir='auto';
    const meta=el('p',undefined,'small');meta.textContent=s.artist??'';meta.dir='auto';
    const who=el('p',()=>t(list.kind==='dedicated'&&s.note?'music.dedicatedBy':'music.addedBy',{name:person(s.added_by)}),'tiny');who.dataset.tone=s.added_by===me()?'me':'partner';
    text.append(name,meta,who);
    if(s.note){const n=el('p',undefined,'song-note hand');n.textContent=s.note;n.dir='auto';text.append(n);}
    const acts=el('div',undefined,'song-actions');
    const playB=button(()=>'',()=>play(s),'round-button primary-round');copy(playB,()=>t(s.source==='upload'||spotify?.connected()?'music.play':'music.openSpotify'),'aria-label');playB.append(icon('playTrack',16));acts.append(playB);
    if(prev){const up=button(()=>'',()=>rpc('move_playlist_item',{p_id:s.id,p_expected_version:s.version,p_after_id:beforePrev?.id??null}).catch(()=>{}),'round-button');copy(up,()=>t('music.moveUp'),'aria-label');up.append(icon('up',16));acts.append(up);}
    if(next){const down=button(()=>'',()=>rpc('move_playlist_item',{p_id:s.id,p_expected_version:s.version,p_after_id:next.id}).catch(()=>{}),'round-button');copy(down,()=>t('music.moveDown'),'aria-label');down.append(icon('down',16));acts.append(down);}
    const mine=s.added_by===me(),canRemove=mine||(list.kind==='custom'&&list.owner_id===me());
    if(mine){const edit=button(()=>'',()=>openNote(s),'round-button');copy(edit,()=>t('music.editNote'),'aria-label');edit.append(icon('pen',16));acts.append(edit);}
    if(canRemove){const rm=button(()=>'',async()=>{if(!confirm(t('music.removeSongConfirm')))return;await rpc('remove_playlist_item',{p_id:s.id,p_expected_version:s.version},true).catch(()=>{});},'round-button');copy(rm,()=>t('music.removeSong'),'aria-label');rm.append(icon('close',16));acts.append(rm);}
    li.append(art,text,acts);
    return li;
  }

  // ---- forms
  const field=(labelKey,input)=>{const id='m-'+uid();input.id=id;const l=el('label',()=>t(labelKey));l.htmlFor=id;const w=el('div',undefined,'field');w.append(l,input);return w;};
  function openNewPlaylist(existing=null){
    const s=openSheet({title:h=>copy(h,()=>t(existing?'music.renamePlaylist':'music.newPlaylist')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'music-form'});
    const name=document.createElement('input');name.maxLength=80;name.required=true;name.value=existing?.title??'';name.dir='auto';
    const vis=document.createElement('select');for(const v of ['shared','private']){const o=el('option',()=>t(v==='shared'?'music.playlistShared':'music.playlistPrivate'));o.value=v;vis.append(o);}vis.value=existing?.visibility??'shared';
    const id=existing?.id??uid();
    const go=button(()=>t(existing?'common.save':'music.createPlaylist'),async e=>{if(!name.value.trim()){name.reportValidity();return;}e.currentTarget.disabled=true;
      try{await rpc('save_playlist',{p_id:id,p_expected_version:existing?.version??0,p_title:name.value.trim(),p_visibility:vis.value});selected=id;s.close();}catch{}finally{e.currentTarget.disabled=false;}},'primary');
    s.body.append(field('music.playlistName',name),field('form.visibility',vis),go);setTimeout(()=>name.focus(),50);
  }
  function openNote(song){
    const s=openSheet({title:h=>copy(h,()=>t('music.editNote')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'music-form'});
    const note=document.createElement('textarea');note.maxLength=500;note.rows=3;note.value=song.note??'';note.dir='auto';copy(note,()=>t('music.notePlaceholder'),'placeholder');
    const go=button(()=>t('common.save'),async e=>{e.currentTarget.disabled=true;try{await rpc('update_playlist_item',{p_id:song.id,p_expected_version:song.version,p_note:note.value});s.close();}catch{}finally{e.currentTarget.disabled=false;}},'primary');
    s.body.append(field('music.noteLabel',note),go);
  }
  function openAdd(list){
    const s=openSheet({title:h=>copy(h,()=>t('music.addSong')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'music-form'});
    const id=uid();let found=null,cover=null,seq=0;
    const link=document.createElement('input');link.type='url';link.inputMode='url';link.autocomplete='off';copy(link,()=>t('dedication.urlPlaceholder'),'placeholder');
    const status=el('p',undefined,'small');status.setAttribute('role','status');
    const name=document.createElement('input');name.maxLength=200;name.dir='auto';
    const artist=document.createElement('input');artist.maxLength=200;artist.dir='auto';
    const note=document.createElement('textarea');note.maxLength=500;note.rows=3;note.dir='auto';copy(note,()=>t('music.notePlaceholder'),'placeholder');
    link.oninput=async()=>{const n=++seq;found=parseSongLink(link.value);cover=null;
      if(!link.value.trim()){copy(status,'');return;}
      if(!found){copy(status,()=>t('dedication.invalidURL'));return;}
      if(found.kind==='link'){copy(status,'');return;}
      copy(status,()=>t('music.lookingUp'));
      try{const r=await lookupLink(found);if(n!==seq)return;if(r.title&&!name.value)name.value=r.title;if(r.artist&&!artist.value)artist.value=r.artist;cover=r.cover??null;copy(status,'');if(!artist.value)artist.focus();}
      catch{if(n===seq)copy(status,()=>t('music.lookupFailed'));}};
    const save=button(()=>t('music.saveSong'),async e=>{
      if(!found){copy(status,()=>t('dedication.invalidURL'));link.focus();return;}
      if(!name.value.trim()){name.focus();return;}
      e.currentTarget.disabled=true;
      try{await rpc('add_playlist_item',{p_id:id,p_playlist_id:list.id,p_source:found.kind==='spotify'?'spotify':'link',p_ref:found.kind==='spotify'?found.uri:found.url,
        p_title:name.value.trim(),p_artist:artist.value.trim()||null,p_cover_url:cover,p_duration_ms:duration,p_note:note.value.trim()||null});s.close();
        // a push for the partner when it went to a shared playlist (no bell row, no push otherwise)
        if(list.visibility==='shared')getClient()?.functions.invoke('dispatch-notification',{body:{event_id:id}}).catch(()=>{});}
      catch{}finally{if(e.currentTarget?.isConnected)e.currentTarget.disabled=false;}},'primary');
    let duration=null;
    if(spotify?.connected()){
      const q=document.createElement('input');q.type='search';q.autocomplete='off';q.dir='auto';copy(q,()=>t('spotify.searchPlaceholder'),'placeholder');
      const results=el('div',undefined,'spotify-results');let qn=0,qt=null;
      q.oninput=()=>{clearTimeout(qt);qt=setTimeout(async()=>{const n=++qn;if(!q.value.trim()){results.replaceChildren();return;}
        try{const found2=await spotify.search(q.value);if(n!==qn)return;results.replaceChildren();
          for(const r of found2){const b=button(()=>'',()=>{found={kind:'spotify',uri:r.uri,url:'https://open.spotify.com/track/'+r.uri.split(':').pop()};name.value=r.title;artist.value=r.artist;cover=isCoverUrl(r.cover)?r.cover:null;duration=r.duration_ms;
              for(const x of results.children)x.setAttribute('aria-pressed',String(x===b));note.focus();},'spotify-result');
            const art=r.cover&&isCoverUrl(r.cover)?Object.assign(document.createElement('img'),{src:r.cover,alt:'',width:40,height:40,referrerPolicy:'no-referrer'}):el('span',undefined,'cover placeholder');
            const w=el('span',undefined,'spotify-result-words');const ti=el('b');ti.textContent=r.title;ti.dir='auto';const ar=el('small');ar.textContent=r.artist;ar.dir='auto';w.append(ti,ar);b.append(art,w);results.append(b);}
          if(!found2.length)results.append(el('p',()=>t('spotify.noResults'),'small'));}
        catch{if(n===qn)results.replaceChildren(el('p',()=>t('spotify.failed'),'small'));}},350);};
      s.body.append(field('spotify.search',q),results);
    }
    s.body.append(field('music.linkLabel',link),el('p',()=>t('music.linkHint'),'small'),status,field('music.songTitle',name),field('music.songArtist',artist),field('music.noteLabel',note));
    if(list.kind==='dedicated')s.body.append(el('p',()=>t('music.dedicateHint'),'small'));
    s.body.append(save);
    const ups=uploads();
    if(ups.length){
      const pick=document.createElement('select');const first=el('option',()=>t('music.fromUploads'));first.value='';pick.append(first);
      for(const u of ups){const o=document.createElement('option');o.value=u.id;o.textContent=u.title||u.body||'';pick.append(o);}
      const addUp=button(()=>t('music.saveSong'),async e=>{const u=ups.find(x=>x.id===pick.value);if(!u){pick.focus();return;}e.currentTarget.disabled=true;
        try{await rpc('add_playlist_item',{p_id:uid(),p_playlist_id:list.id,p_source:'upload',p_ref:u.id,p_title:(u.title||u.body||'').trim().slice(0,200)||'♪',p_artist:null,p_cover_url:null,p_duration_ms:null,p_note:note.value.trim()||null});s.close();}
        catch{}finally{if(e.currentTarget?.isConnected)e.currentTarget.disabled=false;}},'quiet');
      const row=el('div',undefined,'upload-pick');row.append(field('music.fromUploads',pick),addUp);s.body.append(row);
    }
    setTimeout(()=>link.focus(),50);
  }

  async function addSearched(r){
    await ensureDedicated();const list=lists().find(p=>p.kind==='dedicated');if(!list)throw new Error('no playlist');
    const id=uid(),item={id,source:'spotify',ref:r.uri,title:r.title.slice(0,200),artist:r.artist?.slice(0,200)||null,cover_url:isCoverUrl(r.cover)?r.cover:null,duration_ms:r.duration_ms??null,added_by:me(),note:null,created_at:new Date().toISOString()};
    await rpc('add_playlist_item',{p_id:id,p_playlist_id:list.id,p_source:'spotify',p_ref:item.ref,p_title:item.title,p_artist:item.artist,p_cover_url:item.cover_url,p_duration_ms:item.duration_ms,p_note:null});
    if(list.visibility==='shared')getClient()?.functions.invoke('dispatch-notification',{body:{event_id:id}}).catch(()=>{});
    return item;}
  // For the toad card on Home: what your partner is listening to, if anything.
  const partnerListening=()=>{const p=together.partner();return p?.playing?{title:p.item.title}:null;};
  // every song, newest first: the one list the Us player and the Home card both play from
  const allSongs=()=>(getSnapshot()?.playlistItems??[]).filter(i=>!i.deleted_at).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  return {allSongs,playQueue,next:()=>step(1),prev:()=>step(-1),toggle,seek:sec=>seekTo(sec),addSearched,
    current:()=>({item:now,playing:isPlaying(),position:position(),duration:length(),index:qi,queueIds:queue.map(x=>x.id)}),
    spotify,open,render:paint,spotifyChanged,isPlaying,currentLine,partnerListening,nowTitle:()=>isPlaying()?now?.title??'':'',playing:()=>now,
    clear(){together.disconnect();now=null;listen=null;following=false;lyrics=null;lyricsFor='';selected=null;sheet?.close();}};
}
