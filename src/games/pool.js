// Pool at dusk, played with your finger: drag on the table to aim (the cue follows), pull the cue handle back to set
// the power and let go to shoot; tap the little cue ball for follow or draw. Against the toad on this phone, or live
// with your partner on the private "pair:<id>:play" channel: shots are sent as a direction and a power, and both
// phones run the same deterministic physics (pool-rules.js); a fingerprint check resyncs if they ever differ.
import {POOL,POCKETS,HEAD,newGame,strike,runShot,applyShot,freeSpot,groupOf,targetsFor,tableKey,left} from './pool-rules.js';
import {toadShot} from './pool-bot.js';
import {levelOrDefault} from './bot.js';
import {createToadPicker,toadArt} from './toads.js';
import {icon} from '../design/icons.js';

const COLORS={1:'#F2C42A',2:'#2A5AC8',3:'#D8302A',4:'#6A3AA8',5:'#E87A2A',6:'#2A8A4A',7:'#8A2A2A',8:'#141414'};
const colorOf=n=>COLORS[n>8?n-8:n]??'#FFFFFF';

export function createPool({el,button,t,copy,getClient,pairId,me,isHost,partner,person,tones,record,photo=()=>null}){
  const root=el('article',undefined,'card game-card pool-card');root.id='pool';
  const head=el('div',undefined,'game-head');head.append(icon('pool',22),el('h3',()=>t('pool.title'),'title'));
  const intro=el('p',()=>t('pool.intro'),'small');
  const status=el('p',undefined,'body-strong');status.setAttribute('role','status');status.id='poolStatus';
  const board=el('div',undefined,'pool-board');board.hidden=true;
  const sideEl=()=>{const s=el('div',undefined,'pb-side');const face=el('span',undefined,'hb-face');const name=el('b',undefined,'pb-name');const rack=el('span',undefined,'pb-rack');s.append(face,name,rack);return {s,face,name,rack};};
  const sides=[sideEl(),sideEl()];board.append(sides[0].s,sides[1].s);
  const canvas=document.createElement('canvas');canvas.className='pool-table';canvas.tabIndex=0;canvas.hidden=true;canvas.setAttribute('role','img');
  copy(canvas,()=>t('pool.canvas'),'aria-label');
  // the cue handle: drag it down (or left) to pull back, let go to shoot
  const controls=el('div',undefined,'pool-controls');controls.hidden=true;
  const handle=el('div',undefined,'pool-pull');handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax','100');
  copy(handle,()=>t('pool.pull'),'aria-label');
  const stick=el('span',undefined,'pool-stick'),meter=el('span',undefined,'pool-meter');handle.append(meter,stick);
  const spinPad=button(undefined,()=>{},'pool-spin');copy(spinPad,()=>t('pool.spin'),'aria-label');const spinDot=el('span',undefined,'pool-spin-dot');spinPad.append(spinDot);
  const shoot=button(()=>t('pool.shoot'),()=>fire(),'pool-shoot');
  controls.append(spinPad,handle,shoot);
  const join=button(()=>t('pool.join'),()=>startLive(),'primary');join.id='poolJoin';
  const bot=button(()=>t('pool.bot'),()=>{picker.hidden=!picker.hidden;},'');bot.id='poolBot';
  const picker=createToadPicker({el,button,t,copy,choose:l=>startBot(l)});picker.hidden=true;
  const leave=button(()=>t('pool.leave'),()=>stop(),'quiet');leave.hidden=true;
  const again=button(()=>t('pool.again'),()=>{if(mode==='bot')newRack();else{newRack();send('state',{state:game});}},'');again.hidden=true;
  const starts=el('div',undefined,'game-actions');starts.append(join,bot);
  root.append(head,intro,status,board,canvas,controls,starts,picker,again,leave);

  // mode: null | 'bot' | 'live'. game: pool-rules state. mySeat: 0 or 1 (seat 0 breaks the first rack).
  let mode=null,level='medium',game=null,mySeat=0,channel=null,live=false,anim=null,raf=0,aim=[0,-1],power=0,spin=0,recorded=null,dragging=null,busy=false;
  const ctx=canvas.getContext('2d');
  const myTurn=()=>!!game&&game.winner===null&&game.turn===mySeat&&!anim&&!busy&&(mode==='bot'||live);
  const say=fn=>copy(status,fn);

  function newRack(){game=newGame(Math.random,game?1-game.lastStarter:0);game.lastStarter=game.turn;recorded=null;again.hidden=true;aimAtRack();paint();draw();}
  function aimAtRack(){const cue=game.balls.find(b=>b.n===0);const t8=game.balls.find(b=>b.n===8);aim=norm([t8.x-cue.x,t8.y-cue.y]);}
  function startBot(choice){stop(false);mode='bot';level=levelOrDefault(choice);mySeat=0;game=null;newRack();playing(true);live=true;canvas.hidden=false;controls.hidden=false;resize();loop();turnPrompt();canvas.scrollIntoView?.({block:'center',behavior:'smooth'});}
  function stop(clear=true){cancelAnimationFrame(raf);raf=0;anim=null;busy=false;const ch=channel;channel=null;live=false;if(ch)getClient()?.removeChannel(ch);
    canvas.hidden=true;controls.hidden=true;board.hidden=true;playing(false);again.hidden=true;game=null;mode=null;if(clear)copy(status,'');}
  function playing(on){starts.hidden=on;picker.hidden=true;leave.hidden=!on;document.documentElement.classList.toggle('hockey-on',on);}

  // Live: seat 0 is the member with slot 1; the host sends the table to a newcomer.
  async function startLive(){
    const client=getClient();if(!client||!pairId())return;stop(false);mode='live';mySeat=isHost()?0:1;join.disabled=true;say(()=>t('common.loading'));
    try{await client.realtime.setAuth();}catch{}
    channel=client.channel('pair:'+pairId()+':play',{config:{private:true,broadcast:{self:false},presence:{key:me()}}});
    channel.on('presence',{event:'sync'},()=>{const on=Object.keys(channel.presenceState()).some(k=>k!==me());setLive(on);})
      .on('broadcast',{event:'state'},({payload})=>{if(payload?.state){game=payload.state;anim=null;busy=false;recorded=null;again.hidden=game.winner===null;paint();draw();turnPrompt();}})
      .on('broadcast',{event:'shot'},({payload})=>receiveShot(payload))
      .on('broadcast',{event:'sync'},()=>{if(game)send('state',{state:game});})
      .on('broadcast',{event:'aim'},({payload})=>{if(game&&game.turn!==mySeat&&Array.isArray(payload?.aim)){theirAim=payload.aim;}})
      .subscribe(async st=>{
        if(st==='SUBSCRIBED'){await channel.track({at:Date.now()});playing(true);join.disabled=false;setLive(false);}
        else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){say(()=>t('pool.offline'));join.disabled=false;stop(false);}
      });
  }
  let theirAim=null;
  function setLive(on){live=on;canvas.hidden=!on;controls.hidden=!on;
    if(on){if(mySeat===0&&!game)newRack();if(mySeat===0&&game)send('state',{state:game});else if(!game)send('sync',{});resize();loop();turnPrompt();canvas.scrollIntoView?.({block:'center'});}
    else say(()=>t('pool.waiting',{name:person(partner())}));}
  function send(event,payload){channel?.send({type:'broadcast',event,payload}).catch(()=>{});}
  function receiveShot(p){
    if(!game||!p?.shot)return;
    if(p.before!==tableKey(game.balls)){send('sync',{});return;}
    play(p.shot,false,p.after);
  }

  // Shooting
  function fire(){
    if(!myTurn()||power<.03)return;
    const shot={dir:aim,power,spin,place:game.ballInHand?cuePos():null};
    if(mode==='live'){const before=tableKey(game.balls);const after=preview(shot);send('shot',{before,shot,after});}
    power=0;paintPower();play(shot,true);
  }
  const cuePos=()=>{const c=game.balls.find(b=>b.n===0);return [c.x,c.y];};
  function withPlace(state,place){return place?{...state,balls:state.balls.map(b=>b.n===0?{...b,x:place[0],y:place[1],in:false}:b)}:state;}
  function preview(shot){const s=withPlace(game,shot.place);return tableKey(runShot(strike(s.balls,shot.dir,shot.power,shot.spin)).balls);}
  function play(shot,mine,expected){
    const s=withPlace(game,shot.place);const r=runShot(strike(s.balls,shot.dir,shot.power,shot.spin),{every:4});
    if(expected&&tableKey(r.balls)!==expected){send('sync',{});}
    anim={frames:r.frames,i:0,done:()=>{game=applyShot(s,r);anim=null;afterShot(mine);}};
  }
  function afterShot(){
    paint();canvas.dataset.k=tableKey(game.balls).length+':'+hash(tableKey(game.balls));
    if(game.winner!==null){finished();return;}
    if(game.turn===mySeat)aimAtNearest();
    turnPrompt();
  }
  function aimAtNearest(){const cue=game.balls.find(b=>b.n===0),own=targetsFor(game,mySeat).map(n=>game.balls.find(b=>b.n===n)).filter(Boolean)
    .sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y));if(own[0])aim=norm([own[0].x-cue.x,own[0].y-cue.y]);}
  function turnPrompt(){
    if(!game)return;
    if(game.winner!==null)return;
    const foulKey=game.foul?'pool.foul.'+game.foul:null;
    if(game.turn===mySeat){say(()=>(foulKey?t(foulKey)+' ':'')+(game.ballInHand?t('pool.ballInHand'):t('pool.yourTurn')));}
    else if(mode==='bot'){say(()=>(foulKey?t(foulKey)+' ':'')+t('pool.toadTurn'));busy=true;setTimeout(toadTurn,900);}
    else say(()=>(foulKey?t(foulKey)+' ':'')+t('pool.theirTurn',{name:person(partner())}));
  }
  function toadTurn(){
    if(mode!=='bot'||!game||game.winner!==null||game.turn===mySeat){busy=false;return;}
    const shot=toadShot(game,level);
    // show the toad lining up for a moment, then shoot
    if(shot.place)game=withPlace(game,shot.place);
    theirAim=shot.dir;let k=0;const pull=setInterval(()=>{k++;toadPull=k/12*shot.power;if(k>=12){clearInterval(pull);toadPull=0;theirAim=null;busy=false;play(shot,false);}},55);
  }
  let toadPull=0;
  function finished(){
    const won=game.winner===mySeat;again.hidden=false;
    say(()=>won?t('pool.won'):mode==='bot'?t('pool.toadWon'):t('pool.lost',{name:person(partner())}));
    if(!recorded&&(mode==='bot'||mySeat===0)){recorded=crypto.randomUUID();
      const meWon=mode==='bot'?won:game.winner===0;record({id:recorded,game:mode==='bot'?'pool_bot':'pool',kind:'finish',scoreMe:meWon?1:0,scorePartner:meWon?0:1});}
  }

  // The scoreboard: faces, whose turn, and each player's balls still on the table.
  function paint(){
    if(!game){board.hidden=true;return;}board.hidden=false;
    const seats=[mySeat,1-mySeat];
    seats.forEach((seat,i)=>{const s=sides[i];const isMe=seat===mySeat;s.s.classList.toggle('on',game.turn===seat&&game.winner===null);
      s.face.replaceChildren();s.face.className='hb-face '+(isMe?'tone-'+tones().me:mode==='bot'?'tone-success':'tone-'+tones().partner);
      if(!isMe&&mode==='bot')s.face.append(toadArt(level));
      else{const src=photo(isMe?me():partner());if(src){const img=document.createElement('img');img.src=src;img.alt='';s.face.append(img);}else s.face.textContent=(person(isMe?me():partner())||'?').charAt(0).toUpperCase();}
      copy(s.name,()=>isMe?t('pool.you'):mode==='bot'?t('game.hockey.level.'+level+'.name'):person(partner()));
      s.rack.replaceChildren();const g=game.groups[seat];
      if(g){const nums=g==='solids'?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15];
        for(const n of nums){const dot=el('i',undefined,'pb-ball'+(n>8?' stripe':''));dot.style.setProperty('--c',colorOf(n));if(game.balls.find(b=>b.n===n)?.in)dot.classList.add('in');s.rack.append(dot);}
        copy(s.rack,()=>t('pool.group.'+g)+': '+left(game.balls,g),'aria-label');}
      else{copy(s.rack,'','aria-label');s.rack.append(el('small',()=>t('pool.open')));}
    });
  }

  // Input: aim by dragging on the table; with ball in hand, drag the cue ball itself to place it.
  const toTable=e=>{const r=canvas.getBoundingClientRect(),g=geo();return [(e.clientX-r.left-g.ox)/g.S,(e.clientY-r.top-g.oy)/g.S];};
  canvas.addEventListener('pointerdown',e=>{if(!myTurn())return;canvas.setPointerCapture(e.pointerId);const p=toTable(e),c=cuePos();
    dragging=game.ballInHand&&Math.hypot(p[0]-c[0],p[1]-c[1])<POOL.r*3?'cue':'aim';move(p);});
  canvas.addEventListener('pointermove',e=>{if(dragging)move(toTable(e));});
  canvas.addEventListener('pointerup',()=>{dragging=null;if(mode==='live')send('aim',{aim});});
  function move(p){const c=cuePos();
    if(dragging==='cue'){if(freeSpot(game.balls,p[0],p[1]))game={...game,balls:game.balls.map(b=>b.n===0?{...b,x:p[0],y:p[1]}:b)};return;}
    const d=norm([p[0]-c[0],p[1]-c[1]]);if(Math.hypot(p[0]-c[0],p[1]-c[1])>POOL.r)aim=d;}
  canvas.addEventListener('keydown',e=>{if(!myTurn())return;const a=e.key==='ArrowLeft'?-.02:e.key==='ArrowRight'?.02:0;
    if(a){e.preventDefault();aim=norm([aim[0]*Math.cos(a)-aim[1]*Math.sin(a),aim[0]*Math.sin(a)+aim[1]*Math.cos(a)]);}});
  canvas.style.touchAction='none';
  // pull the cue: drag down along the handle; let go to shoot
  let pullStart=null;
  handle.addEventListener('pointerdown',e=>{if(!myTurn())return;handle.setPointerCapture(e.pointerId);pullStart=e.clientY;});
  handle.addEventListener('pointermove',e=>{if(pullStart===null)return;power=Math.max(0,Math.min(1,(e.clientY-pullStart)/140));paintPower();});
  handle.addEventListener('pointerup',()=>{if(pullStart===null)return;pullStart=null;if(power>.03)fire();else{power=0;paintPower();}});
  handle.addEventListener('keydown',e=>{if(!myTurn())return;if(e.key==='ArrowDown'||e.key==='ArrowRight'){power=Math.min(1,power+.05);paintPower();e.preventDefault();}
    if(e.key==='ArrowUp'||e.key==='ArrowLeft'){power=Math.max(0,power-.05);paintPower();e.preventDefault();}if(e.key==='Enter'||e.key===' '){fire();e.preventDefault();}});
  handle.style.touchAction='none';
  spinPad.addEventListener('pointerdown',e=>{const r=spinPad.getBoundingClientRect();spin=Math.max(-1,Math.min(1,-((e.clientY-r.top)/r.height-.5)*2.4));if(Math.abs(spin)<.2)spin=0;paintSpin();});
  function paintPower(){handle.style.setProperty('--p',power);handle.setAttribute('aria-valuenow',String(Math.round(power*100)));}
  function paintSpin(){spinDot.style.setProperty('--s',spin);copy(spinPad,()=>t('pool.spin')+': '+t(spin>0?'pool.spin.follow':spin<0?'pool.spin.draw':'pool.spin.center'),'aria-label');}
  paintPower();paintSpin();

  // Drawing
  function geo(){const w=canvas._w,h=canvas._h,rail=w*.07,S=(w-2*rail)/POOL.w;return {w,h,rail,S,ox:rail,oy:(h-POOL.h*S)/2};}
  function resize(){
    const maxW=Math.min(root.clientWidth-2,400),maxH=Math.max(320,(innerHeight||800)*.52);
    let w=maxW;const ratio=.86*POOL.h/POOL.w+.14;if(w*ratio>maxH)w=maxH/ratio;const h=w*ratio;
    const dpr=Math.min(2,devicePixelRatio||1);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);canvas._w=w;canvas._h=h;draw();}
  new ResizeObserver(()=>{if(game)resize();}).observe(root);
  function loop(){cancelAnimationFrame(raf);const tick=()=>{raf=requestAnimationFrame(tick);
    if(anim){const f=anim.frames[anim.i];if(f){anim.view=f;anim.i++;}else{const done=anim.done;anim=null;done();}}draw();};raf=requestAnimationFrame(tick);}
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function draw(){
    if(!canvas._w||!game)return;const {w,h,rail,S,ox,oy}=geo(),P=([x,y])=>[ox+x*S,oy+y*S];
    ctx.clearRect(0,0,w,h);
    const wood=ctx.createLinearGradient(0,0,w,h);wood.addColorStop(0,'#7A4426');wood.addColorStop(.5,'#4A2814');wood.addColorStop(1,'#6A3A1E');
    ctx.fillStyle=wood;rr(0,oy-rail,w,POOL.h*S+2*rail,rail*1.2);ctx.fill();
    ctx.strokeStyle='rgba(255,213,138,.35)';ctx.lineWidth=1;rr(rail*.45,oy-rail*.55,w-rail*.9,POOL.h*S+rail*1.1,rail*.8);ctx.stroke();
    // diamonds
    ctx.fillStyle='#F2D28A';for(let i=1;i<4;i++){const x=ox+i*S/4;for(const y of [oy-rail*.5,oy+POOL.h*S+rail*.5]){ctx.beginPath();ctx.arc(x,y,1.6,0,6.28);ctx.fill();}}
    for(let i=1;i<8;i++){if(i===4)continue;const y=oy+i*S/4;for(const x of [rail*.5,w-rail*.5]){ctx.beginPath();ctx.arc(x,y,1.6,0,6.28);ctx.fill();}}
    // felt with a warm sunset sheen
    const felt=ctx.createRadialGradient(w/2,oy+POOL.h*S*.45,10,w/2,oy+POOL.h*S*.5,POOL.h*S*.7);felt.addColorStop(0,'#2A7A68');felt.addColorStop(1,'#123A34');
    ctx.fillStyle=felt;ctx.fillRect(ox,oy,POOL.w*S,POOL.h*S);
    const sun=ctx.createRadialGradient(ox+POOL.w*S*.85,oy,4,ox+POOL.w*S*.85,oy,POOL.h*S*.6);sun.addColorStop(0,'rgba(255,170,110,.22)');sun.addColorStop(1,'rgba(255,170,110,0)');ctx.fillStyle=sun;ctx.fillRect(ox,oy,POOL.w*S,POOL.h*S);
    ctx.strokeStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.moveTo(ox,oy+HEAD[1]*S);ctx.lineTo(ox+POOL.w*S,oy+HEAD[1]*S);ctx.stroke();
    for(const p of POCKETS){const [x,y]=P([p.x,p.y]);ctx.fillStyle='#050405';ctx.beginPath();ctx.arc(x,y,p.r*S*1.05,0,6.28);ctx.fill();ctx.strokeStyle='#C8963A';ctx.lineWidth=1.4;ctx.stroke();}
    const balls=anim?.view??game.balls;
    // aim guide: line to the first ball it would touch, and that ball's path
    const cue=balls.find(b=>b.n===0);const showAim=!anim&&cue&&!cue.in&&(myTurn()||theirAim);
    if(showAim){const dir=myTurn()?aim:theirAim;const hit=firstContact(balls,cue,dir);const [cx,cy]=P([cue.x,cue.y]);
      ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(255,244,230,.7)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(cx,cy);const end=hit?hit.at:[cue.x+dir[0]*3,cue.y+dir[1]*3];const [ex,ey]=P(end);ctx.lineTo(ex,ey);ctx.stroke();ctx.setLineDash([]);
      if(hit){ctx.strokeStyle='rgba(255,244,230,.8)';ctx.beginPath();ctx.arc(ex,ey,POOL.r*S,0,6.28);ctx.stroke();
        if(hit.ball){const b=hit.ball,d=norm([b.x-hit.at[0],b.y-hit.at[1]]),[bx,by]=P([b.x,b.y]);ctx.strokeStyle='rgba(255,213,138,.8)';ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+d[0]*S*.25,by+d[1]*S*.25);ctx.stroke();}}
      // the cue stick behind the cue ball, pulled back with the power
      const pull=(myTurn()?power:toadPull)*S*.22+POOL.r*S*1.6,len=S*1.1;const sx=cx-dir[0]*pull,sy=cy-dir[1]*pull;
      ctx.lineCap='round';ctx.strokeStyle='#2A1A10';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-dir[0]*len,sy-dir[1]*len);ctx.stroke();
      const cg=ctx.createLinearGradient(sx,sy,sx-dir[0]*len,sy-dir[1]*len);cg.addColorStop(0,'#F4E6CC');cg.addColorStop(.04,'#F4E6CC');cg.addColorStop(.05,'#3A6AC8');cg.addColorStop(.07,'#E8C27A');cg.addColorStop(.7,'#B8783A');cg.addColorStop(1,'#3A1E10');
      ctx.strokeStyle=cg;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-dir[0]*len,sy-dir[1]*len);ctx.stroke();ctx.lineCap='butt';}
    for(const b of balls){if(b.in)continue;const [x,y]=P([b.x,b.y]),r=POOL.r*S;
      ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(x+1.2,y+1.6,r,r*.9,0,0,6.28);ctx.fill();
      const base=b.n===0?'#FBF6EA':b.n>8?'#FBF6EA':colorOf(b.n);ctx.fillStyle=base;ctx.beginPath();ctx.arc(x,y,r,0,6.28);ctx.fill();
      if(b.n>8){ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,6.28);ctx.clip();ctx.fillStyle=colorOf(b.n);ctx.fillRect(x-r,y-r*.55,2*r,r*1.1);ctx.restore();}
      if(b.n!==0){ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.arc(x,y,r*.38,0,6.28);ctx.fill();}
      const g=ctx.createRadialGradient(x-r*.4,y-r*.45,.5,x,y,r);g.addColorStop(0,'rgba(255,255,255,.75)');g.addColorStop(.35,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(0,0,0,.3)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,6.28);ctx.fill();}
    if(myTurn()&&game.ballInHand&&cue){const [x,y]=P([cue.x,cue.y]);ctx.strokeStyle='#FFD58A';ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(x,y,POOL.r*S*2.2,0,6.28);ctx.stroke();ctx.setLineDash([]);}
  }
  // where the cue ball, sent along dir, first touches another ball (or a cushion)
  function firstContact(balls,cue,dir){let best=null;
    for(const b of balls){if(b.n===0||b.in)continue;const fx=b.x-cue.x,fy=b.y-cue.y,proj=fx*dir[0]+fy*dir[1];if(proj<=0)continue;
      const perp2=fx*fx+fy*fy-proj*proj,R2=4*POOL.r*POOL.r;if(perp2>R2)continue;const tt=proj-Math.sqrt(R2-perp2);if(!best||tt<best.t)best={t:tt,ball:b};}
    if(best)return {at:[cue.x+dir[0]*best.t,cue.y+dir[1]*best.t],ball:best.ball};
    // cushion
    const r=POOL.r,tx=dir[0]>0?(POOL.w-r-cue.x)/dir[0]:dir[0]<0?(r-cue.x)/dir[0]:Infinity,ty=dir[1]>0?(POOL.h-r-cue.y)/dir[1]:dir[1]<0?(r-cue.y)/dir[1]:Infinity,tt=Math.min(tx,ty);
    return {at:[cue.x+dir[0]*tt,cue.y+dir[1]*tt],ball:null};}
  function hash(str){let h=0;for(let i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))|0;return (h>>>0).toString(16);}
  function norm([x,y]){const n=Math.sqrt(x*x+y*y)||1;return [x/n,y/n];}
  return {element:root,stop,get live(){return live;}};
}
