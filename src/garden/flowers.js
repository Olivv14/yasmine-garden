// Six flowers x four stages (seed, sprout, bud, bloom). Flat painted shapes, no outlines.
// Origin is the base of the stem; the plant grows towards negative y.
import {g,ellipse,circle,path,s,star} from './svg.js';
import {FLOWER_TYPES,STAGES} from './model.js';

const COLOR={rose:'rose',marigold:'mari',jasmine:'jas',lavender:'lav',lilium:'lil',orchid:'orch'};
const stem=(d,w=2.4)=>s('path',{d,cls:'stem','stroke-width':w});
const leaf=(x,y,rx,ry,rot,cls='c-leaf')=>ellipse(x,y,rx,ry,cls,rot);
const ring=(arr,n,fn)=>{for(let i=0;i<n;i++)arr.push(fn(i,360*i/n));return arr;};
const rot=(node,deg,cx=0,cy=0)=>{node.setAttribute('transform',`rotate(${deg} ${cx} ${cy})`);return node;};

function mound(){return g('mound',[ellipse(0,1,13,4,'c-soil-l'),ellipse(-2,-1,2.6,1.8,'c-seed',-20)]);}
// Small garden label so even a seed shows which flower it will become.
function tag(type){return g('tag',[path('M9 2 L9 -13','stick'),s('rect',{x:5.5,y:-19,width:7,height:6,rx:1.5,cls:'c-'+COLOR[type]})]);}
function sprout(){return g('plant-parts',[stem('M0 0 C0 -5 1 -9 0 -13',2),leaf(-5,-12,5.5,2.4,-28),leaf(5,-14,5.5,2.4,28,'c-leaf-l')]);}

function bud(type){
  const c='c-'+COLOR[type];
  if(type==='lavender')return g('plant-parts',[stem('M0 0 C-1 -12 1 -24 0 -34'),...[0,1,2,3].map(i=>ellipse(i%2?1.6:-1.6,-24-i*3.6,1.9,2.6,'c-lav-d')),leaf(-4,-6,6,1.8,-60),leaf(4,-8,6,1.8,60,'c-leaf-l')]);
  if(type==='jasmine')return g('plant-parts',[ellipse(0,-10,13,9,'c-leaf-d'),ellipse(-5,-13,8,6,'c-leaf'),ellipse(6,-12,7,5,'c-leaf-l'),...[[-6,-18],[3,-20],[9,-12],[-10,-9]].map(([x,y])=>ellipse(x,y,1.6,2.6,'c-jas'))]);
  return g('plant-parts',[stem(type==='orchid'?'M0 0 C0 -16 5 -26 12 -30':'M0 0 C1 -12 -1 -24 0 -32'),leaf(-6,-10,7,2.6,-30),leaf(6,-16,7,2.6,30,'c-leaf-l'),
    type==='orchid'?ellipse(12,-31,3.4,4.4,c):path('M0 -31 C-5 -35 -4 -42 0 -46 C4 -42 5 -35 0 -31Z',c),
    type==='orchid'?null:ellipse(0,-31,3.2,2,'c-leaf')]);
}

