// Mascots that live on the app, shimeji style (approved MascotShimeji): small pixel pets on the top edge of the bottom
// bar. They walk, run, sit, stretch, look around, nap, dangle their legs over the edge, jump, climb the side of the
// screen; tap one to pet it, press and drag to pick it up (it kicks), let go and it falls and lands.
// Frames are sprite sheets (src/assets/mascots/<name>.png, 4 frames x 11 rows); the rows are named below.
const ROW={walk:0,sit:1,dangle:2,lie:3,sleep:4,grab:5,pet:6,run:7,jump:8,stretch:9,blink:10};
const W=64,H=66;          // one frame in CSS pixels (the sheet is drawn at 2x)
const FACES_RIGHT={emmy:true,bird:false,camel:false,chef:true};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand=(a,b)=>a+Math.random()*(b-a);

export function createMascots({t,copy}){
  let layer=null,pets=[],raf=0,last=0;
  function ensureLayer(){if(layer)return layer;layer=document.createElement('div');layer.className='mascot-layer';layer.setAttribute('aria-hidden','true');document.body.append(layer);return layer;}
  // the ground: the top edge of the bottom bar (or the bottom of the screen)
  const ground=()=>{const nav=document.querySelector('.bottom-nav');const r=nav?.getBoundingClientRect();return r&&r.height?r.top+6:innerHeight-8;};

  function make({sheet,owner}){
    const node=document.createElement('div');node.className='mascot m-'+sheet+(owner==='partner'?' theirs':'');
    const flip=document.createElement('div');flip.className='mascot-flip';const spr=document.createElement('div');spr.className='mascot-spr';
    const fx=document.createElement('div');fx.className='mascot-fx';flip.append(spr);node.append(flip,fx);ensureLayer().append(node);
    const p={sheet,node,spr,flip,fx,x:rand(40,innerWidth-80),y:0,vx:0,vy:0,dir:Math.random()<.5?-1:1,act:'blink',until:0,air:false,held:false,climb:null};
    setAct(p,'blink',rand(1.5,3));
    // tap: pet; press and move: pick up
    let down=null;
    node.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,at:performance.now()};node.setPointerCapture(e.pointerId);e.preventDefault();});
    node.addEventListener('pointermove',e=>{if(!down)return;if(!p.held&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8){p.held=true;p.air=false;p.climb=null;setAct(p,'grab',99);}
      if(p.held){p.x=e.clientX-W/2;p.y=e.clientY+H*.2;place(p);}});
    const up=()=>{if(!down)return;const tap=!p.held&&performance.now()-down.at<400;down=null;
      if(p.held){p.held=false;p.air=true;p.vy=0;setAct(p,'grab',99);}else if(tap)pet(p);};
    node.addEventListener('pointerup',up);node.addEventListener('pointercancel',up);
    return p;
  }
  function setAct(p,act,seconds){p.act=act;p.until=performance.now()+seconds*1000;p.spr.dataset.act=act;p.node.dataset.act=act;}
  function pet(p){setAct(p,'pet',1.6);p.fx.replaceChildren();for(let i=0;i<3;i++){const h=document.createElement('i');h.className='mascot-heart';h.style.setProperty('--x',(i-1)*10+'px');h.style.animationDelay=(i*.25)+'s';p.fx.append(h);}}
  function place(p){p.node.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y-H)}px)`;
    const right=FACES_RIGHT[p.sheet]?p.dir>0:p.dir<0;p.flip.style.transform=(p.climb?`rotate(${p.climb.side>0?-90:90}deg) `:'')+(right?'':'scaleX(-1)');}
  // choose what to do next, a bit like a cat: mostly walk and sit, sometimes run, nap, stretch or climb
  function next(p){
    if(reduced()){setAct(p,Math.random()<.7?'blink':'sit',rand(3,6));return;}
    const r=Math.random();
    if(r<.3){p.dir=Math.random()<.5?-1:1;setAct(p,'walk',rand(3,7));}
    else if(r<.4){p.dir=Math.random()<.5?-1:1;setAct(p,'run',rand(1.2,2.4));}
    else if(r<.55)setAct(p,'sit',rand(3,6));
    else if(r<.65)setAct(p,'blink',rand(2,4));
    else if(r<.72)setAct(p,'stretch',2.2);
    else if(r<.8)setAct(p,'sleep',rand(6,12));
    else if(r<.86)setAct(p,'dangle',rand(3,6));
    else if(r<.92){setAct(p,'jump',1);p.air=true;p.vy=-260;}
    else{p.climb={side:p.x<innerWidth/2?-1:1,up:true,top:rand(160,innerHeight*.5)};p.x=p.climb.side<0?-8:innerWidth-W+8;setAct(p,'walk',99);}
  }
  function tick(now){
    raf=requestAnimationFrame(tick);const dt=Math.min(.05,(now-(last||now))/1000);last=now;if(!pets.length)return;
    const g=ground();
    for(const p of pets){
      if(p.held){place(p);continue;}
      if(p.climb){const c=p.climb;p.y+=(c.up?-40:40)*dt;if(c.up&&p.y<c.top)c.up=false;if(!c.up&&p.y>=g){p.climb=null;p.y=g;setAct(p,'sit',2);}place(p);continue;}
      if(p.air){p.vy+=900*dt;p.y+=p.vy*dt;if(p.act==='jump')p.x+=p.dir*60*dt;if(p.y>=g){p.y=g;p.air=false;p.vy=0;setAct(p,'sit',rand(1.5,3));}place(p);continue;}
      p.y=g;
      if(p.act==='walk'||p.act==='run'){const v=(p.act==='run'?70:26)*p.dir;p.x+=v*dt;
        if(p.x<4){p.x=4;p.dir=1;}if(p.x>innerWidth-W-4){p.x=innerWidth-W-4;p.dir=-1;}}
      if(now>p.until)next(p);
      place(p);
    }
  }
  return {
    // show these mascots (each {sheet, owner}); the same list keeps the same pets
    show(list){
      const key=list.map(m=>m.owner+':'+m.sheet).join(',');if(key===this._key)return;this._key=key;
      for(const p of pets)p.node.remove();pets=list.slice(0,4).map(make);
      if(pets.length&&!raf){last=0;raf=requestAnimationFrame(tick);}if(!pets.length){cancelAnimationFrame(raf);raf=0;}
    },
  };
}
