// The app around the pages: Talk's two panes, Appearance (per phone), the time chip, the bell's count,
// the toad's music card and the combo card on Home, and the words found in the garden on Learn.
// Every word on screen comes from the catalog; names, song titles and notes are the people's own data.
import {icon} from './design/icons.js';
import {appearance,setAppearance,onGardenTheme,gardenLight} from './design/theme.js';
import {CULTURE} from './garden3d/culture.js';
import {loadDiscoveries} from './garden3d/discoveries.js';
import {combo} from './garden/model.js';

const TIME_ICON={day:'sun',dusk:'sunset',night:'moon'};

export function createShell({$,el,button,t,copy,navigate,getSnapshot,me,home,player}){
  // ---- Talk: notes and questions, one tab with two panes
  let pane='journal';
  function talkPane(which){
    pane=which==='questions'?'questions':'journal';
    for(const [tab,id] of [['talkNotes','journal'],['talkQuestions','questions']]){const on=id===pane;$(tab).setAttribute('aria-selected',String(on));$(tab).tabIndex=on?0:-1;$('page-'+id).hidden=!on;}
  }
  $('talkNotes').onclick=()=>talkPane('journal');$('talkQuestions').onclick=()=>talkPane('questions');
  for(const id of ['talkNotes','talkQuestions'])$(id).onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=pane==='journal'?'questions':'journal';talkPane(next);$(next==='journal'?'talkNotes':'talkQuestions').focus();};

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
    const id=me(),unread=(snap?.thoughts??[]).filter(x=>x.recipient_id===id&&!x.read_at).length;
    $('bellCount').hidden=!unread;$('bellCount').textContent=unread>9?'9+':String(unread);
    copy($('receptionToggle'),()=>unread?t('shell.bellUnread',{count:unread}):t('notifications.title'),'aria-label');
    if(!unread&&!(snap?.thoughts??[]).length&&!$('shellInboxEmpty'))$('messageInbox').before(Object.assign(el('p',()=>t('shell.inboxEmpty'),'small'),{id:'shellInboxEmpty'}));
    if((snap?.thoughts??[]).length)$('shellInboxEmpty')?.remove();
  }

  // ---- The toad's card on Home drives the music player; the toad in the garden plays along
  const playIcon=()=>$('toadPlay').replaceChildren(icon(player.paused?'playTrack':'pause',18));
  function paintToad(){
    const playing=!player.paused&&!player.ended,title=$('trackTitle')?.textContent?.trim()||'';
    copy($('toadState'),()=>t(playing?'toad.playing':'toad.resting'));
    $('toadSong').textContent=title;
    copy($('toadPlay'),()=>t(playing?'music.pause':'music.play'),'aria-label');playIcon();
    $('toadCard').classList.toggle('on',playing);
    garden3d()?.setPlaying(playing);garden3d()?.setSong(playing?title:null);
  }
  for(const ev of ['play','playing','pause','ended','emptied'])player.addEventListener(ev,paintToad);
  $('toadPrev').onclick=()=>$('musicPrev').click();$('toadPlay').onclick=()=>$('musicPlay').click();$('toadNext').onclick=()=>$('musicNext').click();
  $('toadArt').onclick=()=>openMusic();
  function openMusic(){navigate('us');const d=$('musicPanel');d.open=true;d.scrollIntoView({block:'start'});d.querySelector('summary').focus({preventScroll:true});}

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

  function tabChanged(tab){if(tab==='learn')renderLearn();if(tab==='garden')paintTime();}
  function render(snap=getSnapshot()){paintBell(snap);paintCombo(snap);paintToad();}
  function clear(){$('bellCount').hidden=true;copy($('receptionToggle'),()=>t('notifications.title'),'aria-label');copy($('comboDays'),'');copy($('comboHint'),'');$('toadSong').textContent='';$('learnList').replaceChildren();talkPane('journal');}
  talkPane('journal');paintToad();
  return {talkPane,render,clear,openMusic,tabChanged,renderLearn,paintTime};
}
