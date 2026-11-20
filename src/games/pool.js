// Pool at dusk, played with your finger: drag on the table to aim (the cue follows), pull the cue handle back to set
// the power and let go to shoot; tap the little cue ball for follow or draw. Against the toad on this phone, or live
// with your partner on the private "pair:<id>:play" channel: shots are sent as a direction and a power, and both
// phones run the same deterministic physics (pool-rules.js); a fingerprint check resyncs if they ever differ.
import {POOL,POCKETS,HEAD,newGame,strike,runShot,applyShot,freeSpot,groupOf,targetsFor,tableKey,left} from './pool-rules.js';
import {toadShot} from './pool-bot.js';
import {levelOrDefault} from './bot.js';
import {createToadPicker} from './toads.js';
import {SCENE_ART} from './scene-art.js';
import {homography} from './persp.js';
import {LEVEL_CARD} from '../shop/items.js';
import {icon} from '../design/icons.js';

const COLORS={1:'#D9A520',2:'#1F3E8C',3:'#A3271F',4:'#5A2D7A',5:'#C25418',6:'#1E6B3E',7:'#6B1A28',8:'#0E0E10'};
// the drawn table's cloth in the art's coordinates (the approved PoolDusk table): far-left, far-right, near-right, near-left
const CLOTH=homography([[86,74],[284,74],[312,476],[58,476]]),ART_W=370,ART_H=590;
const colorOf=n=>COLORS[n>8?n-8:n]??'#FFFFFF';

