// The toad plays air hockey: it defends the top goal (y=0) and strikes from its own half.
// Three rivals: the Dreamer (easy: slow, late, misreads the puck), the Coach (medium) and the Champion
// (hard: fast, reads every bounce, and aims its shots at the open side of your goal).
// Pure: given the table state it returns where its mallet goes next, never faster than its top speed.
import {TABLE,clampMallet} from './rules.js';

export const TOAD_LEVELS=Object.freeze({
  easy:Object.freeze({speed:.62,noise:.14,think:.3,home:.14,aim:false,wander:.16}),
  medium:Object.freeze({speed:1.15,noise:.04,think:0,home:.16,aim:false}),
  hard:Object.freeze({speed:2.05,noise:0,think:0,home:.2,aim:true}),
});
export const TOAD=TOAD_LEVELS.medium;
const LEVEL_IDS=Object.keys(TOAD_LEVELS);
export const levelOrDefault=l=>LEVEL_IDS.includes(l)?l:'medium';

// Where a puck crosses height y, bouncing off the side walls (null if it is not heading there).
export function crossing([px,py,vx,vy],y){
  if(vy===0||(y-py)/vy<0)return null;
  let x=px+vx*(y-py)/vy;const lo=TABLE.puck,hi=TABLE.w-TABLE.puck,span=hi-lo;
  x=((x-lo)%(2*span)+2*span)%(2*span);return lo+(x>span?2*span-x:x);
}
const toward=(mallet,[tx,ty],speed,dt)=>{const dx=tx-mallet[0],dy=ty-mallet[1],dist=Math.hypot(dx,dy),step=speed*dt;
  return clampMallet(dist<=step?[tx,ty]:[mallet[0]+dx/dist*step,mallet[1]+dy/dist*step],false);};

// The Champion's shot: pick the side of the player's goal away from the player's mallet, and come at the puck
// from behind along that line; once close enough, drive straight through it.
function strike(puck,mallet,player){
  const [px,py]=puck,gap=TABLE.mallet+TABLE.puck,goalY=TABLE.h;
  const side=player?(player[0]<TABLE.w/2?1:-1):(px<TABLE.w/2?1:-1);
  const aimX=TABLE.w/2+side*TABLE.goal*.32;
  // bank it off the wall when the straight line is covered
  const straightBlocked=player&&Math.abs(player[0]-(px+(aimX-px)*((player[1]-py)/(goalY-py))))<TABLE.mallet*1.2;
  const tx=straightBlocked?(side>0?TABLE.w*2-aimX:-aimX):aimX;
  let dx=tx-px,dy=goalY-py;const n=Math.hypot(dx,dy);dx/=n;dy/=n;
  const behind=[px-dx*gap*.95,py-dy*gap*.95];
  const lined=Math.hypot(mallet[0]-behind[0],mallet[1]-behind[1])<.035;
  return lined?[px+dx*.12,py+dy*.12]:behind;
}

// state: {puck:[x,y,vx,vy]}, mallet: [x,y] (the toad's), dt seconds, random for hesitation,
// level id, memo: a small object kept between calls (the Dreamer only rethinks every few tenths of a second),
// player: the player's mallet (the Champion shoots away from it).
export function toadMove(state,mallet,dt,random=Math.random,level='medium',memo=null,player=null){
  const L=TOAD_LEVELS[levelOrDefault(level)];
  let puck=state.puck;
  if(L.think&&memo){memo.age=(memo.age??Infinity)+dt;if(!memo.seen||memo.age>=L.think){memo.seen=[...puck];memo.age=0;}else puck=memo.seen;}
  const [px,py,vx,vy]=puck,half=TABLE.h/2,gap=TABLE.mallet+TABLE.puck;
  const onMySide=py<half,slow=Math.hypot(vx,vy)<.9;
  let target;
  if(onMySide&&py<mallet[1]-.01){
    // the puck slipped behind: go round it, never through it towards its own goal
    target=[px+(px<TABLE.w/2?1:-1)*(gap+.02),Math.max(TABLE.mallet,py-.05)];
  }else if(onMySide&&(slow||py<half*.6||L.aim)){
    target=L.aim?strike(puck,mallet,player):[px+(TABLE.w/2-px)*.15,py-gap*.6];
  }else if(vy<0){
    // stand where the puck will cross the defence line
    const x=crossing(puck,L.home)??px;
    target=[Math.min(TABLE.w,Math.max(0,x)),L.home];
  }else{
    // the puck is on the player's side: shade between it and the middle of the goal
    target=[TABLE.w/2+(px-TABLE.w/2)*(L.aim?.55:.4),L.home];
  }
  if(L.wander&&memo){memo.clock=(memo.clock??0)+dt;target[0]+=Math.sin(memo.clock*1.1)*L.wander;}   // the Dreamer drifts off
  target[0]+=(random()-.5)*L.noise;
  return toward(mallet,target,L.speed,dt);
}
