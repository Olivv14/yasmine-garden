// Pool (8-ball) on a portrait table, pure and deterministic: the same shot from the same table gives the same
// result on both phones (only + - * / and sqrt in the physics, a fixed time step). Unit-tested in scripts/games.test.mjs.
// Units: the table is 1 wide and 2 long; y grows towards the player who breaks (the bottom of the screen).
export const POOL=Object.freeze({w:1,h:2,r:.026,pocketCorner:.06,pocketSide:.052,maxSpeed:4.6,decel:.42,cushion:.78,balls:.96,dt:1/240});
export const POCKETS=Object.freeze([[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]].map(([x,y])=>Object.freeze({x,y,r:y===1?POOL.pocketSide:POOL.pocketCorner})));
export const HEAD=Object.freeze([.5,1.5]);   // where the cue ball starts
const FOOT=[.5,.55];                         // the apex of the rack

export const groupOf=n=>n===0?'cue':n===8?'eight':n<8?'solids':'stripes';

// The rack: a triangle with the 8 in the middle of the third row and one solid and one stripe in the back corners.
export function rack(random=Math.random){
  const order=[1,9,2,10,8,3,11,4,12,5,13,6,14,7,15];
  // shuffle everything but the 8, then put a solid and a stripe in the two back corners
  const rest=order.filter(n=>n!==8);
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  const slots=[];const d=POOL.r*2.02,dy=d*.8660254;
  for(let row=0;row<5;row++)for(let k=0;k<=row;k++)slots.push([FOOT[0]+(k-row/2)*d,FOOT[1]-row*dy]);
  const byslot=new Array(15);byslot[4]=8;
  const corners=[10,14],solid=rest.find(n=>n<8),stripe=rest.find(n=>n>8);
  byslot[corners[0]]=solid;byslot[corners[1]]=stripe;
  const others=rest.filter(n=>n!==solid&&n!==stripe);let o=0;
  for(let i=0;i<15;i++)if(byslot[i]===undefined)byslot[i]=others[o++];
  return [{n:0,x:HEAD[0],y:HEAD[1],vx:0,vy:0,in:false},...byslot.map((n,i)=>({n,x:slots[i][0],y:slots[i][1],vx:0,vy:0,in:false}))];
}
export const clone=balls=>balls.map(b=>({...b}));
export const moving=balls=>balls.some(b=>!b.in&&(b.vx!==0||b.vy!==0));

// Can the cue ball go here (ball in hand)? On the table and touching nothing.
export function freeSpot(balls,x,y){
  const r=POOL.r;if(x<r||x>POOL.w-r||y<r||y>POOL.h-r)return false;
  return balls.every(b=>b.n===0||b.in||(b.x-x)*(b.x-x)+(b.y-y)*(b.y-y)>=4*r*r*1.01);
}

// Strike the cue ball: dir is a unit vector, power 0..1, spin -1 (draw) .. 1 (follow).
export function strike(balls,[dx,dy],power,spin=0){
  const out=clone(balls),cue=out.find(b=>b.n===0),n=Math.sqrt(dx*dx+dy*dy)||1,v=POOL.maxSpeed*Math.max(.04,Math.min(1,power));
  cue.vx=dx/n*v;cue.vy=dy/n*v;cue.spin=Math.max(-1,Math.min(1,spin));cue.spun=false;return out;
}

// One fixed step. Returns events in order: {hit:[a,b]}, {cushion:n}, {pocket:n}.
export function stepTable(balls,dt=POOL.dt){
  const ev=[],r=POOL.r;
  for(const b of balls){
    if(b.in||(b.vx===0&&b.vy===0))continue;
    const sp=Math.sqrt(b.vx*b.vx+b.vy*b.vy),drop=POOL.decel*dt;
    if(sp<=drop){b.vx=0;b.vy=0;continue;}
    const k=(sp-drop)/sp;b.vx*=k;b.vy*=k;b.x+=b.vx*dt;b.y+=b.vy*dt;
  }
  // pockets first: a ball whose centre falls inside a pocket mouth drops
  for(const b of balls){if(b.in)continue;
    for(const p of POCKETS){const dx=b.x-p.x,dy=b.y-p.y;if(dx*dx+dy*dy<p.r*p.r){b.in=true;b.vx=0;b.vy=0;ev.push({pocket:b.n});break;}}}
  // cushions
  for(const b of balls){if(b.in)continue;let hit=false;
    if(b.x<r){b.x=r;b.vx=-b.vx*POOL.cushion;hit=true;}else if(b.x>POOL.w-r){b.x=POOL.w-r;b.vx=-b.vx*POOL.cushion;hit=true;}
    if(b.y<r){b.y=r;b.vy=-b.vy*POOL.cushion;hit=true;}else if(b.y>POOL.h-r){b.y=POOL.h-r;b.vy=-b.vy*POOL.cushion;hit=true;}
    if(hit)ev.push({cushion:b.n});}
  // ball to ball
  for(let i=0;i<balls.length;i++){const a=balls[i];if(a.in)continue;
    for(let j=i+1;j<balls.length;j++){const b=balls[j];if(b.in)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,min=2*r;if(d2>=min*min||d2===0)continue;
      const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,overlap=(min-d)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
      const rel=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(rel<=0)continue;
      const cue=a.n===0?a:b.n===0?b:null,before=cue?[cue.vx,cue.vy]:null;
      const imp=rel*(1+POOL.balls)/2;a.vx-=imp*nx;a.vy-=imp*ny;b.vx+=imp*nx;b.vy+=imp*ny;
      // spin on the first contact: follow keeps rolling forward, draw comes back
      if(cue&&cue.spin&&!cue.spun){cue.spun=true;const s=Math.sqrt(before[0]*before[0]+before[1]*before[1])||1;
        cue.vx+=before[0]/s*rel*.55*cue.spin;cue.vy+=before[1]/s*rel*.55*cue.spin;}
      ev.push({hit:[a.n,b.n]});}}
  return ev;
}

