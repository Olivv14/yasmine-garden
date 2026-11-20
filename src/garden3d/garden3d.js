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

export function createGarden3D({t,copy,onFlower,onMoon,onSpot,onToad,onEvent,onReady,onFail}){
  const element=document.createElement('div');element.className='garden3d';
  const stage=document.createElement('div');stage.className='garden3d-stage';
  const loading=document.createElement('p');loading.className='garden3d-loading';copy(loading,()=>t('garden3d.loading'));
  const pins=document.createElement('div');pins.className='garden3d-pins';pins.setAttribute('aria-hidden','true');
  element.append(stage,loading,pins);

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
  function sendFlowers(){if(api)api.setFlowers(lastFlowers.map(f=>({id:f.id,type:f.flower_type,stage:stageFor(f.water),droop:isDrooping(f),created_at:f.created_at})));}

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
    destroy(){destroyed=true;clearInterval(timer);api?.destroy();api=null;element.remove();},
  };
}
