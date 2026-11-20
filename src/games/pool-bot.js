// The toad at the pool table. For every ball it may play and every pocket it finds the "ghost ball" (where the cue
// ball must touch it), keeps the shots whose two paths are clear, and plays the easiest one. The Dreamer misjudges
// its aim and sometimes picks a worse shot; the Champion aims almost perfectly and checks where the cue ball ends up.
import {POOL,POCKETS,targetsFor,freeSpot,strike,runShot,applyShot} from './pool-rules.js';

export const POOL_LEVELS=Object.freeze({
  easy:Object.freeze({aimError:.07,choice:4,lookahead:false}),
  medium:Object.freeze({aimError:.025,choice:2,lookahead:false}),
  hard:Object.freeze({aimError:.004,choice:1,lookahead:true}),
});
const R=POOL.r;
// distance from point p to segment a-b
function segDist([px,py],[ax,ay],[bx,by]){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));const x=ax+t*dx-px,y=ay+t*dy-py;return Math.sqrt(x*x+y*y);}
const clear=(balls,a,b,skip)=>balls.every(o=>o.in||skip.includes(o.n)||segDist([o.x,o.y],a,b)>=2*R*.98);
const norm=([x,y])=>{const n=Math.sqrt(x*x+y*y)||1;return [x/n,y/n];};
// rotate a unit vector by a small angle (only the bot uses trig; shots themselves are sent as vectors)
const turn=([x,y],a)=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];

export function candidateShots(state){
  const balls=state.balls,cue=balls.find(b=>b.n===0),targets=targetsFor(state),out=[];
  for(const n of targets){const ball=balls.find(b=>b.n===n);if(!ball||ball.in)continue;
    for(const p of POCKETS){
      // aim a little inside the pocket mouth
      const px=p.x+(p.x===0?1:p.x===1?-1:0)*R*.6,py=p.y+(p.y===0?1:p.y===2?-1:0)*R*.6;
      const toPocket=norm([px-ball.x,py-ball.y]),ghost=[ball.x-toPocket[0]*2*R,ball.y-toPocket[1]*2*R];
      const aim=norm([ghost[0]-cue.x,ghost[1]-cue.y]),cut=aim[0]*toPocket[0]+aim[1]*toPocket[1];
      if(cut<.26)continue;   // too thin
      if(!clear(balls,[cue.x,cue.y],ghost,[0,n])||!clear(balls,[ball.x,ball.y],[px,py],[n]))continue;
      const d1=Math.hypot(ghost[0]-cue.x,ghost[1]-cue.y),d2=Math.hypot(px-ball.x,py-ball.y);
      // side pockets are hard to reach at a steep angle
      const mouth=p.y===1?Math.abs(toPocket[0]):1;
      out.push({n,pocket:p,dir:aim,power:Math.min(.95,.22+(d1+d2)*.32/Math.max(.35,cut)),score:cut*cut*mouth/(d1+d2*1.4)});
    }}
  return out.sort((a,b)=>b.score-a.score);
}

// Pick a shot: {dir,power,spin, place?} (place = where to put the cue ball when it has ball in hand).
export function toadShot(state,level='medium',random=Math.random){
  const L=POOL_LEVELS[level]??POOL_LEVELS.medium;let place=null,s=state;
  if(state.ballInHand){
    // try a few spots and keep the one with the easiest shot
    let best=null;
    for(let k=0;k<40;k++){const x=R+random()*(POOL.w-2*R),y=R+random()*(POOL.h-2*R);if(!freeSpot(state.balls,x,y))continue;
      const balls=state.balls.map(b=>b.n===0?{...b,x,y,in:false}:b),c=candidateShots({...state,balls})[0];
      if(c&&(!best||c.score>best.score))best={x,y,score:c.score};}
    if(best){place=[best.x,best.y];s={...state,balls:state.balls.map(b=>b.n===0?{...b,x:best.x,y:best.y,in:false}:b)};}
  }
  let shots=candidateShots(s);
  if(L.lookahead&&shots.length>1){
    // the Champion plays the shot that pots and leaves another easy one
    shots=shots.slice(0,6).map(c=>{const r=runShot(strike(s.balls,c.dir,c.power,0)),next=applyShot(s,r);
      const ok=next.turn===s.turn&&!next.foul,follow=ok?(candidateShots(next)[0]?.score??0):-1;return {...c,score:(next.winner===s.turn?10:0)+(ok?1:0)+follow};})
      .sort((a,b)=>b.score-a.score);
  }
  if(!shots.length){
    // no clean pot: hit the nearest ball it may play, softly, so it is not a foul
    const cue=s.balls.find(b=>b.n===0),own=targetsFor(s).map(n=>s.balls.find(b=>b.n===n)).filter(b=>b&&!b.in)
      .sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y));
    const b=own[0]??s.balls.find(x=>x.n===8);
    return {dir:norm([b.x-cue.x,b.y-cue.y]),power:.45,spin:0,place};
  }
  const pick=shots[Math.min(shots.length-1,Math.floor(random()*L.choice))];
  return {dir:turn(pick.dir,(random()-.5)*2*L.aimError),power:pick.power,spin:0,place};
}