// Run a shot to the end. Returns the final balls and a summary for the rules; frames (optional) every n steps for drawing.
export function runShot(balls,{every=0,maxSteps=240*40}={}){
  const b=clone(balls),frames=[];let first=null,cushionAfter=false,steps=0;const potted=[];
  while(moving(b)&&steps<maxSteps){
    for(const e of stepTable(b)){
      if(e.hit&&first===null&&(e.hit[0]===0||e.hit[1]===0))first=e.hit[0]===0?e.hit[1]:e.hit[0];
      if(e.cushion!==undefined&&first!==null)cushionAfter=true;
      if(e.pocket!==undefined)potted.push(e.pocket);
    }
    steps++;if(every&&steps%every===0)frames.push(clone(b));
  }
  for(const x of b){x.vx=0;x.vy=0;delete x.spin;delete x.spun;}
  return {balls:b,first,potted,cushionAfter,frames,steps};
}

// 8-ball. state: {balls, turn:0|1, groups:[null|'solids'|'stripes', ...], ballInHand:bool, winner:null|0|1, foul:null|string, broken:bool}
export function newGame(random=Math.random,starter=0){return {balls:rack(random),turn:starter,groups:[null,null],ballInHand:false,winner:null,foul:null,broken:false,last:null};}
export const left=(balls,group)=>balls.filter(b=>!b.in&&groupOf(b.n)===group).length;
export function targetsFor(state,player=state.turn){
  const g=state.groups[player];if(!g)return state.balls.filter(b=>!b.in&&b.n!==0&&b.n!==8).map(b=>b.n);
  const mine=state.balls.filter(b=>!b.in&&groupOf(b.n)===g).map(b=>b.n);return mine.length?mine:[8];
}
// Apply a finished shot. result from runShot (run from state.balls).
export function applyShot(state,result){
  const me=state.turn,other=1-me,next={...state,balls:result.balls,foul:null,ballInHand:false,broken:true,last:{first:result.first,potted:result.potted}};
  const groups=[...state.groups];const targets=targetsFor(state,me),cleared=state.groups[me]&&targets.length===1&&targets[0]===8;
  let foul=null;
  if(result.potted.includes(0))foul='scratch';
  else if(result.first===null)foul='miss';
  else if(state.groups[me]&&!targets.includes(result.first))foul='wrongBall';
  else if(!state.groups[me]&&result.first===8)foul='wrongBall';
  // the 8 decides the game
  if(result.potted.includes(8)){
    next.winner=state.broken&&cleared&&!foul?me:other;next.foul=foul;next.groups=groups;return next;
  }
  // open table: the first ball of a group potted without a foul decides
  const pottedBalls=result.potted.filter(n=>n!==0&&n!==8);
  if(!groups[me]&&state.broken&&!foul&&pottedBalls.length){const g=groupOf(pottedBalls[0]);groups[me]=g;groups[other]=g==='solids'?'stripes':'solids';}
  next.groups=groups;
  const scoredOwn=groups[me]?pottedBalls.some(n=>groupOf(n)===groups[me]):pottedBalls.length>0;
  if(foul){next.foul=foul;next.turn=other;next.ballInHand=true;
    if(result.potted.includes(0)){const cue=next.balls.find(b=>b.n===0);cue.in=false;cue.x=HEAD[0];cue.y=HEAD[1];
      if(!freeSpot(next.balls,cue.x,cue.y))for(let k=1;k<40;k++){if(freeSpot(next.balls,cue.x,HEAD[1]+k*.01*(k%2?1:-1)*Math.ceil(k/2))){cue.y=HEAD[1]+k*.01*(k%2?1:-1)*Math.ceil(k/2);break;}}}
  }else next.turn=scoredOwn?me:other;
  return next;
}

// Light, comparable fingerprint of a table (both phones check they agree after a live shot).
export const tableKey=balls=>balls.map(b=>b.in?b.n+':in':b.n+':'+b.x.toFixed(4)+','+b.y.toFixed(4)).join('|');
