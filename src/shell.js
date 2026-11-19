// The app around the pages: Talk's two panes, Appearance (per phone), the time chip, the bell's count,
// the toad's music card and the combo card on Home, and the words found in the garden on Learn.
// Every word on screen comes from the catalog; names, song titles and notes are the people's own data.
import {icon} from './design/icons.js';
import {appearance,setAppearance,onGardenTheme,gardenLight} from './design/theme.js';
import {CULTURE} from './garden3d/culture.js';
import {loadDiscoveries} from './garden3d/discoveries.js';
import {combo} from './garden/model.js';

const TIME_ICON={day:'sun',dusk:'sunset',night:'moon'};

export function createShell({$,el,button,t,copy,navigate,getSnapshot,me,person,home,player,music,markRead,chat}){
  // ---- Talk: notes and questions, one tab with two panes
  // ---- Talk: the chat first, then notes and questions
  const PANES=[['talkChat','chat'],['talkNotes','journal'],['talkQuestions','questions']];
  let pane='chat',talkOpen=false;
  function talkPane(which){
    pane=PANES.some(([,id])=>id===which)?which:'chat';
    for(const [tab,id] of PANES){const on=id===pane;$(tab).setAttribute('aria-selected',String(on));$(tab).tabIndex=on?0:-1;$('page-'+id).hidden=!on;}
    chat?.shown(talkOpen&&pane==='chat');
  }
  for(const [tab,id] of PANES){$(tab).onclick=()=>talkPane(id);
    $(tab).onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
      const i=PANES.findIndex(([,x])=>x===pane),n=e.key==='Home'?0:e.key==='End'?PANES.length-1:(i+(e.key==='ArrowRight'?1:PANES.length-1))%PANES.length;
      talkPane(PANES[n][1]);$(PANES[n][0]).focus();};}

  // ---- Appearance: follow the time of day, or always dark (this phone only); the garden's own time
  const garden3d=()=>home.garden3d;
  const shownLight=()=>garden3d()?.light??gardenLight();
  function paintTime(){
    const L=shownLight();
    $('timeIcon').replaceChildren(icon(TIME_ICON[L],16));
    copy($('timeText'),()=>t('appearance.'+L));
    copy($('timeChip'),()=>t('appearance.open',{time:t('appearance.'+L)}),'aria-label');
    for(const b of document.querySelectorAll('.us-appearance .seg button'))b.setAttribute('aria-pressed',String(b.dataset.time===L));
    for(const b of document.querySelectorAll('.us-appearance .opt'))b.setAttribute('aria-checked',String(b.dataset.mode===appearance()));
  }
  for(const b of document.querySelectorAll('.us-appearance .opt'))b.onclick=()=>{setAppearance(b.dataset.mode);paintTime();};
  for(const b of document.querySelectorAll('.us-appearance .seg button'))b.onclick=()=>{garden3d()?.previewLight(b.dataset.time===gardenLight()?null:b.dataset.time);paintTime();};
  $('timeChip').onclick=()=>{navigate('us');const card=document.querySelector('.us-appearance');card.scrollIntoView({block:'start'});card.querySelector('.opt[aria-checked=true]')?.focus({preventScroll:true});};
  onGardenTheme(()=>paintTime());setInterval(paintTime,60000);paintTime();

  // ---- Bell: unread thoughts for me
  function paintBell(snap){
    const id=me(),songs=(snap?.notifications??[]).filter(n=>n.recipient_id===id&&['dedication','song_added'].includes(n.kind));
    const unread=(snap?.thoughts??[]).filter(x=>x.recipient_id===id&&!x.read_at).length+songs.filter(n=>!n.read_at).length;
    paintSongInbox(snap,songs);
    $('bellCount').hidden=!unread;$('bellCount').textContent=unread>9?'9+':String(unread);
    copy($('receptionToggle'),()=>unread?t('shell.bellUnread',{count:unread}):t('notifications.title'),'aria-label');
    if(!unread&&!(snap?.thoughts??[]).length&&!$('shellInboxEmpty'))$('messageInbox').before(Object.assign(el('p',()=>t('shell.inboxEmpty'),'small'),{id:'shellInboxEmpty'}));
    if((snap?.thoughts??[]).length)$('shellInboxEmpty')?.remove();
  }

  // Songs your partner dedicated or added, in the bell's panel. Tapping one opens Music.
  function paintSongInbox(snap,songs){
    let box=$('songInbox');
    if(!box){box=el('section',undefined,'song-inbox');box.id='songInbox';$('receptionPushPrompt').after(box);}
    box.replaceChildren();if(!songs.length)return;
    const head=el('div',undefined,'row between');head.append(el('h3',()=>t('inbox.songs')));
    if(songs.some(n=>!n.read_at))head.append(button(()=>t('inbox.markAllRead'),()=>markRead([]).catch(()=>{}),'link'));
    box.append(head);
    for(const n of songs.slice(0,20)){
      const item=(snap.playlistItems??[]).find(i=>i.id===n.ref_id),title=item?.title??'♪';
      const row=button(()=>t(n.kind==='dedication'?'inbox.dedication':'inbox.songAdded',{name:person(n.sender_id),title}),()=>{if(!n.read_at)markRead([n.id]).catch(()=>{});$('receptionClose').click();music.open();},'inbox-row'+(n.read_at?'':' unread'));
      row.dir='auto';box.append(row);
    }
  }

  const partnerName=()=>{const snap=getSnapshot(),id=snap?.members?.find(m=>m.profile_id!==me())?.profile_id;return id?person(id):'';};
  // ---- The toad's card on Home drives the music player; the toad in the garden plays along
  const playIcon=()=>$('toadPlay').replaceChildren(icon(player.paused?'playTrack':'pause',18));
  function paintToad(){
    const playing=music.isPlaying()||(!player.paused&&!player.ended),title=music.nowTitle()||$('trackTitle')?.textContent?.trim()||'';
    const partnerSong=!playing?music.partnerListening():null;
    if(partnerSong)copy($('toadLine'),()=>t('together.listening',{name:partnerName(),title:partnerSong.title}));else{copy($('toadLine'),'');$('toadLine').textContent=music.currentLine();}
    copy($('toadState'),()=>t(playing?'toad.playing':'toad.resting'));
    $('toadSong').textContent=title;
    copy($('toadPlay'),()=>t(playing?'music.pause':'music.play'),'aria-label');playIcon();
    $('toadCard').classList.toggle('on',playing);
    garden3d()?.setPlaying(playing);garden3d()?.setSong(playing?title:null);
  }
  for(const ev of ['play','playing','pause','ended','emptied'])player.addEventListener(ev,paintToad);
  $('toadPrev').onclick=()=>$('musicPrev').click();$('toadPlay').onclick=()=>$('musicPlay').click();$('toadNext').onclick=()=>$('musicNext').click();
  $('toadArt').onclick=()=>openMusic();
  // The stage: playlists, dedications and lyric cards (the old player stays in Us for uploads).
  function openMusic(){music.open();}

  // ---- Combo: days in a row you both did something
  function paintCombo(snap){
    const c=combo(snap);$('comboCard').hidden=(snap?.members?.length??0)<2;
    copy($('comboDays'),()=>t('home.comboDays',{count:c.days}));
    copy($('comboHint'),()=>c.days===0?t('home.comboStart'):c.today?'':t('home.comboHint'));
  }

  // ---- Learn: every word found in the garden, and the ones still hidden
  function renderLearn(){
    const seen=loadDiscoveries(),root=$('learnList');root.replaceChildren();
    copy($('learnCount'),()=>t('culture.found',{count:seen.size,total:CULTURE.length}));
    for(const c of CULTURE){
      const found=seen.has(c.id),card=el('article',undefined,'card learn-card'+(found?'':' hidden-word'));card.dataset.from=c.from;
      card.append(el('p',()=>t('culture.from.'+c.from),'culture-chip'));
      if(found){
        const word=el('p',undefined,'culture-word');word.textContent=c.word;if(c.lang)word.lang=c.lang;word.dir='ltr';
        card.append(word,el('p',()=>t(`culture.${c.id}.meaning`),'culture-meaning'),button(()=>t(`culture.${c.id}.title`),()=>home.openCulture(c.id),'link'));
      }else card.append(el('p',()=>t('learn.hidden'),'muted'),button(()=>t('learn.goFind'),()=>navigate('garden'),'link'));
      root.append(card);
    }
  }

  function tabChanged(tab){talkOpen=tab==='talk';chat?.shown(talkOpen&&pane==='chat');if(tab==='learn')renderLearn();if(tab==='garden')paintTime();}
  // the Talk tab shows how many messages wait for you
  function unread(count){const b=$('talkBadge');b.hidden=!count;b.textContent=count>9?'9+':String(count||'');copy($('nav-talk'),()=>count?t('talk.unread',{count}):t('nav.talk'),'aria-label');}
  function render(snap=getSnapshot()){paintBell(snap);paintCombo(snap);paintToad();music.render();chat?.start();}
  function clear(){$('bellCount').hidden=true;copy($('receptionToggle'),()=>t('notifications.title'),'aria-label');copy($('comboDays'),'');copy($('comboHint'),'');$('toadSong').textContent='';$('toadLine').textContent='';$('songInbox')?.replaceChildren();$('learnList').replaceChildren();chat?.clear();unread(0);talkPane('chat');}
  talkPane('chat');paintToad();
  return {talkPane,render,clear,openMusic,tabChanged,renderLearn,paintTime,paintToad,unread};
}
