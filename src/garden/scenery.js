// Painted scenery in three parallax layers (1500 x 500 units). Scenery never changes with activity,
// except lanterns and the pergola lights, which the panorama toggles by class.
import {s,g,ellipse,circle,path,rect,rng,star} from './svg.js';
import {WIDTH,HEIGHT} from './model.js';

const stops=(id,list,attrs={})=>s('linearGradient',{id,x1:0,y1:0,x2:0,y2:1,...attrs},list.map(([o,cls,op])=>s('stop',{offset:o,cls,'stop-opacity':op})));
const radial=(id,cls)=>s('radialGradient',{id},[s('stop',{offset:0,cls,'stop-opacity':.9}),s('stop',{offset:.45,cls,'stop-opacity':.28}),s('stop',{offset:1,cls,'stop-opacity':0})]);
export function defs(prefix){
  return s('defs',{},[
    stops(prefix+'sky',[[0,'s-bg'],[.62,'s-sky'],[1,'s-sky-low']]),
    stops(prefix+'sea',[[0,'s-sea-l'],[1,'s-sea']]),
    stops(prefix+'arch',[[0,'s-sky'],[.55,'s-sky-low'],[.56,'s-sea-l'],[1,'s-sea']]),
    stops(prefix+'wall',[[0,'s-wall'],[1,'s-wall-d']]),
    stops(prefix+'soil',[[0,'s-soil'],[1,'s-soil-d']]),
    radial(prefix+'glow','s-lant'),radial(prefix+'moonglow','s-jas'),
  ]);
}
const url=(p,id)=>`url(#${p}${id})`;

export function farLayer(p){
  const r=rng(7),stars=[];
  for(let i=0;i<46;i++)stars.push(circle((r()*WIDTH).toFixed(0),(r()*200).toFixed(0),(0.6+r()*1.3).toFixed(1),'c-jas twinkle t'+(i%4)));
  const clouds=[[520,70,1],[980,110,.8],[1320,60,1.2]].map(([x,y,k])=>g('cloud',[ellipse(x,y,60*k,13*k,'c-jas'),ellipse(x-30*k,y+4,34*k,10*k,'c-jas'),ellipse(x+34*k,y+3,40*k,11*k,'c-jas')]));
  const hills=path('M0 268 C120 236 220 250 330 238 C450 224 560 252 690 240 C820 228 900 214 1030 226 C1160 238 1260 220 1380 232 L1500 236 L1500 300 L0 300Z','c-hill');
  const hills2=path('M0 282 C160 266 260 276 420 262 C600 250 700 276 860 268 C1040 258 1180 278 1500 262 L1500 300 L0 300Z','c-hill-near');
  const village=(x0,n,seed)=>{const vr=rng(seed),parts=[];for(let i=0;i<n;i++){const x=x0+i*15+vr()*6,h=10+vr()*10,y=262-vr()*14-h;parts.push(rect(x.toFixed(1),y.toFixed(1),12,h.toFixed(1),'c-house'));if(vr()>.45)parts.push(rect((x+4).toFixed(1),(y+h/2-2).toFixed(1),3,3,'c-lant window'));}parts.push(path(`M${x0+n*7} ${232-10} a9 9 0 0 1 18 0Z`,'c-dome'));return g('village',parts);};
  const glitter=[];for(let i=0;i<30;i++)glitter.push(rect((r()*WIDTH).toFixed(0),(290+r()*34).toFixed(0),(4+r()*10).toFixed(0),1.2,'c-jas glitter t'+(i%4)));
  return g('layer-far',[
    s('rect',{x:0,y:0,width:WIDTH,height:HEIGHT,fill:url(p,'sky')}),
    g('stars',stars),
    g('moon',[circle(230,92,80,undefined),circle(230,92,26,'c-jas')],{id:p+'moon'}),
    g('sun',[circle(230,96,30,'c-lant')]),g('dusk-sun',[circle(250,214,44,'c-mari')]),
    g('clouds',clouds),
    g('coast',[hills,village(380,9,3),village(1120,10,5),s('rect',{x:0,y:284,width:WIDTH,height:56,fill:url(p,'sea')}),g('glitters',glitter),hills2],{transform:'translate(0 -44)'}),
  ]);
}
// The moon glow is painted with a gradient fill; set after creation (no inline styles).
export function finishFar(layer,p){const glow=layer.querySelector('.moon circle');glow?.setAttribute('fill',url(p,'moonglow'));const sunGlow=s('circle',{cx:230,cy:96,r:90,fill:url(p,'glow'),cls:'sun-glow'});layer.querySelector('.sun')?.prepend(sunGlow);}