export function createPool({el,button,t,copy,getClient,pairId,me,isHost,partner,person,tones,record,photo=()=>null}){
  const root=el('article',undefined,'card game-card pool-card');root.id='pool';
  // home: title, the two ways to play, the toad cards
  const home=el('div',undefined,'pl-home');
  const head=el('div',undefined,'game-head');head.append(icon('pool',22),el('h3',()=>t('pool.title'),'title'));
  const intro=el('p',()=>t('pool.intro'),'small');
  const join=button(()=>t('pool.join'),()=>startLive(),'primary');join.id='poolJoin';
  const bot=button(()=>t('pool.bot'),()=>{picker.hidden=!picker.hidden;},'');bot.id='poolBot';
  const picker=createToadPicker({el,button,t,copy,choose:l=>startBot(l),game:'pool'});picker.hidden=true;
  const starts=el('div',undefined,'game-actions');starts.append(join,bot);
  home.append(head,intro,starts,picker);
  // the match (approved PoolDusk / PoolAim): chip, scoreboard, the table, the pull bar
  const match=el('div',undefined,'pl-match');match.hidden=true;
  const chip=el('span',undefined,'game-chip in-bar');
  const board=el('div',undefined,'pool-board');
  const sideEl=end=>{const s=el('div',undefined,'pb-side'+(end?' end':''));const face=el('span',undefined,'hk-face');const box=el('div');const name=el('div',undefined,'pb-name');const rack=el('span',undefined,'pb-rack');box.append(name,rack);s.append(face,box);return {s,face,name,rack};};
  const sides=[sideEl(false),sideEl(true)],tally=el('b',undefined,'pb-tally');board.append(sides[0].s,tally,sides[1].s);
  const stageBox=el('div',undefined,'pl-table scene-art');
  const art=el('div',undefined,'pl-art');art.innerHTML=SCENE_ART.poolTable;
  const canvas=document.createElement('canvas');canvas.className='pool-table';canvas.tabIndex=0;canvas.setAttribute('role','img');
  copy(canvas,()=>t('pool.canvas'),'aria-label');stageBox.append(art,canvas);
  const status=el('p',undefined,'hk-status');status.setAttribute('role','status');status.id='poolStatus';
  // the pull bar: press, drag down (or left) to pull the cue back, let go to shoot
  const controls=el('div',undefined,'pool-controls');
  const spinPad=button(undefined,()=>{},'pool-spin');copy(spinPad,()=>t('pool.spin'),'aria-label');const spinDot=el('span',undefined,'pool-spin-dot');spinPad.append(spinDot);
  const handle=el('div',undefined,'pool-pull');handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax','100');
  copy(handle,()=>t('pool.pull'),'aria-label');
  const pullText=el('span',()=>t('pool.pullToShoot'),'pool-pull-text'),pct=el('span',undefined,'pool-pct'),meter=el('span',undefined,'pool-meter');
  const track=el('span',undefined,'pool-track');track.append(meter);handle.append(pullText,pct,track);
  const shoot=button(()=>t('pool.shoot'),()=>fire(),'pool-shoot primary');
  controls.append(spinPad,handle,shoot);
  const leave=button(()=>t('pool.leave'),()=>stop(),'quiet');
  const again=button(()=>t('pool.again'),()=>{if(mode==='bot')newRack();else{newRack();send('state',{state:game});}},'primary');again.hidden=true;
  const foot=el('div',undefined,'game-actions hk-foot');foot.append(again,leave);
  match.append(chip,board,stageBox,status,controls,foot);
  root.append(home,match);

  // mode: null | 'bot' | 'live'. game: pool-rules state. mySeat: 0 or 1 (seat 0 breaks the first rack).
  let mode=null,level='medium',game=null,mySeat=0,channel=null,live=false,anim=null,raf=0,aim=[0,-1],power=0,spin=0,recorded=null,dragging=null,busy=false;
  const ctx=canvas.getContext('2d');
  const myTurn=()=>!!game&&game.winner===null&&game.turn===mySeat&&!anim&&!busy&&(mode==='bot'||live);
  const say=fn=>copy(status,fn);

  function newRack(){game=newGame(Math.random,game?1-game.lastStarter:0);game.lastStarter=game.turn;recorded=null;again.hidden=true;aimAtRack();paint();draw();}
  function aimAtRack(){const cue=game.balls.find(b=>b.n===0);const t8=game.balls.find(b=>b.n===8);aim=norm([t8.x-cue.x,t8.y-cue.y]);}
  function startBot(choice){stop(false);mode='bot';level=levelOrDefault(choice);mySeat=0;game=null;playing(true);newRack();live=true;resize();loop();turnPrompt();}
  function stop(clear=true){cancelAnimationFrame(raf);raf=0;anim=null;busy=false;const ch=channel;channel=null;live=false;if(ch)getClient()?.removeChannel(ch);
    playing(false);again.hidden=true;game=null;mode=null;if(clear)copy(status,'');}
  function playing(on){home.hidden=on;match.hidden=!on;picker.hidden=true;document.documentElement.classList.toggle('hockey-on',on);}

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
  function setLive(on){live=on;controls.hidden=!on;
    if(on){if(mySeat===0&&!game)newRack();if(mySeat===0&&game)send('state',{state:game});else if(!game)send('sync',{});resize();loop();turnPrompt();}
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
      const meWon=mode==='bot'?won:game.winner===0;record({id:recorded,game:mode==='bot'?'pool_bot':'pool',kind:'finish',card:mode==='bot'?LEVEL_CARD[level]:null,scoreMe:meWon?1:0,scorePartner:meWon?0:1});}
  }

  // The scoreboard: faces, who plays which group, the balls each still has, and the balls each has potted.
  const potted=seat=>{const g=game.groups[seat];return g?7-left(game.balls,g):0;};
  function paint(){
    if(!game)return;
    const seats=[mySeat,1-mySeat];
    copy(chip,()=>t('pool.chip',{state:t(game.turn===mySeat?'pool.chip.yours':'pool.chip.theirs')}));
    tally.textContent=potted(seats[0])+'–'+potted(seats[1]);
    seats.forEach((seat,i)=>{const s=sides[i];const isMe=seat===mySeat;s.s.classList.toggle('on',game.turn===seat&&game.winner===null);
      s.face.replaceChildren();s.face.className='hk-face';
      if(!isMe&&mode==='bot'){s.face.classList.add('hk-face-toad');s.face.append(el('span',()=>t('game.hockey.level.'+level)));}
      else{s.face.classList.add('tone-'+(isMe?tones().me:tones().partner));const src=photo(isMe?me():partner());
        if(src){const img=document.createElement('img');img.src=src;img.alt='';s.face.append(img);}else s.face.textContent=(person(isMe?me():partner())||'?').charAt(0).toUpperCase();}
      const who=()=>isMe?person(me()):mode==='bot'?t('game.hockey.level.'+level+'.name'):person(partner());
      const g=game.groups[seat];
      copy(s.name,()=>g?(i===0?who()+' · '+t('pool.group.'+g).toLowerCase():t('pool.group.'+g).toLowerCase()+' · '+who()):who());
      s.name.classList.toggle('tone-y',(isMe?tones().me:tones().partner)==='yasmine'||(!isMe&&mode==='bot'));
      s.rack.replaceChildren();
      if(g){const nums=g==='solids'?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15];
        for(const n of nums){const ball=game.balls.find(b=>b.n===n);const dot=el('i',undefined,'pb-ball'+(n>8?' stripe':''));dot.style.setProperty('--c',colorOf(n));if(ball?.in)dot.classList.add('in');s.rack.append(dot);}
        copy(s.rack,()=>t('pool.group.'+g)+': '+left(game.balls,g),'aria-label');}
      else{copy(s.rack,'','aria-label');s.rack.append(el('small',()=>t('pool.open')));}
    });
  }

  // Input: aim by dragging on the table; with ball in hand, drag the cue ball itself to place it.
  let K=1;
  const toTable=e=>{const r=canvas.getBoundingClientRect();const [u,v]=CLOTH.from((e.clientX-r.left)/K,(e.clientY-r.top)/K);return [u*POOL.w,v*POOL.h];};
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
  handle.addEventListener('pointerdown',e=>{if(!myTurn())return;handle.setPointerCapture(e.pointerId);pullStart=[e.clientX,e.clientY];});
  handle.addEventListener('pointermove',e=>{if(pullStart===null)return;const d=Math.max(e.clientY-pullStart[1],pullStart[0]-e.clientX,e.clientX-pullStart[0]);power=Math.max(0,Math.min(1,d/160));paintPower();});
  handle.addEventListener('pointerup',()=>{if(pullStart===null)return;pullStart=null;if(power>.03)fire();else{power=0;paintPower();}});
  handle.addEventListener('keydown',e=>{if(!myTurn())return;if(e.key==='ArrowDown'||e.key==='ArrowRight'){power=Math.min(1,power+.05);paintPower();e.preventDefault();}
    if(e.key==='ArrowUp'||e.key==='ArrowLeft'){power=Math.max(0,power-.05);paintPower();e.preventDefault();}if(e.key==='Enter'||e.key===' '){fire();e.preventDefault();}});
  handle.style.touchAction='none';
  spinPad.addEventListener('pointerdown',e=>{const r=spinPad.getBoundingClientRect();spin=Math.max(-1,Math.min(1,-((e.clientY-r.top)/r.height-.5)*2.4));if(Math.abs(spin)<.2)spin=0;paintSpin();});
  function paintPower(){handle.style.setProperty('--p',power);handle.setAttribute('aria-valuenow',String(Math.round(power*100)));pct.textContent=Math.round(power*100)+'%';}
  function paintSpin(){spinDot.style.setProperty('--s',spin);copy(spinPad,()=>t('pool.spin')+': '+t(spin>0?'pool.spin.follow':spin<0?'pool.spin.draw':'pool.spin.center'),'aria-label');}
  paintPower();paintSpin();

  // Drawing
  // The table keeps the art's proportions and fills the space between the scoreboard and the pull bar.
  function resize(){
    const avail=Math.max(280,(innerHeight||800)-(board.offsetHeight||70)-230),w=Math.min(match.clientWidth||root.clientWidth||360,ART_W*1.25,avail*ART_W/ART_H);
    const h=w*ART_H/ART_W,dpr=Math.min(2,devicePixelRatio||1);
    stageBox.style.width=w+'px';stageBox.style.height=h+'px';canvas.width=w*dpr;canvas.height=h*dpr;K=w/ART_W;ctx.setTransform(dpr*K,0,0,dpr*K,0,0);draw();}
  new ResizeObserver(()=>{if(game)resize();}).observe(root);
  addEventListener('resize',()=>{if(game)resize();});
  function loop(){cancelAnimationFrame(raf);const tick=()=>{raf=requestAnimationFrame(tick);
    if(anim){const f=anim.frames[anim.i];if(f){anim.view=f;anim.i++;}else{const done=anim.done;anim=null;done();}}draw();};raf=requestAnimationFrame(tick);}
  // table units to the art: [x,y] and how many art units one table unit is there
  const P=([x,y])=>CLOTH.to(x/POOL.w,y/POOL.h),S=([x,y])=>CLOTH.scale(x/POOL.w,y/POOL.h);
  function ball(b){
    const [x,y]=P([b.x,b.y]),r=POOL.r*S([b.x,b.y]),c=b.n===0?'#F8F4EC':b.n>8?'#F4EFE2':colorOf(b.n);
    ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(x+r*.35,y+r*.75,r*1.05,r*.45,0,0,6.2832);ctx.fill();
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();
    if(b.n>8){ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.clip();ctx.fillStyle=colorOf(b.n);ctx.fillRect(x-r,y-r*.4,2*r,r*.8);ctx.restore();}
    if(b.n!==0){ctx.fillStyle='#F4EFE2';ctx.beginPath();ctx.arc(x,y,r*.4,0,6.2832);ctx.fill();}
    const sh=ctx.createRadialGradient(x-r*.16,y-r*.28,r*.3,x,y,r);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.6)');ctx.fillStyle=sh;ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();
    const bo=ctx.createRadialGradient(x+r*.1,y+r*.7,0,x+r*.1,y+r*.7,r*.6);bo.addColorStop(0,'rgba(79,200,138,.35)');bo.addColorStop(1,'rgba(79,200,138,0)');ctx.fillStyle=bo;ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();
    const sp=ctx.createRadialGradient(x-r*.34,y-r*.48,0,x-r*.34,y-r*.48,r*.9);sp.addColorStop(0,'rgba(255,248,232,1)');sp.addColorStop(.14,'rgba(255,240,208,.45)');sp.addColorStop(.38,'rgba(255,255,255,0)');ctx.fillStyle=sp;ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();
  }
  function draw(){
    if(!canvas.width||!game)return;ctx.clearRect(0,0,ART_W,ART_H);
    const balls=anim?.view??game.balls,cue=balls.find(b=>b.n===0);
    const showAim=!anim&&cue&&!cue.in&&(myTurn()||theirAim);
    if(showAim){const dir=myTurn()?aim:theirAim,hit=firstContact(balls,cue,dir),[cx,cy]=P([cue.x,cue.y]);
      const end=hit?hit.at:[cue.x+dir[0]*3,cue.y+dir[1]*3],[ex,ey]=P(end);
      ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(255,246,224,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.stroke();ctx.restore();
      if(hit){const r=POOL.r*S(end);ctx.strokeStyle='rgba(255,246,224,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(ex,ey,r,0,6.2832);ctx.stroke();
        if(hit.ball){const b=hit.ball,d=norm([b.x-hit.at[0],b.y-hit.at[1]]),[bx,by]=P([b.x,b.y]),[tx,ty]=P([b.x+d[0]*.3,b.y+d[1]*.3]);ctx.strokeStyle='rgba(255,213,138,.8)';ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(tx,ty);ctx.stroke();}}
    }
    for(const b of [...balls].filter(b=>!b.in).sort((a,b)=>a.y-b.y))ball(b);
    if(myTurn()&&game.ballInHand&&cue){const [x,y]=P([cue.x,cue.y]),r=POOL.r*S([cue.x,cue.y]);ctx.save();ctx.strokeStyle='#FFD58A';ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(x,y,r*2.2,0,6.2832);ctx.stroke();ctx.restore();}
    if(showAim){
      // the cue behind the white, pulled back with the power, in perspective
      const dir=myTurn()?aim:theirAim,pull=(myTurn()?power:toadPull)*.22+POOL.r*1.7,len=1.35;
      const a=[cue.x-dir[0]*pull,cue.y-dir[1]*pull],b=[a[0]-dir[0]*len,a[1]-dir[1]*len],[ax,ay]=P(a),[bx,by]=P(b);
      const wa=S(a)*.006,wb=S(b)*.014,nx=-(by-ay),ny=bx-ax,nl=Math.hypot(nx,ny)||1;
      ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.moveTo(ax+4+nx/nl*wa,ay+6+ny/nl*wa);ctx.lineTo(bx+8+nx/nl*wb,by+10+ny/nl*wb);ctx.lineTo(bx+8-nx/nl*wb,by+10-ny/nl*wb);ctx.lineTo(ax+4-nx/nl*wa,ay+6-ny/nl*wa);ctx.fill();
      const g=ctx.createLinearGradient(ax,ay,bx,by);
      for(const [o,c] of [[0,'#EDE8DC'],[.035,'#2F6FB0'],[.06,'#F2E2C0'],[.5,'#C9985E'],[.62,'#8A5A2E'],[.64,'#151515'],[.7,'#C9962E'],[.72,'#151515'],[1,'#2A1A10']])g.addColorStop(o,c);
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ax+nx/nl*wa,ay+ny/nl*wa);ctx.lineTo(bx+nx/nl*wb,by+ny/nl*wb);ctx.lineTo(bx-nx/nl*wb,by-ny/nl*wb);ctx.lineTo(ax-nx/nl*wa,ay-ny/nl*wa);ctx.fill();
    }
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
