// Pure game rules (no DOM), unit-tested in scripts/games.test.mjs.
export const TRUTHS=Object.freeze(Array.from({length:10},(_,i)=>'t'+String(i+1).padStart(2,'0')));
export const DARES=Object.freeze(Array.from({length:10},(_,i)=>'d'+String(i+1).padStart(2,'0')));
export const cardKey=id=>(id[0]==='t'?'game.truth.':'game.dare.')+id;
const byTime=(a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id));

// The current truth-or-dare game is every turn after the last finish.
export function currentTruthDare(events=[]){
  const td=events.filter(e=>e.game==='truth_dare').sort(byTime);
  const lastFinish=td.map(e=>e.kind).lastIndexOf('finish');
  return td.slice(lastFinish+1);
}
// Anyone may start; afterwards turns alternate.
export function whoseTurn(turns,me){if(!turns.length)return 'anyone';return turns[turns.length-1].profile_id===me?'partner':'me';}
// Draw a card not yet used in this game (all used: start over), with an injectable random source.
export function drawCard(kind,turns,random=Math.random){
  const deck=kind==='truth'?TRUTHS:DARES,used=new Set(turns.map(t=>t.card_id));
  const left=deck.filter(id=>!used.has(id)),pool=left.length?left:deck;
  return pool[Math.floor(random()*pool.length)%pool.length];
}
export function finishedGames(events=[]){return events.filter(e=>e.kind==='finish').sort(byTime).reverse();}

// Air hockey physics in the host's frame: table 1 wide, 1.6 long; host defends y=1.6, guest y=0.
export const TABLE=Object.freeze({w:1,h:1.6,puck:.045,mallet:.075,goal:.36,maxSpeed:2.4,win:5});
export function clampMallet([x,y],host){
  const r=TABLE.mallet,half=TABLE.h/2;
  return [Math.min(TABLE.w-r,Math.max(r,x)),host?Math.min(TABLE.h-r,Math.max(half+r,y)):Math.min(half-r,Math.max(r,y))];
}
// One physics step. Returns {puck, scored: 'host'|'guest'|null}. Mallet velocities come from their last move.
export function step(puck,mallets,dt){
  let [x,y,vx,vy]=puck;const r=TABLE.puck;
  const friction=Math.pow(.6,dt);vx*=friction;vy*=friction;
  x+=vx*dt;y+=vy*dt;
  if(x<r){x=r;vx=Math.abs(vx);}if(x>TABLE.w-r){x=TABLE.w-r;vx=-Math.abs(vx);}
  const inGoal=Math.abs(x-TABLE.w/2)<TABLE.goal/2;
  if(y<r){if(inGoal&&y<-r)return {puck:[x,y,vx,vy],scored:'host'};if(!inGoal){y=r;vy=Math.abs(vy);}}
  if(y>TABLE.h-r){if(inGoal&&y>TABLE.h+r)return {puck:[x,y,vx,vy],scored:'guest'};if(!inGoal){y=TABLE.h-r;vy=-Math.abs(vy);}}
  for(const m of mallets){
    const dx=x-m.x,dy=y-m.y,dist=Math.hypot(dx,dy),min=r+TABLE.mallet;
    if(dist>0&&dist<min){const nx=dx/dist,ny=dy/dist;x=m.x+nx*min;y=m.y+ny*min;
      const rel=(vx-m.vx)*nx+(vy-m.vy)*ny;if(rel<0){vx-=1.9*rel*nx;vy-=1.9*rel*ny;}vx+=m.vx*.35;vy+=m.vy*.35;}
  }
  const speed=Math.hypot(vx,vy);if(speed>TABLE.maxSpeed){vx*=TABLE.maxSpeed/speed;vy*=TABLE.maxSpeed/speed;}
  return {puck:[x,y,vx,vy],scored:null};
}
// After a goal the puck starts on the side of whoever conceded.
export const servePuck=conceded=>[TABLE.w/2,conceded==='host'?TABLE.h*.62:TABLE.h*.38,0,0];
// Turns played in each finished truth-or-dare game, keyed by the finish event id.
export function turnsPerFinish(events=[]){
  const out=new Map();let n=0;
  for(const e of events.filter(x=>x.game==='truth_dare').sort(byTime)){if(e.kind==='finish'){out.set(e.id,n);n=0;}else n++;}
  return out;
}