function bougainvillea(x0,y0,w,seed){const r=rng(seed),parts=[];for(let i=0;i<34;i++){const x=x0+r()*w,y=y0+r()*46-r()*16;parts.push(ellipse(x.toFixed(1),y.toFixed(1),(4+r()*8).toFixed(1),(3+r()*5).toFixed(1),r()>.6?'c-leaf':r()>.5?'c-orch':'c-rose',(r()*60-30).toFixed(0)));}return g('bougainvillea sway-slow',parts);}
function olive(x,y){const r=rng(11),canopy=[];for(let i=0;i<16;i++)canopy.push(ellipse(x-60+r()*120,y-150+r()*70,(18+r()*22).toFixed(1),(12+r()*12).toFixed(1),r()>.5?'c-olive':'c-olive-l'));return g('tree olive',[path(`M${x-8} ${y} C${x-14} ${y-40} ${x+10} ${y-60} ${x-4} ${y-100} C${x+4} ${y-110} ${x+14} ${y-90} ${x+10} ${y-60} C${x+4} ${y-30} ${x+16} ${y-10} ${x+12} ${y}Z`,'c-trunk'),g('canopy sway-slow',canopy)]);}
const cypress=(x,y,h)=>g('tree cypress',[path(`M${x} ${y-h} C${x+14} ${y-h*.7} ${x+18} ${y-h*.3} ${x+12} ${y} L${x-12} ${y} C${x-18} ${y-h*.3} ${x-14} ${y-h*.7} ${x} ${y-h}Z`,'c-leaf-d'),path(`M${x+2} ${y-h*.9} C${x+10} ${y-h*.6} ${x+12} ${y-h*.3} ${x+8} ${y-4}`,'cypress-light')]);
function lemon(x,y){const r=rng(17),parts=[rect(x-4,y-70,8,70,'c-trunk',3),ellipse(x,y-100,52,42,'c-leaf'),ellipse(x-18,y-110,30,24,'c-leaf-l'),ellipse(x+20,y-92,28,22,'c-leaf-d')];for(let i=0;i<11;i++)parts.push(ellipse((x-40+r()*80).toFixed(1),(y-130+r()*60).toFixed(1),4,3.2,'c-lemon'));return g('tree lemon',parts);}
function pergola(x,y){const parts=[rect(x,y-150,10,150,'c-wall-d'),rect(x+200,y-150,10,150,'c-wall-d'),rect(x-14,y-160,240,12,'c-trunk',3)];for(let i=0;i<9;i++)parts.push(rect(x-6+i*28,y-166,6,24,'c-trunk',2));const r=rng(23),wisteria=[];for(let i=0;i<14;i++){const cx=x-4+i*16+r()*6;for(let j=0;j<6;j++)wisteria.push(ellipse(cx.toFixed(1),(y-146+j*7).toFixed(1),(6-j*.8).toFixed(1),4,j%2?'c-lav':'c-lav-l'));}parts.push(g('wisteria sway',wisteria));const lights=[];for(let i=0;i<10;i++)lights.push(circle(x+i*22,y-142+Math.sin(i)*4,2.4,'c-lant'));parts.push(g('pergola-lights',lights));return g('pergola',parts);}

