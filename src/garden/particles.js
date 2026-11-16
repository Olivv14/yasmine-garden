// One canvas for everything that moves freely: fireflies (night), butterflies (day), petals, drops, soil.
import {reducedMotion} from '../design/motion.js';

const css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim()||'#fff';
export class Particles{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.ambient=[];this.bursts=[];this.mode='night';this.count=0;this.frame=0;this.last=0;this.colors={};this.running=false;this.tick=this.tick.bind(this);this.readColors();}
  readColors(){this.colors={lantern:css('--garden-lantern'),rose:css('--garden-rose'),lav:css('--garden-lavender'),jas:css('--garden-jasmine'),mari:css('--garden-marigold'),orch:css('--garden-orchid'),sea:css('--garden-sea'),soil:css('--garden-terracotta')};}
  resize(w,h){const dpr=Math.min(2,window.devicePixelRatio||1);this.w=w;this.h=h;this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.seed();}
  setAmbient(mode,extra=0){this.mode=mode;this.count=(mode==='day'?3:7)+extra;this.readColors();this.seed();this.start();}
  seed(){if(!this.w)return;this.ambient=Array.from({length:this.count},(_,i)=>({x:Math.random()*this.w,y:this.h*(.35+Math.random()*.5),vx:(Math.random()-.5)*.02,vy:(Math.random()-.5)*.012,phase:Math.random()*6.28,hue:i%3}));}
  burst(kind,x,y,n=14){
    if(reducedMotion())return;
    const palette={petals:[this.colors.rose,this.colors.lav,this.colors.jas,this.colors.mari,this.colors.orch],drops:[this.colors.sea,this.colors.jas],soil:[this.colors.soil]}[kind]??[this.colors.jas];
    for(let i=0;i<n;i++){const a=kind==='drops'?Math.PI/2+(Math.random()-.5)*.6:Math.random()*6.28,sp=kind==='drops'?.12+Math.random()*.08:.04+Math.random()*.1;
      this.bursts.push({kind,x:x+(kind==='drops'?(Math.random()-.5)*18:0),y:y-(kind==='drops'?40:0),vx:Math.cos(a)*sp*(kind==='drops'?.2:1),vy:kind==='drops'?sp:Math.sin(a)*sp-.06,life:0,max:kind==='petals'?1600:900,rot:Math.random()*6,color:palette[i%palette.length]});}
    this.start();
  }
  start(){if(this.running||reducedMotion())return;this.running=true;this.last=performance.now();requestAnimationFrame(this.tick);}
  stop(){this.running=false;this.ctx.clearRect(0,0,this.w||0,this.h||0);}
  tick(now){
    if(!this.running)return;
    const dt=Math.min(48,now-this.last);this.last=now;const c=this.ctx;c.clearRect(0,0,this.w,this.h);
    if(reducedMotion()){this.stop();return;}
    for(const p of this.ambient){p.phase+=dt*.002;p.x+=p.vx*dt+Math.sin(p.phase*.7)*.15;p.y+=p.vy*dt+Math.cos(p.phase)*.12;if(p.x<-10)p.x=this.w+10;if(p.x>this.w+10)p.x=-10;if(p.y<this.h*.25||p.y>this.h*.95)p.vy*=-1;
      if(this.mode==='day'){const flap=Math.abs(Math.sin(p.phase*4));c.fillStyle=[this.colors.mari,this.colors.lav,this.colors.jas][p.hue];c.globalAlpha=.85;c.beginPath();c.ellipse(p.x-3*flap,p.y,4*flap+.6,3,-.4,0,6.28);c.ellipse(p.x+3*flap,p.y,4*flap+.6,3,.4,0,6.28);c.fill();}
      else{const glow=.45+.55*Math.abs(Math.sin(p.phase*1.3));const gr=c.createRadialGradient(p.x,p.y,0,p.x,p.y,9);gr.addColorStop(0,this.colors.lantern);gr.addColorStop(1,'transparent');c.globalAlpha=glow;c.fillStyle=gr;c.beginPath();c.arc(p.x,p.y,9,0,6.28);c.fill();c.globalAlpha=1;c.fillStyle=this.colors.lantern;c.beginPath();c.arc(p.x,p.y,1.4,0,6.28);c.fill();}}
    this.bursts=this.bursts.filter(p=>(p.life+=dt)<p.max);
    for(const p of this.bursts){p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.kind==='petals'){p.vy+=.00006*dt;p.vx+=Math.sin(p.life*.004)*.002;}p.rot+=dt*.004;c.globalAlpha=1-p.life/p.max;c.fillStyle=p.color;c.beginPath();
      if(p.kind==='drops')c.ellipse(p.x,p.y,1.6,3.2,0,0,6.28);else if(p.kind==='soil')c.arc(p.x,p.y,2,0,6.28);else c.ellipse(p.x,p.y,3.4,1.8,p.rot,0,6.28);c.fill();}
    c.globalAlpha=1;requestAnimationFrame(this.tick);
  }
}