const BLOOM={
  rose(){
    const head=g('head',[circle(0,-52,11,'c-rose-d'),...ring([],5,(i,a)=>rot(ellipse(0,-60,7,5.6,'c-rose'),a,0,-52)),circle(0,-52,6.2,'c-rose-l'),path('M-3 -52 a3 3 0 1 1 3 3 a5 5 0 1 1 -5 -6','swirl')]);
    return g('plant-parts',[stem('M0 0 C2 -18 -2 -34 0 -46'),leaf(-7,-20,7.5,3.4,-30),leaf(7,-32,7.5,3.4,30,'c-leaf-l'),leaf(-6,-40,5,2.4,-40,'c-leaf-d'),head]);
  },
  marigold(){
    const head=g('head',[...ring([],14,(i,a)=>rot(ellipse(0,-50.5,3.8,5.8,'c-mari-d'),a,0,-44)),...ring([],12,(i,a)=>rot(ellipse(0,-49,3.4,4.8,'c-mari'),a+15,0,-44)),...ring([],8,(i,a)=>rot(ellipse(0,-47,2.6,3.2,'c-mari-l'),a,0,-44)),circle(0,-44,2,'c-terra-d')]);
    return g('plant-parts',[stem('M0 0 C-2 -14 2 -28 0 -38'),...[[-8,-10,-50],[8,-16,50],[-7,-26,-40]].map(([x,y,r])=>g('fern',[leaf(x,y,7,2.6,r),leaf(x*1.25,y-2,3.6,1.6,r,'c-leaf-l')])),head]);
  },
  lavender(){
    const spike=(x0,x1,top)=>g('spike',[stem(`M${x0} 0 C${x0} -20 ${x1} ${top+28} ${x1} ${top}`,1.8),...[0,1,2,3,4,5,6].map(i=>ellipse(x1+(i%2?1.8:-1.8),top+4+i*4.4,2.4,3.4,i<2?'c-lav-l':i%3?'c-lav':'c-lav-d'))]);
    return g('plant-parts',[spike(-3,-10,-58),spike(0,0,-66),spike(3,10,-54),...[-14,-8,8,14].map((x,i)=>leaf(x*.7,-6,8,1.6,x<0?-70:70,i%2?'c-leaf-l':'c-leaf'))]);
  },
  lilium(){
    const petal=a=>rot(path('M0 -48 C5 -54 6 -62 1 -72 C-1 -66 -6 -58 0 -48Z','c-lil'),a,0,-48);
    const stripes=[0,60,120,180,240,300].map(a=>rot(path('M0 -50 L0.6 -60','stripe'),a,0,-48));
    const stamens=[-20,0,20].map(a=>rot(g('stamen',[path('M0 -48 L0 -60','filament'),circle(0,-61,1.4,'c-terra-d')]),a,0,-48));
    return g('plant-parts',[stem('M0 0 C1 -16 -1 -32 0 -46'),...[[-5,-14,-60],[5,-24,60],[-5,-34,-60]].map(([x,y,r])=>leaf(x,y,9,1.9,r)),g('head',[...[0,60,120,180,240,300].map(petal),...stripes,circle(0,-48,2.4,'c-lil-d'),...stamens])]);
  },
  orchid(){
    const flower=(x,y,sc)=>g('blossom',[...[-1,1].map(d=>ellipse(x+d*5*sc,y,5.2*sc,3.8*sc,'c-orch',d*20)),...[0,120,240].map(a=>rot(ellipse(x,y-5*sc,2.4*sc,5*sc,'c-orch-l'),a,x,y)),circle(x,y+2*sc,3*sc,'c-orch-d'),circle(x,y-.5*sc,1.3*sc,'c-lil')]);
    return g('plant-parts',[ellipse(-7,-3,10,3.4,'c-leaf',-12),ellipse(7,-4,10,3.4,'c-leaf-l',14),stem('M0 -2 C0 -30 10 -50 26 -56',1.8),g('head',[flower(5,-34,.85),flower(14,-47,1),flower(26,-55,1.05)])]);
  },
  jasmine(){
    const stars=[[-12,-20],[-4,-30],[6,-26],[13,-17],[-7,-12],[2,-18],[10,-34]].map(([x,y],i)=>g('star',[star(x,y,i%3?3.6:4.4,'c-jas'),circle(x,y,.9,'c-mari')]));
    return g('plant-parts',[ellipse(0,-12,17,12,'c-leaf-d'),ellipse(-7,-18,10,8,'c-leaf'),ellipse(8,-17,10,8,'c-leaf-l'),ellipse(1,-26,9,7,'c-leaf'),g('head',stars)]);
  },
};

export function flowerArt(type,stage){
  if(!FLOWER_TYPES.includes(type))throw new RangeError('Unknown flower '+type);
  const st=typeof stage==='number'?stage:STAGES.indexOf(stage);
  const parts=st===0?[mound(),tag(type)]:st===1?[mound(),sprout(),tag(type)]:st===2?[mound(),bud(type),tag(type)]:[mound(),BLOOM[type]()];
  return g(`flower-art t-${type} st-${STAGES[st]}`,parts);
}