export function midLayer(p){
  const wallTop='M0 312 C140 306 260 314 400 308 C540 302 700 312 840 306 C1000 300 1180 312 1320 306 L1500 304';
  const jasmineVine=[path('M402 392 C410 360 396 340 420 318 M440 394 C446 360 470 346 462 320 M480 392 C490 370 476 350 500 330','vine')];
  const r=rng(29);for(let i=0;i<22;i++)jasmineVine.push(star((400+r()*110).toFixed(1),(320+r()*68).toFixed(1),3.2,'c-jas'));
  return g('layer-mid',[
    olive(300,330),cypress(520,318,190),cypress(1140,316,170),lemon(880,320),
    g('wall',[
    s('path',{d:wallTop+' L1500 398 L0 398Z',fill:url(p,'wall')}),
    path(wallTop+' L1500 312 C1300 316 1000 306 840 314 C700 320 540 310 400 316 C260 322 140 314 0 320Z','c-wall-l'),
    s('path',{d:'M576 398 V338 A34 34 0 0 1 644 338 V398Z',fill:url(p,'arch')}),
    g('gate',[path('M1004 398 V336 A28 28 0 0 1 1060 336 V398Z','c-gate'),path('M1032 398 V310','gate-line'),circle(1040,362,2,'c-lant')]),
    bougainvillea(90,290,190,31),bougainvillea(660,286,150,37),bougainvillea(1200,288,140,41),
    g('climbing-jasmine',jasmineVine)],{transform:'translate(0 -50)'}),
    pergola(1260,398),
  ]);
}

export const LANTERN_X=Object.freeze([150,360,620,850,1060,1250,1420]);
export function nearLayer(p){
  const stones=[],r=rng(43);for(let i=0;i<40;i++)stones.push(ellipse((r()*WIDTH).toFixed(0),(384+r()*22).toFixed(0),(10+r()*16).toFixed(0),(3+r()*3).toFixed(1),r()>.5?'c-stone':'c-stone-d'));
  const pot=x=>g('pot',[path(`M${x-16} 446 L${x+16} 446 L${x+12} 476 L${x-12} 476Z`,'c-terra'),rect(x-18,442,36,7,'c-terra-d',2),ellipse(x,436,18,12,'c-leaf'),ellipse(x-8,430,10,8,'c-leaf-l'),ellipse(x+9,432,9,7,'c-leaf-d')]);
  const lantern=(x,i)=>g('lantern',[rect(x-1.5,402,3,30,'c-trunk'),s('circle',{cx:x,cy:396,r:26,fill:url(p,'glow'),cls:'lantern-glow'}),rect(x-7,386,14,16,'c-lant-glass',3),path(`M${x-9} 386 L${x} 378 L${x+9} 386Z`,'c-trunk')],{'data-lantern':i});
  return g('layer-near',[
    s('path',{d:'M0 340 C300 334 600 344 900 338 C1200 332 1400 340 1500 338 L1500 378 L0 378Z',fill:url(p,'soil'),cls:'bed',  'data-bed':'back'}),
    path('M0 376 C400 370 800 380 1500 372 L1500 414 C1000 420 500 410 0 416Z','c-stone-path'),g('stones',stones),
    g('fountain',[ellipse(760,404,46,12,'c-wall'),ellipse(760,400,38,8,'c-sea'),rect(756,372,8,28,'c-wall'),path('M760 372 C744 360 740 372 734 396 M760 372 C776 360 780 372 786 396','spray')]),
    s('path',{d:'M0 414 C500 408 1000 420 1500 412 L1500 500 L0 500Z',fill:url(p,'soil'),cls:'bed','data-bed':'front'}),
    path('M0 416 C500 410 1000 422 1500 414','edging'),
    g('pots',[70,540,990,1450].map(pot)),
    g('lanterns',LANTERN_X.map(lantern)),
  ]);
}
