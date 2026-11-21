import {icon} from '../design/icons.js';
// The 3D garden on the home screen, in place of the flat one when the phone can draw it.
// The scene (three.js) is a separate file loaded after the app starts; until it is ready, or if the
// phone cannot draw WebGL, the flat garden stays. Labels pinned to the 3D scene come from the catalog.
import {gardenLight} from '../design/theme.js';
import {stageFor,isDrooping} from '../garden/model.js';

export function webglAvailable(){
  try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch{return false;}
}

// Where the labels sit in the garden (x, y, z in scene units).
const AT=Object.freeze({yasmine:[-4.15,2.85,-2.2],oliver:[3.35,4.45,-2.95],toad:[4.05,1.7,1.25],catatumbo:[34,12.5,-50],angel:[10.4,6.4,-4.8]});

export function createGarden3D({t,copy,onFlower,onMoon,onSpot,onToad,onEvent,onReady,onFail,onWater,onPlant,seedsLeft=()=>0,mySide=()=>0}){
  const element=document.createElement('div');element.className='garden3d';
  const stage=document.createElement('div');stage.className='garden3d-stage';
  const loading=document.createElement('p');loading.className='garden3d-loading';copy(loading,()=>t('garden3d.loading'));
  const pins=document.createElement('div');pins.className='garden3d-pins';pins.setAttribute('aria-hidden','true');
  // full screen: the whole phone becomes the garden; the same button (or Escape) brings it back
  const full=document.createElement('button');full.type='button';full.className='garden3d-full';
  const paintFull=()=>{const on=element.classList.contains('full');full.replaceChildren(icon(on?'shrink':'expand',18));copy(full,()=>t(on?'garden3d.exitFull':'garden3d.full'),'aria-label');full.setAttribute('aria-pressed',String(on));};
  const holder=document.createComment('garden');
  function setFull(on){
    if(on===element.classList.contains('full'))return;
    if(on){element.replaceWith(holder);document.body.append(element);}else if(holder.parentNode){holder.replaceWith(element);}
    element.classList.toggle('full',on);document.documentElement.classList.toggle('garden-full',on);paintFull();if(on){if(!icons&&api?.flowerIcons){try{icons=api.flowerIcons();}catch{}}paintTray();}full.focus({preventScroll:true});
  }
  full.onclick=()=>setFull(!element.classList.contains('full'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&element.classList.contains('full'))setFull(false);});
  paintFull();
  // the scores on the houses can be hidden (this phone remembers); the compass brings the usual view back
  const KEY_SCORES='garden.scores';let scoresOn=(()=>{try{return localStorage.getItem(KEY_SCORES)!=='0';}catch{return true;}})();
  const tools=document.createElement('div');tools.className='garden3d-tools';
  const scoresBtn=document.createElement('button');scoresBtn.type='button';scoresBtn.className='garden3d-tool';
  const paintScores=()=>{scoresBtn.replaceChildren(icon(scoresOn?'eye':'eyeOff',16));copy(scoresBtn,()=>t(scoresOn?'garden3d.hideScores':'garden3d.showScores'),'aria-label');scoresBtn.setAttribute('aria-pressed',String(!scoresOn));element.classList.toggle('no-scores',!scoresOn);};
  scoresBtn.onclick=()=>{scoresOn=!scoresOn;try{localStorage.setItem(KEY_SCORES,scoresOn?'1':'0');}catch{}paintScores();};
  const resetBtn=document.createElement('button');resetBtn.type='button';resetBtn.className='garden3d-tool';resetBtn.append(icon('compass',18));copy(resetBtn,()=>t('garden3d.resetView'),'aria-label');resetBtn.onclick=()=>api?.resetView?.();
  tools.append(scoresBtn,resetBtn);paintScores();
  // the seed tray (full screen): drag a 3D flower onto your side of the island to plant it there
  const tray=document.createElement('div');tray.className='garden3d-tray';
  const trayHead=document.createElement('p');trayHead.className='garden3d-tray-head';
  const trayRow=document.createElement('div');trayRow.className='garden3d-tray-row';tray.append(trayHead,trayRow);
  let icons=null,ghost=null;
  function paintTray(){
    const left=seedsLeft();copy(trayHead,()=>left?t('garden3d.seedsDrag',{count:left}):t('garden3d.noSeeds'));trayRow.replaceChildren();
    for(const type of ['rose','jasmine','orchid','marigold','lavender','lilium']){
      const b=document.createElement('button');b.type='button';b.className='garden3d-seed';b.dataset.type=type;b.disabled=!left;
      const img=document.createElement('img');img.alt='';if(icons?.[type])img.src=icons[type];
      const name=document.createElement('span');copy(name,()=>t('flowers.'+type));b.append(img,name);
      b.addEventListener('pointerdown',e=>startSeed(e,type,img.src));trayRow.append(b);}
  }
  function startSeed(e,type,src){
    if(!seedsLeft()||!api)return;e.preventDefault();ghost=document.createElement('img');ghost.className='garden3d-ghost';ghost.src=src;ghost.alt='';document.body.append(ghost);
    const move=ev=>{ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';};move(e);
    const up=async ev=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);ghost?.remove();ghost=null;
      if(ev.type!=='pointerup')return;const at=api.groundAt(ev.clientX,ev.clientY);if(!at)return;
      const side=mySide(),spot=api.freeSpot(at.x,at.z,side);if(!spot)return;
      if(side&&Math.sign(at.x)!==side)onEvent?.({kind:'ownSide'});
      await onPlant?.(type,spot);paintTray();};
    addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
  }
  element.append(stage,loading,pins,full,tools,tray);

  const pin=(cls,at,{side=false,only=null,dx=0,dy=0}={})=>{const n=document.createElement('div');n.className='pin '+cls;pins.append(n);return {n,at,side,only,dx,dy};};
  const score=who=>{const p=pin('score '+who,AT[who],{side:who==='oliver'});const b=document.createElement('b'),initial=document.createElement('em'),name=document.createElement('small'),count=document.createElement('span');b.append(initial,name,count);p.n.append(b,document.createElement('i'));p.parts={initial,name,count};p.n.hidden=true;return p;};
  const scores={yasmine:score('yasmine'),oliver:score('oliver')};
  const song=pin('toad-song',AT.toad);{const b=document.createElement('b');song.label=document.createElement('span');b.append(song.label);song.n.append(b,document.createElement('i'));song.n.hidden=true;}
  const storm=pin('landmark storm',AT.catatumbo,{only:['night'],dx:-64,dy:46});copy(storm.n,()=>t('culture.catatumbo.title'));
  const falls=pin('landmark falls',AT.angel,{only:['day','dusk']});copy(falls.n,()=>t('culture.angel.title'));
  const all=[scores.yasmine,scores.oliver,song,storm,falls];

  let api=null,preview=null,harissa=false,timer=null,lastFlowers=[],playing=false,destroyed=false;
  const light=()=>preview??(harissa?'dusk':gardenLight());
  function place(){
    if(!api)return;const w=element.clientWidth,h=element.clientHeight,L=api.light;
    for(const p of all){
      let vis=!p.n.hidden&&(!p.only||p.only.includes(L)),x=0,y=0;
      if(vis){const s=api.project(...p.at);x=s.x+p.dx;y=s.y+p.dy;vis=s.front&&x>-40&&x<w+40&&y>64&&y<h*.82;}
      p.n.style.visibility=vis?'visible':'hidden';
      if(vis)p.n.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(${p.side?'-10px':'-50%'},-100%)`;
    }
  }
  function sendFlowers(){if(api)api.setFlowers(lastFlowers.map(f=>({id:f.id,type:f.flower_type,stage:stageFor(f.water),droop:isDrooping(f),created_at:f.created_at,px:f.px??null,pz:f.pz??null})));}

  async function start(){
    try{
      const {mountGarden}=await import('./scene.js');
      if(destroyed)return;
      api=await mountGarden(stage,{light:light(),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
      if(destroyed){api.destroy();api=null;return;}
      api.canvas.setAttribute('role','img');copy(api.canvas,()=>t('garden3d.label'),'aria-label');
      api.onFrame(place);
      api.onEvent?.(e=>onEvent?.(e));
      api.onTap(hit=>{if(hit.kind==='toad')onToad?.();else if(hit.kind==='flower')onFlower?.(hit.id);else if(hit.kind==='moon')onMoon?.();else if(hit.kind==='spot')onSpot?.(hit.id);});
      api.onWater?.(id=>onWater?.(id));
      api.setPlaying(playing);sendFlowers();
      timer=setInterval(()=>api?.setLight(light()),60000);
      element.classList.add('loaded');onReady?.();
    }catch(error){element.classList.add('failed');onFail?.(error);}
  }

  return {element,start,
    get light(){return light();},
    update({flowers=[],mode}={}){lastFlowers=flowers.filter(f=>!f.deleted_at);harissa=mode==='harissa';sendFlowers();api?.setLight(light());},
    previewLight(L){preview=['day','dusk','night'].includes(L)?L:null;api?.setLight(light());return light();},
    // Real people and real numbers only: the two houses show each person's air hockey wins.
    setScores(list){for(const who of ['yasmine','oliver']){const s=scores[who],d=list?.[who];s.n.hidden=!d;if(!d)continue;
      s.parts.initial.textContent=Array.from(d.name.trim())[0]?.toLocaleUpperCase()??'';copy(s.parts.name,()=>d.isMe?t('garden3d.you'):d.name);s.parts.count.textContent=String(d.count);}},
    setSong(title){song.n.hidden=!title;song.label.textContent=title??'';},
    setPlaying(on){playing=!!on;api?.setPlaying(playing);},
    exitFull(){setFull(false);},
    // straight to full screen with the watering can glowing (the only way to water now)
    openFull(){setFull(true);api?.pulseCan?.();},
    refreshTray(){if(element.classList.contains('full'))paintTray();},
    destroy(){setFull(false);destroyed=true;clearInterval(timer);api?.destroy();api=null;element.remove();},
  };
}
