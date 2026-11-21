// Profile and Us without plain text (approved PUProfile, PUPhoto, PUUs, PULook, PUMusic, PUAccount).
// Us becomes the two of you, three numbers and big tiles; each tile opens its own full-screen page. The original
// fields, selects and buttons stay in the page (hidden), so every save, upload and sign-out works exactly as before:
// these pages only drive them. Profile and language changes save by themselves.
import {icon} from '../design/icons.js';
import {openSheet} from '../design/sheet.js';

const NS='http://www.w3.org/2000/svg';
function svg(w,h,shapes,label){const s=document.createElementNS(NS,'svg');s.setAttribute('width',w);s.setAttribute('height',h);s.setAttribute('viewBox',`0 0 ${w} ${h}`);
  if(label){s.setAttribute('role','img');s.setAttribute('aria-label',label);}else s.setAttribute('aria-hidden','true');
  for(const [tag,attrs] of shapes){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);s.append(n);}return s;}

// the six little animals (drawn, not emoji)
const ANIMAL={
  calm:[['ellipse',{cx:22,cy:26,rx:16,ry:11,fill:'#5FA77A'}],['path',{d:'M10 26q12-18 24 0',fill:'#7FC79A'}],['circle',{cx:36,cy:22,r:5,fill:'#8FD7A8'}],['circle',{cx:38,cy:21,r:1.2,fill:'#1C1418'}]],
  hopeful:[['path',{d:'M22 22C14 8 4 12 8 22c-4 8 6 12 14 4z',fill:'#FFB25A'}],['path',{d:'M22 22C30 8 40 12 36 22c4 8-6 12-14 4z',fill:'#FF9EC2'}],['rect',{x:21,y:14,width:2.4,height:18,rx:1.2,fill:'#3A1F18'}]],
  nostalgic:[['ellipse',{cx:24,cy:24,rx:15,ry:12,fill:'#A9BCFF'}],['ellipse',{cx:13,cy:20,rx:7,ry:9,fill:'#C3D0FF'}],['path',{d:'M10 26q-4 8 2 10',stroke:'#A9BCFF','stroke-width':4,fill:'none','stroke-linecap':'round'}],['circle',{cx:20,cy:20,r:1.4,fill:'#1C1418'}]],
  hug:[['circle',{cx:22,cy:24,r:14,fill:'#C98A5A'}],['circle',{cx:11,cy:12,r:5,fill:'#C98A5A'}],['circle',{cx:33,cy:12,r:5,fill:'#C98A5A'}],['ellipse',{cx:22,cy:28,rx:6,ry:4.5,fill:'#F2C9A0'}],['circle',{cx:17,cy:21,r:1.4,fill:'#1C1418'}],['circle',{cx:27,cy:21,r:1.4,fill:'#1C1418'}]],
  difficult:[['path',{d:'M6 30q2-18 20-18 12 0 14 18z',fill:'#8A6A5A'}],['path',{d:'M8 30q1-12 12-15M14 30q1-10 10-14M20 30q2-9 10-12',stroke:'#5A4034','stroke-width':2,fill:'none'}],['ellipse',{cx:34,cy:28,rx:6,ry:4,fill:'#E8C4A4'}],['circle',{cx:36,cy:26,r:1.2,fill:'#1C1418'}]],
  none:[['circle',{cx:22,cy:22,r:14,fill:'none',stroke:'rgba(255,226,198,.45)','stroke-width':2,'stroke-dasharray':'4 4'}],['path',{d:'M17 22h10',stroke:'rgba(255,226,198,.6)','stroke-width':2.4,'stroke-linecap':'round'}]],
};
// flags for the language buttons
const FLAG={
  en:[['rect',{width:34,height:22,rx:3,fill:'#1F3A8A'}],['path',{d:'M0 0l34 22M34 0L0 22',stroke:'#fff','stroke-width':4}],['path',{d:'M0 0l34 22M34 0L0 22',stroke:'#C8102E','stroke-width':1.6}],['path',{d:'M17 0v22M0 11h34',stroke:'#fff','stroke-width':6}],['path',{d:'M17 0v22M0 11h34',stroke:'#C8102E','stroke-width':3.4}]],
  es:[['rect',{width:34,height:7.34,fill:'#FFCC00'}],['rect',{y:7.33,width:34,height:7.34,fill:'#00247D'}],['rect',{y:14.66,width:34,height:7.34,fill:'#CF142B'}],['path',{d:'M11.74 12.63L11.95 13.20L12.55 13.22L12.08 13.60L12.24 14.17L11.74 13.84L11.24 14.17L11.40 13.60L10.93 13.22L11.53 13.20ZM12.71 10.95L12.92 11.51L13.52 11.54L13.05 11.91L13.21 12.49L12.71 12.16L12.21 12.49L12.37 11.91L11.90 11.54L12.50 11.51ZM14.20 9.70L14.41 10.26L15.01 10.29L14.54 10.66L14.70 11.24L14.20 10.91L13.70 11.24L13.86 10.66L13.39 10.29L13.99 10.26ZM16.03 9.04L16.24 9.60L16.84 9.62L16.37 10.00L16.53 10.57L16.03 10.24L15.53 10.57L15.69 10.00L15.22 9.62L15.82 9.60ZM17.97 9.04L18.18 9.60L18.78 9.62L18.31 10.00L18.47 10.57L17.97 10.24L17.47 10.57L17.63 10.00L17.16 9.62L17.76 9.60ZM19.80 9.70L20.01 10.26L20.61 10.29L20.14 10.66L20.30 11.24L19.80 10.91L19.30 11.24L19.46 10.66L18.99 10.29L19.59 10.26ZM21.29 10.95L21.50 11.51L22.10 11.54L21.63 11.91L21.79 12.49L21.29 12.16L20.79 12.49L20.95 11.91L20.48 11.54L21.08 11.51ZM22.26 12.63L22.47 13.20L23.07 13.22L22.60 13.60L22.76 14.17L22.26 13.84L21.76 14.17L21.92 13.60L21.45 13.22L22.05 13.20Z',fill:'#fff'}]],
  fr:[['rect',{width:34,height:22,fill:'#fff'}],['rect',{width:11.3,height:22,fill:'#1F3A8A'}],['rect',{x:22.7,width:11.3,height:22,fill:'#E1243A'}]],
  it:[['rect',{width:34,height:22,fill:'#fff'}],['rect',{width:11.3,height:22,fill:'#009246'}],['rect',{x:22.7,width:11.3,height:22,fill:'#CE2B37'}]],
  aeb:[['rect',{width:34,height:22,fill:'#E70013'}],['circle',{cx:17,cy:11,r:6.4,fill:'#fff'}],['circle',{cx:18.4,cy:11,r:4.2,fill:'#E70013'}],['circle',{cx:19.6,cy:11,r:3.4,fill:'#fff'}]],
};
// the three looks, as small skies
const SKY={
  auto:[['rect',{width:96,height:112,rx:12,fill:'#F08A5A'}],['rect',{width:32,height:112,rx:12,fill:'#8FC8FF'}],['rect',{x:64,width:32,height:112,rx:12,fill:'#0B0E2A'}],['circle',{cx:18,cy:30,r:8,fill:'#FFF4C8'}],['circle',{cx:78,cy:30,r:7,fill:'#F4F0FF'}],['circle',{cx:82,cy:27,r:6,fill:'#0B0E2A'}],['path',{d:'M0 84q48-24 96 0v28H0z',fill:'#2E5A3A'}]],
  dark:[['rect',{width:96,height:112,rx:12,fill:'#141838'}],['circle',{cx:70,cy:28,r:10,fill:'#F4F0FF'}],['circle',{cx:75,cy:25,r:9,fill:'#141838'}],['circle',{cx:20,cy:20,r:1.4,fill:'#fff'}],['circle',{cx:40,cy:40,r:1,fill:'#fff'}],['path',{d:'M0 84q48-24 96 0v28H0z',fill:'#1A2E22'}]],
  light:[['rect',{width:96,height:112,rx:12,fill:'#BFE0FF'}],['circle',{cx:48,cy:34,r:12,fill:'#FFF4C8'}],['circle',{cx:48,cy:34,r:17,fill:'none',stroke:'#FFE08A','stroke-width':2,'stroke-dasharray':'3 4'}],['path',{d:'M0 84q48-24 96 0v28H0z',fill:'#5FA77A'}]],
};

