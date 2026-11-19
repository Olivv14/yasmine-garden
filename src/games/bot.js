// The toad plays air hockey: it defends the top goal (y=0) and strikes when the puck is slow on its side.
// Pure: given the table state it returns where its mallet goes next, never faster than its top speed.
import {TABLE,clampMallet} from './rules.js';

export const TOAD=Object.freeze({speed:1.15,home:.16});
// state: {puck:[x,y,vx,vy]}, mallet: [x,y] (the toad's), dt seconds; random adds a little hesitation.
export function toadMove(state,mallet,dt,random=Math.random){
  const [px,py,vx,vy]=state.puck,half=TABLE.h/2,gap=TABLE.mallet+TABLE.puck;
  const onMySide=py<half,slow=Math.hypot(vx,vy)<.9;
  let tx,ty;
  if(onMySide&&py<mallet[1]-.01){
    // the puck slipped behind: go round it, never through it towards its own goal
    tx=px+(px<TABLE.w/2?1:-1)*(gap+.02);ty=Math.max(TABLE.mallet,py-.05);
  }else if(onMySide&&(slow||py<half*.6)){
    // get behind the puck and push it towards the player's goal
    tx=px+(TABLE.w/2-px)*.15;ty=py-gap*.6;
  }else if(vy<0){
    // stand where the puck will cross the defence line (bouncing off the sides)
    let x=px+vx*Math.max(0,(TOAD.home-py)/vy);
    for(let i=0;i<4&&(x<0||x>TABLE.w);i++)x=x<0?-x:2*TABLE.w-x;
    tx=Math.min(TABLE.w,Math.max(0,x));ty=TOAD.home;
  }else{tx=TABLE.w/2+(px-TABLE.w/2)*.4;ty=TOAD.home;}
  tx+=(random()-.5)*.04;
  const dx=tx-mallet[0],dy=ty-mallet[1],dist=Math.hypot(dx,dy),step=TOAD.speed*dt;
  return clampMallet(dist<=step?[tx,ty]:[mallet[0]+dx/dist*step,mallet[1]+dy/dist*step],false);
}
