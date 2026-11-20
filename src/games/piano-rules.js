// Piano tiles, pure and testable (scripts/piano.test.mjs): find the beats of a song, turn them into falling tiles,
// and judge taps. Classic rules: tap the lowest tile, anywhere on it; hold a long tile until it ends; tapping an
// empty spot or letting a tile pass ends the game. Stars: one at a third of the song, two at two thirds, three at the end.
export const LANES=4;
export const PIANO=Object.freeze({minGap:.26,longAfter:.95,frame:1024,hop:512,lead:1.9});

// The beats (onsets) of a mono signal: energy flux over short frames, peaks over a moving threshold.
export function detectOnsets(samples,rate,{frame=PIANO.frame,hop=PIANO.hop,minGap=PIANO.minGap}={}){
  const n=Math.max(0,Math.floor((samples.length-frame)/hop)+1),energy=new Float64Array(n);
  for(let i=0;i<n;i++){let s=0;const o=i*hop;for(let k=0;k<frame;k++){const v=samples[o+k];s+=v*v;}energy[i]=Math.log(1e-9+s/frame);}
  const flux=new Float64Array(n);for(let i=1;i<n;i++)flux[i]=Math.max(0,energy[i]-energy[i-1]);
  const out=[],win=Math.max(4,Math.round(rate/hop*.5)),dt=hop/rate;let last=-Infinity;
  for(let i=1;i<n-1;i++){
    let sum=0,c=0;for(let k=Math.max(0,i-win);k<=Math.min(n-1,i+win);k++){sum+=flux[k];c++;}
    const threshold=sum/c*1.5+.05;
    if(flux[i]>threshold&&flux[i]>=flux[i-1]&&flux[i]>=flux[i+1]){const at=i*dt;if(at-last>=minGap){out.push(+at.toFixed(3));last=at;}}
  }
  return out;
}
// When a song has few clear beats, a steady grid at this tempo fills the gaps.
export function gridBeats(duration,bpm=100,start=1){const out=[],step=60/bpm;for(let t=start;t<duration-.5;t+=step)out.push(+t.toFixed(3));return out;}

// A small seeded random, so the same song gives the same tiles on both phones.
export function seeded(seed){let s=(seed>>>0)||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export const hashText=text=>{let h=2166136261;for(const ch of String(text))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h;};

// Tiles from beats: never two in the same lane in a row, a long tile when the next beat is far away.
export function chart(beats,duration,random=Math.random){
  const times=[];for(const b of [...beats].sort((a,b)=>a-b)){if(b<.8||b>duration-.3)continue;if(!times.length||b-times[times.length-1]>=PIANO.minGap)times.push(b);}
  // fill long silences with the song's own pace (or a gentle one), so nobody waits for nothing
  const filled=[];for(let i=0;i<times.length;i++){filled.push(times[i]);const gap=(times[i+1]??duration)-times[i];
    if(gap>2.6){for(let t=times[i]+1.2;t<(times[i+1]??duration-.4)-.8;t+=1.2)filled.push(+t.toFixed(3));}}
  const tiles=[];let lane=-1;
  for(let i=0;i<filled.length;i++){
    let next=Math.floor(random()*(LANES-1));if(next>=lane&&lane>=0)next++;if(lane<0)next=Math.floor(random()*LANES);lane=next;
    const gap=(filled[i+1]??duration)-filled[i];
    const len=gap>=PIANO.longAfter?+Math.min(2.4,gap-.32).toFixed(3):0;
    tiles.push({i,t:filled[i],lane,len});
  }
  return tiles;
}

// The game: which tile is next, taps, holds, misses and the score.
export function newRun(tiles,duration){return {tiles,duration,next:0,score:0,combo:0,best:0,holding:null,over:false,done:false,reason:null,at:0};}
export const stars=run=>{const p=run.done?1:Math.min(1,run.at/Math.max(1,run.duration));return run.done?3:p>=2/3?2:p>=1/3?1:0;};
export const progress=run=>Math.min(1,run.at/Math.max(1,run.duration));

// Geometry: a tile's bottom edge reaches the hit line at its time; speed in screen heights per second.
export function tileBox(tile,now,{height,hitY,speed,tileH}){
  const bottom=hitY+(now-tile.t)*speed*height,h=tileH+(tile.len?tile.len*speed*height:0);
  return {top:bottom-h,bottom,h};
}
// A tap at (lane, y) at time now. Returns what happened.
export function tap(run,lane,y,now,geo){
  if(run.over||run.done)return {kind:'ignored'};
  const tile=run.tiles[run.next];if(!tile){return {kind:'ignored'};}
  const box=tileBox(tile,now,geo),slack=geo.tileH*.35;
  if(lane===tile.lane&&y>=box.top-slack&&y<=box.bottom+slack&&box.bottom>=0){
    run.combo++;run.best=Math.max(run.best,run.combo);run.score+=1;
    if(tile.len){run.holding={i:tile.i,from:now,until:tile.t+tile.len};}else run.next++;
    if(run.next>=run.tiles.length&&!run.holding)run.done=true;
    return {kind:tile.len?'hold':'hit',tile};
  }
  // a tap on a tile further up the same lane while the lowest one is still there is a wrong tile too
  run.over=true;run.reason='wrong';return {kind:'miss',lane,y};
}
// Lifting the finger during a long tile: the part held counts, the tile is done.
export function release(run,now){
  const h=run.holding;if(!h)return 0;run.holding=null;
  const bonus=Math.max(0,Math.floor((Math.min(now,h.until)-h.from)/.25));run.score+=bonus;run.next++;
  if(run.next>=run.tiles.length)run.done=true;return bonus;
}
// Time passes: a held long tile finishes by itself; a tile that leaves the screen untouched ends the game.
export function advance(run,now,geo){
  run.at=now;if(run.over||run.done)return null;
  if(run.holding&&now>=run.holding.until)release(run,now);
  const tile=run.tiles[run.next];
  if(!tile){if(now>=run.duration-.2||run.next>=run.tiles.length){run.done=true;}return null;}
  if(!run.holding&&tileBox(tile,now,geo).top>geo.height){run.over=true;run.reason='passed';return {kind:'passed',tile};}
  return null;
}
