// The living garden: three parallax SVG layers + one particle canvas + a keyboard/screen-reader list.
import {s,g} from './svg.js';
import {defs,farLayer,finishFar,midLayer,nearLayer,LANTERN_X} from './scenery.js';
import {flowerArt} from './flowers.js';
import {WIDTH,HEIGHT,stageFor} from './model.js';
import {Particles} from './particles.js';
import {animate,reducedMotion,DURATION} from '../design/motion.js';

const PARALLAX=Object.freeze({far:.1,mid:.4,near:1});
const LONG_PRESS=550,DRAG=7;

function layerSvg(name,build){
  const p='g'+name[0]+Math.random().toString(36).slice(2,7)+'-';
  const svg=s('svg',{viewBox:`0 0 ${WIDTH} ${HEIGHT}`,preserveAspectRatio:'xMinYMax slice',cls:'garden-layer layer-'+name,'aria-hidden':'true',focusable:'false'},[defs(p)]);
  const layer=build(p);svg.append(layer);if(name==='far')finishFar(layer,p);return svg;
}
function grainTexture(){
  // Light paper grain, painted once. data: images are allowed by the CSP.
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),img=x.createImageData(128,128);
  for(let i=0;i<img.data.length;i+=4){const v=Math.random()*255;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=18;}
  x.putImageData(img,0,0);return c.toDataURL('image/png');
}

