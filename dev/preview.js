// Dev-only preview: the garden and its art with fake data, for screenshots at 375x812 and 1280x800.
import {createGarden} from '../src/garden/panorama.js';
import {flowerArt} from '../src/garden/flowers.js';
import {placeFlowers,FLOWER_TYPES,STAGES,authorTone,lanterns} from '../src/garden/model.js';
import {s} from '../src/garden/svg.js';
const q=new URLSearchParams(location.search);
document.documentElement.dataset.gardenTheme=q.get('theme')||'night';
const now=Date.now(),day=86400000,iso=ms=>new Date(ms).toISOString();
const members=[{profile_id:'o',slot:1},{profile_id:'y',slot:2}],profiles=[{id:'o',display_name:'Oliver'},{id:'y',display_name:'Yasmine'}];
const flowers=Array.from({length:Number(q.get('n')??22)},(_,i)=>({id:'f'+i+'-'+(i*7919),flower_type:FLOWER_TYPES[i%6],water:[0,3,6,9,9,7,4,9][i%8],planted_by:i%2?'y':'o',created_at:iso(now-i*day),updated_at:iso(now-(i===5?5:0)*day)}));
const rounds=[0,1,2,3,4,5,6].map(i=>({id:'r'+i,created_at:iso(now-i*day)}));
const answers=rounds.flatMap(r=>['o','y'].map(o=>({round_id:r.id,owner_id:o,submitted_at:r.created_at})));
const garden=createGarden({labels:{},onFlower:id=>{document.getElementById('log').textContent='open '+id;},onSoil:p=>{document.getElementById('log').textContent='plant '+p.bed+' '+Math.round(p.x);},onMoon:()=>{document.getElementById('log').textContent='terminal';}});
document.getElementById('garden').append(garden.element);
const placed=placeFlowers(flowers),l=lanterns(rounds,answers,now);
const mode=document.documentElement.dataset.gardenTheme;
garden.update({flowers:placed,tones:Object.fromEntries(flowers.map(f=>[f.id,authorTone(f.planted_by,members,profiles)])),droop:new Set(['f5-39595']),lanternsLit:l.lit,pergola:l.pergola,visitors:2,mode,summary:`${flowers.length} flowers`,items:flowers.map(f=>({id:f.id,label:f.flower_type}))});
const sheet=document.getElementById('sheet');
for(const t of FLOWER_TYPES)for(const [i,st] of STAGES.entries()){const svg=s('svg',{viewBox:'-40 -80 80 90',width:80,height:90,cls:'garden-specimen','aria-label':t+' '+st},[flowerArt(t,i)]);const fig=document.createElement('figure');const cap=document.createElement('figcaption');cap.textContent=t+' · '+st;fig.append(svg,cap);sheet.append(fig);}
window.garden=garden;