export function createUsRedo({$,el,button,t,copy,getSnapshot,me,person,photoOf,partner,partnerOnline=()=>false,music,notify,tidyPhotos=async()=>{}}){
  const page=$('page-us');if(!page)return {render(){},clear(){}};
  // pets shown or hidden: remembered on this phone
  const PETS='pets.hidden';const petsOn=()=>{try{return localStorage.getItem(PETS)!=='1';}catch{return true;}};
  const setPets=on=>{try{localStorage.setItem(PETS,on?'0':'1');}catch{}document.documentElement.classList.toggle('pets-hidden',!on);};
  document.documentElement.classList.toggle('pets-hidden',!petsOn());
  let view=null,homes=[];
  const hide=n=>n?.classList.add('pu-gone');

  // ---- a full-screen page with a back arrow (original nodes moved in come back home when it closes)
  function openView(titleKey,cls){
    closeView();
    const root=el('div',undefined,'pu-view '+cls);root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');copy(root,()=>t(titleKey),'aria-label');
    const top=el('div',undefined,'pu-top');const back=button(()=>'',()=>closeView(),'pu-round');back.append(icon('back',18));copy(back,()=>t('common.close'),'aria-label');
    const right=el('span',undefined,'pu-top-right');top.append(back,el('b',()=>t(titleKey)),right);
    const body=el('div',undefined,'pu-body');root.append(top,body);document.body.append(root);document.documentElement.classList.add('pu-open');back.focus({preventScroll:true});
    view={root,body,right,cleanup:[]};return view;
  }
  function closeView(){if(!view)return;for(const fn of view.cleanup)try{fn();}catch{}for(const [n,c] of homes)if(c.parentNode)c.replaceWith(n);homes=[];view.root.remove();view=null;document.documentElement.classList.remove('pu-open');}
  const borrow=(node,into)=>{if(!node)return;const c=document.createComment('pu');node.replaceWith(c);homes.push([node,c]);into.append(node);};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&view)closeView();});
  // the partner opens or leaves the app: the "is here" line follows right away
  document.addEventListener('partner-presence',()=>page.querySelector('.pu-here')?.toggleAttribute('hidden',!partnerOnline()));
  const saved=(key='pu.saved')=>{const s=el('span',()=>t(key),'pu-saved');s.prepend(icon('check',14));return s;};
  const row=(ic,tone,titleKey,sub,onClick,end)=>{const b=onClick?button(()=>'',onClick,'pu-row'):el('div',undefined,'pu-row');const d=el('span',undefined,'pu-dot '+tone);d.append(icon(ic,20));
    const w=el('span',undefined,'pu-row-words');w.append(el('b',typeof titleKey==='function'?titleKey:()=>t(titleKey)),el('small',sub));b.append(d,w);if(end)b.append(end);return b;};

  // ---- Us: tiles instead of the long page
  function renderUs(){
    for(const n of [$('openShop'),page.querySelector('.us-guide'),page.querySelector('.us-appearance'),page.querySelector('.us-account'),$('musicPanel'),$('recoveryPanel'),$('backupPanel'),page.querySelector(':scope > footer')])hide(n);
    page.querySelector('.section-head .eyebrow')?.classList.add('pu-gone');
    // the partner's presence in the hero (only when the chat knows it)
    const words=page.querySelector('.us-hero-words');if(words&&!words.querySelector('.pu-here')){words.append(el('span',()=>t('pu.here',{name:person(partner())}),'pu-here'));}
    words?.querySelector('.pu-here')?.toggleAttribute('hidden',!partnerOnline());
    if(page.querySelector('.pu-tiles'))return;
    const tiles=el('div',undefined,'pu-tiles');
    const tile=(cls,ic,titleKey,sub,fn)=>{const b=button(()=>'',fn,'pu-tile '+cls);const art=el('span',undefined,'pu-tile-art');art.append(ic);b.append(art,el('b',()=>t(titleKey)),el('small',sub,'pu-tile-sub'));return b;};
    tiles.append(
      tile('shop',icon('shop',28),'shop.title',()=>t('pu.shopSub'),()=>$('openShop').click()),
      tile('bell',icon('bell',28),'pu.notifications',()=>notifState(),()=>page.querySelector('.us-guide')?.click()),
      tile('look',(()=>{const s=el('span',undefined,'pu-skies');for(const k of ['light','auto','dark']){const i=el('i');i.dataset.k=k;s.append(i);}return s;})(),'pu.look',()=>t('pu.lookSub',{language:langName()}),()=>openLook()),
      tile('music',(()=>{const s=el('span',undefined,'pu-disc');return s;})(),'pu.music',()=>musicSub(),()=>openMusic()));
    const acct=row('lock','blue','pu.account',()=>t('pu.accountSub'),()=>openAccount(),icon('chevron',18));acct.classList.add('pu-account-row');
    const anchor=page.querySelector('.us-hero-wrap')??page.querySelector('.section-head');anchor.after(tiles);tiles.after(acct);
  }
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const allowed=()=>typeof Notification!=='undefined'&&Notification.permission==='granted';
  const notifState=()=>allowed()?t('pu.notifOn'):standalone()?t('pu.notifOneStep'):t('pu.notifSteps');
  const langName=()=>$('languageSelect')?.selectedOptions?.[0]?.textContent??'';
  const songs=()=>(getSnapshot()?.playlistItems??[]).filter(i=>!i.deleted_at).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const musicSub=()=>{const n=songs().length;return n?t('pu.musicSub',{count:n}):t('pu.musicEmpty');};

  // ---- Look and language
  function openLook(){
    const v=openView('pu.look','pu-look');const card=page.querySelector('.us-appearance');
    v.body.append(el('h3',()=>t('pu.howLooks'),'pu-h'));
    const looks=el('div',undefined,'pu-looks');looks.setAttribute('role','radiogroup');copy(looks,()=>t('pu.howLooks'),'aria-label');
    for(const [mode,key] of [['auto','appearance.follow'],['dark','appearance.dark'],['light','appearance.light']]){
      const b=button(()=>'',()=>{card?.querySelector(`.opt[data-mode="${mode}"]`)?.click();paint();},'pu-look-card');b.setAttribute('role','radio');b.dataset.mode=mode;b.append(svg(96,112,SKY[mode]),el('span',()=>t(key)));looks.append(b);}
    v.body.append(looks,el('h3',()=>t('pu.skyNow'),'pu-h'));
    const sky=el('div',undefined,'pu-sky');sky.setAttribute('role','radiogroup');copy(sky,()=>t('pu.skyNow'),'aria-label');
    for(const [time,ic,key] of [['day','sun','appearance.day'],['dusk','sunset','appearance.dusk'],['night','moon','appearance.night']]){
      const b=button(()=>'',()=>{card?.querySelector(`.seg button[data-time="${time}"]`)?.click();paint();},'pu-sky-stop');b.setAttribute('role','radio');b.dataset.time=time;b.append(icon(ic,24));copy(b,()=>t(key),'aria-label');sky.append(b);}
    v.body.append(sky,el('p',()=>t('pu.skyHint'),'pu-hint'),el('h3',()=>t('language.title'),'pu-h'));
    const langs=el('div',undefined,'pu-langs');langs.setAttribute('role','radiogroup');copy(langs,()=>t('language.title'),'aria-label');const sel=$('languageSelect');
    for(const o of sel?.options??[]){const code=o.value.slice(0,2)==='ae'?'aeb':o.value.slice(0,2);
      const b=button(()=>'',()=>{if(sel.value===o.value)return;sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));autoSavePrefs();paint();},'pu-lang');b.setAttribute('role','radio');b.dataset.value=o.value;
      b.append(svg(34,22,FLAG[code]??FLAG.en),el('span',undefined));b.lastChild.textContent=o.textContent;b.lastChild.lang=o.lang;b.lastChild.dir=o.dir;langs.append(b);}
    const note=el('div',undefined,'pu-note');const nd=el('span',undefined,'pu-dot amber');nd.append(icon('pen',18));note.append(nd,el('span',()=>t('pu.derjaNote')));
    // the pets (Emmy and friends): shown or hidden on this phone
    const pets=button(()=>'',()=>{setPets(!petsOn());paintPets();},'pu-row pu-switch');pets.setAttribute('role','switch');
    const pd=el('span',undefined,'pu-dot rose');pd.append(icon('heart',20));const pw=el('span',undefined,'pu-row-words');pw.append(el('b',()=>t('pu.pets')),el('small',()=>t('pu.petsSub')));
    const knob=el('span',undefined,'pu-knob');pets.append(pd,pw,knob);
    const paintPets=()=>pets.setAttribute('aria-checked',String(petsOn()));paintPets();
    v.body.append(langs,note,pets,saved('pu.savesItself'));
    function paint(){const on=card?.querySelector('.opt[aria-checked="true"]')?.dataset.mode;for(const b of looks.children)b.setAttribute('aria-checked',String(b.dataset.mode===on));
      const now=card?.querySelector('.seg button[aria-pressed="true"]')?.dataset.time;for(const b of sky.children)b.setAttribute('aria-checked',String(b.dataset.time===now));
      for(const b of langs.children)b.setAttribute('aria-checked',String(b.dataset.value===sel?.value));}
    paint();
  }
  let prefTimer=null;
  function autoSavePrefs(){clearTimeout(prefTimer);prefTimer=setTimeout(()=>{const b=$('preferencesSave');if(b&&!b.disabled)b.click();},400);}

  // ---- Music: a real player. Search a song and it plays; tap any song and the list plays on by itself.
  function openMusic(){
    const v=openView('pu.music','pu-music');const sp=music?.spotify;sp?.warm?.();
    const info=button(()=>'',()=>credits(),'pu-round');info.append(icon('info',18));copy(info,()=>t('music.credits'),'aria-label');v.right.append(info);
    // search (Spotify) at the top
    const find=el('div',undefined,'pu-find');const results=el('div',undefined,'pu-results');
    if(sp?.connected()){const q=document.createElement('input');q.type='search';q.className='pu-search';q.autocomplete='off';q.dir='auto';copy(q,()=>t('pu.searchSong'),'placeholder');copy(q,()=>t('pu.searchSong'),'aria-label');
      const ic=el('span',undefined,'pu-search-icon');ic.append(icon('search',18));find.append(ic,q);let n=0,timer=null;
      q.oninput=()=>{clearTimeout(timer);timer=setTimeout(async()=>{const k=++n;if(!q.value.trim()){results.replaceChildren();return;}
        results.replaceChildren(el('p',()=>t('editor.loading'),'pu-hint'));
        try{const found=await sp.search(q.value);if(k!==n)return;results.replaceChildren();
          for(const r of found){const b=button(()=>'',async()=>{b.disabled=true;results.replaceChildren();q.value='';
              const have=songs().find(x=>x.ref===r.uri);if(have){const all=songs();music.playQueue(all,all.indexOf(have));paintList();return;}
              try{const item=await music.addSearched(r);music.playQueue([item,...songs().filter(s=>s.id!==item.id)],0);notify(()=>t('pu.added',{title:item.title}));}
              catch{notify(()=>t('spotify.failed'));}paintList();},'pu-result');
            const art=el('span',undefined,'pu-song-art');if(r.cover){const im=new Image();im.src=r.cover;im.alt='';im.referrerPolicy='no-referrer';art.append(im);}
            const w=el('span',undefined,'pu-song-words');const ti=el('b');ti.textContent=r.title;ti.dir='auto';const ar=el('span',undefined,'pu-result-artist');ar.textContent=r.artist;ar.dir='auto';w.append(ti,ar);
            const plus=el('span',undefined,'pu-result-add');plus.append(icon('plus',18));b.append(art,w,plus);results.append(b);}
          if(!found.length)results.append(el('p',()=>t('spotify.noResults'),'pu-hint'));}
        catch{if(k===n)results.replaceChildren(el('p',()=>t('spotify.failed'),'pu-hint'));}},300);};}
    else if(sp){const c=button(()=>t('pu.connectToSearch'),()=>sp.connect(),'pu-btn ghost');c.prepend(icon('search',18));find.append(c);}
    // the record and the controls
    const disc=el('div',undefined,'pu-record');const label=el('span',undefined,'pu-record-label');disc.append(label);
    const title=el('b',undefined,'pu-track');const artist=el('span',undefined,'pu-track-artist');
    const bar=document.createElement('input');bar.type='range';bar.min='0';bar.step='any';bar.value='0';bar.className='pu-progress seek-range';copy(bar,()=>t('music.seek'),'aria-label');let drag=false;
    const times=el('div',undefined,'pu-times');const a=el('span'),b=el('span');times.append(a,b);
    bar.addEventListener('input',()=>{drag=true;a.textContent=fmt(+bar.value);});bar.addEventListener('change',()=>{drag=false;music.seek(+bar.value);});
    const ctr=el('div',undefined,'pu-controls');
    const prev=button(()=>'',()=>{music.prev();paint(true);},'pu-ctrl');prev.append(icon('prev',24));copy(prev,()=>t('music.previous'),'aria-label');
    const play=button(()=>'',async()=>{const cur=music.current();if(!cur.item){const list=songs();if(list.length)music.playQueue(list,0);}else await music.toggle();paint(true);},'pu-ctrl big');
    const next=button(()=>'',()=>{music.next();paint(true);},'pu-ctrl');next.append(icon('next',24));copy(next,()=>t('music.next'),'aria-label');ctr.append(prev,play,next);
    const list=el('div',undefined,'pu-songs');
    // the song rows are built once per song list; the playing one is only marked (no rebuilding, no flicker)
    let listKey=null;
    function paintList(){const all=songs(),cur=music.current(),key=all.map(s=>s.id).join(',');
      if(key!==listKey){listKey=key;list.replaceChildren();
      for(const [i,s] of all.entries()){const r=button(()=>'',()=>{music.playQueue(songs(),i);paint(true);},'pu-song');r.dataset.id=s.id;const art=el('span',undefined,'pu-song-art');
        if(s.cover_url){const im=new Image();im.src=s.cover_url;im.alt='';im.referrerPolicy='no-referrer';art.append(im);}
        const eq=el('span',undefined,'pu-eq');for(let k=0;k<3;k++)eq.append(el('i'));eq.hidden=true;art.append(eq);
        const w=el('span',undefined,'pu-song-words');const ti=el('b');ti.textContent=s.title;ti.dir='auto';const note=el('span',undefined,'pu-song-note');note.textContent=(s.note?'“'+s.note+'” · ':'')+person(s.added_by);note.dir='auto';w.append(ti,note);r.append(art,w);list.append(r);}
      if(!all.length)list.append(el('p',()=>t('pu.musicEmpty'),'pu-hint'));}
      for(const r of list.querySelectorAll('.pu-song')){const on=cur.item?.id===r.dataset.id;r.classList.toggle('on',on);const eq=r.querySelector('.pu-eq');if(eq)eq.hidden=!(on&&shownOn);}}
    const acts=el('div',undefined,'pu-actions two');
    const up=button(()=>t('pu.fromPhone'),()=>$('musicFiles').click(),'pu-btn ghost');up.prepend(icon('upload',18));
    const more=button(()=>t('pu.allPlaylists'),()=>{closeView();music?.open();},'pu-btn ghost');more.prepend(icon('music',18));acts.append(up,more);
    v.body.append(find,results,disc,title,artist,bar,times,ctr,el('h3',()=>t('pu.songsForEach'),'pu-h'),list,acts);
    const fmt=s=>!isFinite(s)?'0:00':Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
    // "playing" only changes on screen once it has held for half a second (Spotify sends short paused blips while
    // a song loads or jumps), or straight away after your own tap
    let shownId,shownOn=false,seenOn=null,seenAt=0,iconOn=null;
    function paint(now=false){const cur=music.current(),it=cur.item;
      if(cur.playing!==seenOn){seenOn=cur.playing;seenAt=Date.now();}
      if(now===true||Date.now()-seenAt>=450||(it?.id??null)!==shownId)shownOn=!!seenOn;
      disc.classList.toggle('spin',shownOn);
      if(iconOn!==shownOn){iconOn=shownOn;play.replaceChildren(icon(shownOn?'pause':'playTrack',28));copy(play,()=>t(shownOn?'music.pause':'music.play'),'aria-label');}
      const ti=it?.title??(songs()[0]?.title||'');if(title.textContent!==ti){title.textContent=ti;title.dir='auto';}const ar=it?.artist??'';if(artist.textContent!==ar){artist.textContent=ar;artist.dir='auto';}
      if((it?.cover_url??'')!==label.dataset.cover){label.dataset.cover=it?.cover_url??'';label.replaceChildren();if(it?.cover_url){const im=new Image();im.src=it.cover_url;im.alt='';im.referrerPolicy='no-referrer';label.append(im);}}
      const d=cur.duration||0,c=Math.min(d||Infinity,cur.position||0);const mx=String(d?Math.round(d*10)/10:1);if(bar.max!==mx)bar.max=mx;bar.disabled=!d;const bt=fmt(d);if(b.textContent!==bt)b.textContent=bt;
      if(!drag){bar.value=String(Math.round(c*10)/10);const at=fmt(c);if(a.textContent!==at)a.textContent=at;bar.style.setProperty('--fill',(d?c/d*100:0).toFixed(2)+'%');}
      prev.disabled=!it||cur.index<=0;next.disabled=!it||cur.index<0||cur.index>=cur.queueIds.length-1;
      shownId=it?.id??null;paintList();}
    paintList();paint();const timer=setInterval(paint,250);v.cleanup.push(()=>clearInterval(timer));
  }
  function credits(){const s=openSheet({title:h=>copy(h,()=>t('music.credits')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'pu-credits'});
    const d=$('musicPanel')?.querySelector('details');if(d)for(const p of d.querySelectorAll('p'))s.body.append(p.cloneNode(true));}

  // ---- Account and privacy, in plain words
  function openAccount(){
    const v=openView('pu.account','pu-account');
    const shield=el('div',undefined,'pu-shield');const art=el('span',undefined,'pu-shield-art');art.append(icon('lock',30));const w=el('span');w.append(el('b',()=>t('pu.onlyTwo')),el('small',()=>t('pu.onlyTwoSub')));shield.append(art,w);
    const rows=el('div',undefined,'pu-rows');
    const pw=$('accountPassword');if(pw&&!pw.hidden)rows.append(row('key','gold','pu.secretWord',()=>t('pu.secretWordSub'),()=>{closeView();pw.click();},el('span',()=>t('pu.change'),'pu-row-end')));
    const status=el('small',undefined,'pu-row-status');
    const copyRow=row('box','mint','pu.keepCopy',()=>t('pu.keepCopySub'),()=>{$('exportData').click();watchStatus();},icon('download',20));copyRow.append(status);rows.append(copyRow);
    function watchStatus(){const s=$('backupStatus');const o=new MutationObserver(()=>{status.textContent=s.textContent;});o.observe(s,{childList:true,characterData:true,subtree:true});v.cleanup.push(()=>o.disconnect());}
    const pending=$('pendingMedia')?.querySelectorAll('.entry,article,li').length??0;
    rows.append(row('cloud','blue','pu.uploads',()=>pending?t('pu.uploadsWaiting',{count:pending}):t('pu.uploadsDone'),pending?()=>{const s=openSheet({title:h=>copy(h,()=>t('pu.uploads')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label')});borrow($('pendingMedia'),s.body);}:null));
    rows.append(row('phone','rose','pu.thisPhone',()=>t('pu.thisPhoneSub',{state:allowed()?t('pu.notifOnShort'):t('pu.notifOffShort')}),null));
    const paper=el('div',undefined,'pu-paper');paper.append(el('b',()=>t('pu.goodToKnow')));for(const k of ['pu.know1','pu.know2','pu.know3'])paper.append(el('span',()=>t(k)));
    const out=button(()=>t('pu.signOut'),()=>{closeView();$('logout').click();},'pu-btn danger');out.prepend(icon('back',18));
    v.body.append(shield,rows,paper,out);
  }

  // ---- your profile: photo, name, a line about you, your animal; saves by itself
  function openProfile(){
    const v=openView('pu.you','pu-profile');const nameIn=$('ownDisplayName'),bioIn=$('ownBio'),animalIn=$('ownAnimal'),form=$('profileForm');
    const badge=el('span',undefined,'pu-saved');v.right.append(badge);
    const ring=el('div',undefined,'pu-ring');const face=el('span',undefined,'pu-ring-face');const cam=button(()=>'',()=>openPhoto(),'pu-cam');cam.append(icon('camera',20));copy(cam,()=>t('us.changePhoto'),'aria-label');ring.append(face,cam);
    const name=document.createElement('input');name.className='pu-name';name.maxLength=80;name.dir='auto';name.value=nameIn?.value??'';copy(name,()=>t('profile.displayName'),'aria-label');
    const sees=el('p',()=>t('pu.seesThis',{name:person(partner())}),'pu-hint');
    const paper=el('label',undefined,'pu-paper pu-bio');paper.append(el('b',()=>t('pu.aboutYou')));const bio=document.createElement('textarea');bio.rows=2;bio.maxLength=280;bio.dir='auto';bio.value=bioIn?.value??'';const count=el('small',undefined,'pu-count');paper.append(bio,count);
    const animals=el('div',undefined,'pu-animals');animals.setAttribute('role','radiogroup');copy(animals,()=>t('pu.animal'),'aria-label');
    for(const o of animalIn?.options??[]){const b=button(()=>'',()=>{animalIn.value=o.value;changed();paintAnimals();},'pu-animal'+(o.value==='none'?' none':''));b.setAttribute('role','radio');b.dataset.value=o.value;b.append(svg(44,44,ANIMAL[o.value]??ANIMAL.none),el('span',()=>t('pu.animal.'+o.value)));animals.append(b);}
    const note=el('div',undefined,'pu-note');const nd=el('span',undefined,'pu-dot rose');nd.append(icon('heart',18));note.append(nd,el('span',()=>t('pu.animalNote')));
    v.body.append(ring,name,sees,paper,el('h3',()=>t('pu.animal'),'pu-h'),animals,note);
    let timer=null;
    function changed(){if(nameIn)nameIn.value=name.value;if(bioIn)bioIn.value=bio.value;form?.dispatchEvent(new Event('input',{bubbles:true}));count.textContent=bio.value.length+' / 280';
      clearTimeout(timer);timer=setTimeout(()=>{if(name.value.trim()&&!$('profileSave')?.disabled)form?.requestSubmit();},900);paintBadge();}
    name.addEventListener('input',changed);bio.addEventListener('input',changed);count.textContent=bio.value.length+' / 280';
    function paintAnimals(){for(const b of animals.children)b.setAttribute('aria-checked',String(b.dataset.value===animalIn?.value));}
    function paintFace(){const src=photoOf(me());if(src){if(face.querySelector('img')?.getAttribute('src')!==src){const i=new Image();i.src=src;i.alt='';face.replaceChildren(i);}}else face.textContent=(name.value||person(me())||'?').trim().charAt(0).toUpperCase();}
    function paintBadge(){const st=$('profileSaveStatus')?.textContent??'',fix=$('profileReconcile');
      if(fix&&!fix.hidden){badge.replaceChildren(el('span',()=>t('pu.tapToFix')));badge.className='pu-saved warn';badge.onclick=()=>fix.click();return;}
      badge.onclick=null;const busy=st===t('b1.saving')||timer&&!$('profileSave')?.disabled;badge.className='pu-saved'+(busy?' busy':'');badge.replaceChildren(icon(busy?'retry':'check',14),el('span',()=>t(busy?'pu.saving':'pu.saved')));}
    const watch=new MutationObserver(()=>{paintBadge();});const st=$('profileSaveStatus');if(st)watch.observe(st,{childList:true,characterData:true,subtree:true});
    v.cleanup.push(()=>{watch.disconnect();clearTimeout(timer);if(name.value.trim()&&!$('profileSave')?.disabled)form?.requestSubmit();});
    v.repaint=()=>{paintFace();paintAnimals();if(document.activeElement!==name&&nameIn&&name.value!==nameIn.value)name.value=nameIn.value;if(document.activeElement!==bio&&bioIn&&bio.value!==bioIn.value){bio.value=bioIn.value;count.textContent=bio.value.length+' / 280';}paintBadge();};
    v.repaint();
  }

  // ---- your photo: frame it in the circle, then it goes through the usual private upload
  function openPhoto(){
    const v=openView('pu.photo','pu-photo');
    const stage=el('div',undefined,'pu-frame');const img=new Image();img.alt='';img.className='pu-frame-img';const ring=el('span',undefined,'pu-frame-ring');const tip=el('span',()=>t('pu.frameTip'),'pu-frame-tip');tip.prepend(icon('expand',14));
    const cur=photoOf(me());if(cur)img.src=cur;stage.append(img,ring,tip);
    let file=null,x=0,y=0,k=1,drag=null,pts=new Map(),pinch=null;
    const pickG=document.createElement('input');pickG.type='file';pickG.accept='image/*';pickG.hidden=true;
    const pickC=document.createElement('input');pickC.type='file';pickC.accept='image/*';pickC.setAttribute('capture','user');pickC.hidden=true;
    const take=inp=>()=>{const f=inp.files?.[0];inp.value='';if(!f)return;file=f;x=y=0;k=1;const u=URL.createObjectURL(f);img.onload=()=>{place();};img.src=u;v.cleanup.push(()=>URL.revokeObjectURL(u));use.disabled=false;tip.hidden=false;};
    pickG.onchange=take(pickG);pickC.onchange=take(pickC);
    function place(){img.style.transform=`translate(${x}px,${y}px) scale(${k})`;}
    stage.addEventListener('pointerdown',e=>{if(!file)return;stage.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pts.size===1)drag={x:e.clientX-x,y:e.clientY-y};else if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),k};}});
    stage.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pts.size===2&&pinch){const [a,b]=[...pts.values()];k=Math.min(4,Math.max(1,pinch.k*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d));place();}
      else if(drag){x=e.clientX-drag.x;y=e.clientY-drag.y;place();}});
    const lift=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size)drag=null;else{const p=[...pts.values()][0];drag={x:p.x-x,y:p.y-y};}};
    stage.addEventListener('pointerup',lift);stage.addEventListener('pointercancel',lift);
    stage.addEventListener('wheel',e=>{if(!file)return;e.preventDefault();k=Math.min(4,Math.max(1,k*(e.deltaY<0?1.08:.93)));place();},{passive:false});
    const picks=el('div',undefined,'pu-actions two');
    const g=button(()=>t('pu.gallery'),()=>pickG.click(),'pu-btn ghost');g.prepend(icon('image',18));const c=button(()=>t('pu.camera'),()=>pickC.click(),'pu-btn ghost');c.prepend(icon('camera',18));picks.append(g,c);
    const facts=el('div',undefined,'pu-rows');
    facts.append(row('heart','rose',()=>t('pu.onlyPartner',{name:person(partner())}),()=>t('pu.onlyPartnerSub'),null,null),row('mapOff','blue','pu.noPlace',()=>t('pu.noPlaceSub'),null,null));
    const end=el('div',undefined,'pu-actions');
    const rm=$('avatarRemoveActive');const del=button(()=>'',()=>{rm?.click();},'pu-btn danger icon');del.append(icon('trash',20));copy(del,()=>t('pu.removePhoto'),'aria-label');del.hidden=!rm||rm.hidden;
    const use=button(()=>t('pu.usePhoto'),()=>send(),'pu-btn gold');use.disabled=true;end.append(del,use);
    const status=el('p',undefined,'pu-hint');status.setAttribute('role','status');
    v.body.append(stage,picks,facts,status,end,pickG,pickC);
    async function send(){
      if(!file)return;use.disabled=true;copy(status,()=>t('pu.sending'));
      try{await tidyPhotos();const out=await frame();const input=$('avatarFile');
        // hand the framed photo to the private upload; it only takes it when nothing else is saving, so try a few times
        let up=null;for(let i=0;i<6&&!up;i++){input.onclick?.();const dt=new DataTransfer();dt.items.add(out);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
          up=await until(()=>{const u=$('avatarUpload');return u&&!u.hidden&&!u.disabled?u:null;},2500);}
        if(!up)throw new Error('no upload');
        $('avatarConsent').checked=true;up.click();
        const ok=await until(()=>$('avatarUpload')?.hidden?true:null,90000);if(!ok)throw new Error('not saved');
        notify(()=>t('pu.photoSaved'));closeView();}
      catch{copy(status,()=>t('pu.photoFailed'));use.disabled=false;}
    }
    // the part inside the circle, as a 720 px square
    async function frame(){const bmp=await createImageBitmap(file);const r=stage.getBoundingClientRect(),ringR=ring.getBoundingClientRect(),ir=img.getBoundingClientRect();
      const sx=bmp.width/ir.width,sy=bmp.height/ir.height;const cx=(ringR.left-ir.left)*sx,cy=(ringR.top-ir.top)*sy,cw=ringR.width*sx,ch=ringR.height*sy;
      const cv=document.createElement('canvas');cv.width=cv.height=720;const g2=cv.getContext('2d');g2.fillStyle='#1C1418';g2.fillRect(0,0,720,720);g2.drawImage(bmp,cx,cy,cw,ch,0,0,720,720);bmp.close?.();void r;
      const blob=await new Promise(res=>cv.toBlob(res,'image/jpeg',.9));return new File([blob],'photo.jpg',{type:'image/jpeg'});}
  }
  const until=(fn,ms)=>new Promise(res=>{const t0=Date.now();const tick=()=>{const v=fn();if(v)return res(v);if(Date.now()-t0>ms)return res(null);setTimeout(tick,200);};tick();});

  // the profile bubble (top right) and the camera on the Us hero open your new profile page
  document.addEventListener('click',e=>{if(e.target.closest?.('#profileBubble')&&getSnapshot()){e.preventDefault();e.stopImmediatePropagation();openProfile();}},true);

  return {render(){if(getSnapshot()&&me())renderUs();view?.repaint?.();},clear(){closeView();page.querySelector('.pu-tiles')?.remove();page.querySelector('.pu-account-row')?.remove();},openProfile};
}