export function createGarden({labels,onFlower,onSoil,onMoon}){
  const root=document.createElement('div');root.className='garden';
  const view=document.createElement('div');view.className='garden-viewport';view.tabIndex=0;view.setAttribute('role','group');
  const layers={far:layerSvg('far',farLayer),mid:layerSvg('mid',midLayer),near:layerSvg('near',nearLayer)};
  const flowersG=g('flowers');layers.near.querySelector('.layer-near').append(flowersG);
  const canvas=document.createElement('canvas');canvas.className='garden-particles';canvas.setAttribute('aria-hidden','true');
  const grain=document.createElement('div');grain.className='garden-grain';grain.setAttribute('aria-hidden','true');
  try{grain.style.backgroundImage=`url(${grainTexture()})`;}catch{}
  const wave=document.createElement('div');wave.className='garden-wave';wave.setAttribute('aria-hidden','true');
  view.append(layers.far,layers.mid,layers.near,canvas,grain,wave);
  const summaryNode=document.createElement('p');summaryNode.className='sr-only';summaryNode.setAttribute('aria-live','polite');
  const list=document.createElement('ul');list.className='garden-keys';
  root.append(view,summaryNode,list);
  const particles=new Particles(canvas);
  let offset=0,max=0,unit=1,vw=0,vh=0,placed=[],momentum=0,velocity=0;

  function measure(){
    vw=view.clientWidth;vh=view.clientHeight;if(!vw||!vh)return;
    const svgW=Math.max(vh*WIDTH/HEIGHT,vw);unit=Math.max(svgW/WIDTH,vh/HEIGHT);
    for(const svg of Object.values(layers)){svg.style.width=svgW+'px';svg.style.height=vh+'px';}
    const firstLayout=max===0;max=Math.max(0,svgW-vw);if(firstLayout)offset=max/2;particles.resize(vw,vh);setOffset(offset);
  }
  function setOffset(x){offset=Math.max(0,Math.min(max,x));for(const [name,svg] of Object.entries(layers))svg.style.transform=`translate3d(${(-offset*(reducedMotion()&&name!=='near'?1:PARALLAX[name])).toFixed(1)}px,0,0)`;}
  // Unit coordinates (viewBox) to viewport pixels for the near layer.
  const yOffset=()=>vh-HEIGHT*unit;
  const toScreen=(x,y)=>({x:x*unit-offset,y:y*unit+yOffset()});
  const toUnits=(px,py)=>({x:(px+offset)/unit,y:(py-yOffset())/unit});
  function centerOn(x){cancelAnimationFrame(momentum);setOffset(x*unit-vw/2);}
  new ResizeObserver(measure).observe(view);

  // Swipe with momentum; a short press on a flower opens it; a long press on soil plants; on the moon, the terminal.
  let press=null;
  view.addEventListener('pointerdown',e=>{
    if(e.button>0)return;cancelAnimationFrame(momentum);
    const flower=e.target.closest?.('.flower'),bed=e.target.closest?.('[data-bed]'),sky=e.target.closest?.('.moon,.sun,.dusk-sun');
    press={id:e.pointerId,x:e.clientX,y:e.clientY,start:offset,t:performance.now(),lastX:e.clientX,lastT:performance.now(),moved:false,flower,timer:null};
    if((bed&&!flower)||sky){const rect=view.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top,bedName=bed?.dataset.bed;press.timer=setTimeout(()=>{if(!press||press.moved)return;press.handled=true;if(sky)onMoon?.();else{particles.burst('soil',px,py,10);onSoil?.({bed:bedName,...toUnits(px,py)});}},sky?700:LONG_PRESS);}
  });
  view.addEventListener('pointermove',e=>{
    if(!press||e.pointerId!==press.id)return;const dx=e.clientX-press.x;
    if(!press.moved&&Math.abs(dx)>DRAG&&Math.abs(dx)>Math.abs(e.clientY-press.y)){press.moved=true;clearTimeout(press.timer);view.setPointerCapture?.(e.pointerId);view.classList.add('dragging');}
    if(press.moved){const now=performance.now();velocity=(e.clientX-press.lastX)/Math.max(1,now-press.lastT);press.lastX=e.clientX;press.lastT=now;setOffset(press.start-dx);}
  });
  const end=e=>{
    if(!press||e.pointerId!==press.id)return;clearTimeout(press.timer);view.classList.remove('dragging');const p=press;press=null;
    if(p.moved){if(!reducedMotion()&&Math.abs(velocity)>.05){let v=-velocity*16;const step=()=>{v*=.94;setOffset(offset+v);if(Math.abs(v)>.4&&offset>0&&offset<max)momentum=requestAnimationFrame(step);};momentum=requestAnimationFrame(step);}return;}
    if(!p.handled&&p.flower&&e.type==='pointerup')onFlower?.(p.flower.dataset.id);
  };
  view.addEventListener('pointerup',end);view.addEventListener('pointercancel',end);
  view.addEventListener('wheel',e=>{const dx=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.shiftKey?e.deltaY:0;if(!dx)return;e.preventDefault();cancelAnimationFrame(momentum);setOffset(offset+dx);},{passive:false});
  view.addEventListener('keydown',e=>{
    const rtl=getComputedStyle(root).direction==='rtl',dir=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
    if(dir){e.preventDefault();setOffset(offset+dir*(rtl?-1:1)*Math.max(120,vw*.4));}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();setOffset(e.key==='Home'?0:max);}
    else if(e.key==='Enter'&&placed.length){e.preventDefault();const mid=(offset+vw/2)/unit;const near=[...placed].sort((a,b)=>Math.abs(a.x-mid)-Math.abs(b.x-mid))[0];onFlower?.(near.flower.id);}
  });

  function flowerNode(p,tone,droop){
    const stage=stageFor(p.flower.water);
    const plant=g('plant',[s('ellipse',{cx:0,cy:2,rx:13,ry:3.6,cls:'tone tone-'+tone}),flowerArt(p.flower.flower_type,stage)]);
    plant.style.animationDelay=(-(p.x%7)).toFixed(1)+'s';
    const node=g(`flower${droop?' droop':''}`,[s('rect',{x:-18,y:-80,width:44,height:86,cls:'hit'}),plant],{transform:`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.scale.toFixed(3)})`,'data-id':p.flower.id});
    return node;
  }
  function update({flowers=[],tones={},droop=new Set(),lanternsLit=0,pergola=false,visitors=0,mode='night',summary='',items=[]}){
    placed=flowers;flowersG.replaceChildren(...flowers.map(p=>flowerNode(p,tones[p.flower.id]??'oliver',droop.has(p.flower.id))));
    layers.near.querySelectorAll('.lantern').forEach((n,i)=>n.classList.toggle('lit',i<lanternsLit));
    layers.mid.querySelector('.pergola')?.classList.toggle('lit',pergola);
    view.setAttribute('aria-label',summary);summaryNode.textContent=summary;
    list.replaceChildren(...items.map(item=>{const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=item.label;b.dataset.id=item.id;
      b.onfocus=()=>{const p=placed.find(x=>x.flower.id===item.id);if(p)centerOn(p.x);flowersG.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.classList.add('focus');};
      b.onblur=()=>flowersG.querySelector('.flower.focus')?.classList.remove('focus');b.onclick=()=>onFlower?.(item.id);li.append(b);return li;}));
    particles.setAmbient(mode,visitors);
  }
  const screenOf=id=>{const p=placed.find(x=>x.flower.id===id);return p?toScreen(p.x,p.y-30*p.scale):null;};
  function lift(id){const n=flowersG.querySelector(`[data-id="${CSS.escape(id)}"] .plant`);if(n)animate(n,{transform:['scale(1)','scale(1.18)','scale(1)']},{duration:DURATION.water});}
  return {
    element:root,labels,update,
    watered(id){const pt=screenOf(id);if(pt)particles.burst('drops',pt.x,pt.y,16);lift(id);},
    planted(id){const pt=screenOf(id);if(pt)particles.burst('soil',pt.x,pt.y+20,12);},
    bloomAll(){
      const visible=placed.filter(p=>{const x=p.x*unit-offset;return x>-40&&x<vw+40;});
      for(const p of visible){const n=flowersG.querySelector(`[data-id="${CSS.escape(p.flower.id)}"] .plant`);if(n)animate(n,{transform:['scale(1)','scale(1.28)','scale(1)']},{duration:DURATION.bloom});const pt=toScreen(p.x,p.y-40*p.scale);particles.burst('petals',pt.x,pt.y,8);}
      if(!visible.length)particles.burst('petals',vw/2,vh/2,30);
      animate(wave,{opacity:[0,.55,0],transform:['translateX(-60%)','translateX(60%)']},{duration:DURATION.bloom});
    },
    focus(){view.focus();},
    lanternX:LANTERN_X,
  };
}
