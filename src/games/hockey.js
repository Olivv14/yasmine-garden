// Air hockey, two ways. Live: a private Realtime channel ("hockey:<pair>", backend/005 policies); slot 1 hosts
// the physics, the guest sends its mallet and draws the host's state mirrored, so each player always defends
// the bottom of their own screen. Against the toad: everything runs on this phone, the toad takes the top half.
import {TABLE,clampMallet,step,servePuck} from './rules.js';
import {toadMove} from './bot.js';
import {icon} from '../design/icons.js';

const SEND_MS=33;
export function createHockey({el,button,t,copy,getClient,pairId,me,isHost,partner,person,tones,record,notify}){
  const root=el('article',undefined,'card game-card');root.id='airHockey';
  const head=el('div',undefined,'game-head');head.append(icon('live',22),el('h3',()=>t('game.hockey.title'),'title'));
  const intro=el('p',()=>t('game.hockey.intro'),'small');
  const status=el('p',undefined,'body-strong');status.setAttribute('role','status');status.id='hockeyStatus';
  const score=el('p',undefined,'small hockey-score');score.setAttribute('aria-live','polite');
  const canvas=document.createElement('canvas');canvas.className='hockey-table';canvas.tabIndex=0;canvas.hidden=true;canvas.setAttribute('role','img');copy(canvas,()=>t('game.hockey.canvas')+' '+t('game.hockey.keys'),'aria-label');
  const join=button(()=>t('game.hockey.join'),()=>start(),'primary');join.id='hockeyJoin';
  const bot=button(()=>t('game.hockey.bot'),()=>startBot(),'');bot.id='hockeyBot';
  const leave=button(()=>t('game.hockey.leave'),()=>stop(),'quiet');leave.hidden=true;
  const again=button(()=>t('game.hockey.again'),()=>{if(host())reset();else send('again',{});},'');again.hidden=true;
  const starts=el('div',undefined,'game-actions');starts.append(join,bot);
  root.append(head,intro,status,score,canvas,starts,again,leave);

  // mode: null (not playing), 'live' (with your partner), 'bot' (against the toad)
  let mode=null,channel=null,live=false,raf=0,lastSend=0,state=null,mine=null,theirs=null,lastMine=null,lastTheirs=null,recordedId=null,pause=0;
  const host=()=>mode==='bot'||isHost();
  const ctx=canvas.getContext('2d');
  function fresh(){return {puck:servePuck(Math.random()<.5?'host':'guest'),host:[TABLE.w/2,TABLE.h*.85],guest:[TABLE.w/2,TABLE.h*.15],score:[0,0],over:false};}
  function setStatus(fn){copy(status,fn);}
  function paintScore(){
    if(!state){score.textContent='';return;}const [h,g]=state.score,[m,o]=host()?[h,g]:[g,h];
    copy(score,()=>mode==='bot'?t('game.hockey.botScore',{me:m,them:o}):t('game.hockey.score',{me:m,them:o,name:person(partner())}));
  }
  function send(event,payload){channel?.send({type:'broadcast',event,payload}).catch(()=>{});}
  // while a table is on screen the floating heart steps aside, so it never covers your half
  function playing(on){starts.hidden=on;leave.hidden=!on;document.documentElement.classList.toggle('hockey-on',on);}

  async function start(){
    const client=getClient();if(!client||!pairId())return;
    mode='live';join.disabled=true;setStatus(()=>t('common.loading'));
    try{await client.realtime.setAuth();}catch{}
    channel=client.channel('hockey:'+pairId(),{config:{private:true,broadcast:{self:false},presence:{key:me()}}});
    channel.on('presence',{event:'sync'},()=>{const others=Object.keys(channel.presenceState()).filter(k=>k!==me());setLive(others.length>0);})
      .on('broadcast',{event:'m'},({payload})=>{if(isHost()&&Array.isArray(payload?.p))theirs=clampMallet(payload.p.map(Number),false);})
      .on('broadcast',{event:'s'},({payload})=>{if(!isHost()&&payload)receive(payload);})
      .on('broadcast',{event:'again'},()=>{if(isHost())reset();})
      .subscribe(async st=>{
        if(st==='SUBSCRIBED'){await channel.track({at:Date.now()});playing(true);join.disabled=false;setLive(false);}
        else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){setStatus(()=>t('game.hockey.offline'));join.disabled=false;stop(false);}
      });
  }
  // Against the toad: no channel, no partner needed; you are the host and defend the bottom.
  function startBot(){
    stop(false);mode='bot';playing(true);live=true;canvas.hidden=false;
    setStatus(()=>t('game.hockey.botLive'));reset();resize();if(!raf)raf=requestAnimationFrame(loop);canvas.focus({preventScroll:true});
  }
  function stop(clearStatus=true){
    cancelAnimationFrame(raf);raf=0;const ch=channel;channel=null;live=false;if(ch)getClient()?.removeChannel(ch);
    canvas.hidden=true;playing(false);again.hidden=true;state=null;mine=null;theirs=null;lastMine=null;lastTheirs=null;mode=null;paintScore();if(clearStatus)copy(status,'');
  }
  function setLive(on){
    live=on;canvas.hidden=!on;
    setStatus(()=>on?t('game.hockey.live',{name:person(partner())}):t('game.hockey.waiting',{name:person(partner())}));
    if(on){if(isHost()&&(!state||state.over))reset();mine??=isHost()?[TABLE.w/2,TABLE.h*.85]:[TABLE.w/2,TABLE.h*.15];resize();if(!raf)raf=requestAnimationFrame(loop);}
    else{cancelAnimationFrame(raf);raf=0;}
  }
  function reset(){state=fresh();mine=[...state.host];theirs=[...state.guest];recordedId=null;pause=performance.now()+700;again.hidden=true;paintScore();
    if(mode==='bot')setStatus(()=>t('game.hockey.botLive'));}
  function receive(p){
    const wasOver=state?.over;state={puck:p.puck,host:p.host,guest:p.guest,score:p.score,over:p.over};paintScore();
    if(state.over&&!wasOver)finished();if(!state.over)again.hidden=true;
  }
  function finished(){
    again.hidden=false;const [h,g]=state.score,[m,o]=host()?[h,g]:[g,h];
    if(mode==='bot'){
      setStatus(()=>m>o?t('game.hockey.botWon',{me:m,them:o}):t('game.hockey.botLost',{me:m,them:o}));
      if(!recordedId){recordedId=crypto.randomUUID();record({id:recordedId,game:'hockey_bot',kind:'finish',scoreMe:m,scorePartner:o});}
      return;
    }
    setStatus(()=>m>o?t('game.hockey.won',{me:m,them:o}):t('game.hockey.lost',{name:person(partner()),me:m,them:o}));
    if(isHost()&&!recordedId){recordedId=crypto.randomUUID();record({id:recordedId,game:'hockey',kind:'finish',scoreMe:h,scorePartner:g});}
  }

  // Input: pointer or arrow keys move your mallet inside your half. Live guests see the table mirrored.
  const toTable=(px,py)=>{const r=canvas.getBoundingClientRect();let x=(px-r.left)/r.width*TABLE.w,y=(py-r.top)/r.height*TABLE.h;if(!host()){x=TABLE.w-x;y=TABLE.h-y;}return [x,y];};
  const move=p=>{mine=clampMallet(p,host());};
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);move(toTable(e.clientX,e.clientY));});
  canvas.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType!=='mouse')move(toTable(e.clientX,e.clientY));});
  canvas.addEventListener('keydown',e=>{if(!mine)return;const d=.05,f=host()?1:-1,k={ArrowLeft:[-d*f,0],ArrowRight:[d*f,0],ArrowUp:[0,-d*f],ArrowDown:[0,d*f]}[e.key];if(k){e.preventDefault();move([mine[0]+k[0],mine[1]+k[1]]);}});
  canvas.style.touchAction='none';

  function loop(now){
    raf=requestAnimationFrame(loop);if(!live)return;
    const dt=Math.min(.04,(now-(loop.last??now))/1000);loop.last=now;
    if(host()&&state){
      if(mode==='bot'&&!state.over&&dt>0)theirs=toadMove(state,theirs??state.guest,dt);
      state.host=mine??state.host;state.guest=theirs??state.guest;
      if(!state.over&&now>pause&&dt>0){
        const vel=(cur,prev)=>prev?[(cur[0]-prev[0])/dt,(cur[1]-prev[1])/dt]:[0,0];
        const [hvx,hvy]=vel(state.host,lastMine),[gvx,gvy]=vel(state.guest,lastTheirs);
        const r=step(state.puck,[{x:state.host[0],y:state.host[1],vx:hvx,vy:hvy},{x:state.guest[0],y:state.guest[1],vx:gvx,vy:gvy}],dt);
        state.puck=r.puck;
        if(r.scored){state.score[r.scored==='host'?0:1]++;state.puck=servePuck(r.scored==='host'?'guest':'host');pause=now+900;paintScore();if(Math.max(...state.score)>=TABLE.win){state.over=true;finished();}}
      }
      lastMine=[...state.host];lastTheirs=[...state.guest];
      if(mode==='live'&&now-lastSend>SEND_MS){lastSend=now;send('s',{puck:state.puck.map(v=>+v.toFixed(4)),host:state.host,guest:state.guest,score:state.score,over:state.over});}
    }else if(mine&&now-lastSend>SEND_MS){lastSend=now;send('m',{p:mine.map(v=>+v.toFixed(4))});}
    draw();
  }
  function resize(){const w=Math.min(root.clientWidth-2,420),h=w*TABLE.h/TABLE.w,dpr=Math.min(2,devicePixelRatio||1);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);canvas._w=w;canvas._h=h;}
  new ResizeObserver(()=>{if(live)resize();}).observe(root);
  function draw(){
    const w=canvas._w,h=canvas._h;if(!w||!state)return;const css=n=>getComputedStyle(root).getPropertyValue(n).trim();
    const S=w/TABLE.w,tx=([x,y])=>host()?[x*S,y*S]:[(TABLE.w-x)*S,(TABLE.h-y)*S];
    ctx.clearRect(0,0,w,h);ctx.fillStyle=css('--surface-2');ctx.fillRect(0,0,w,h);
    ctx.strokeStyle=css('--line');ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();ctx.beginPath();ctx.arc(w/2,h/2,w*.16,0,6.28);ctx.stroke();
    ctx.fillStyle=css('--accent');const gw=TABLE.goal*S;ctx.fillRect((w-gw)/2,0,gw,5);ctx.fillRect((w-gw)/2,h-5,gw,5);
    const myTone=css('--'+tones().me),theirTone=mode==='bot'?css('--success'):css('--'+tones().partner);
    const hostPos=host()?(mine??state.host):state.host,guestPos=host()?state.guest:(mine??state.guest);
    for(const [pos,color] of [[hostPos,host()?myTone:theirTone],[guestPos,host()?theirTone:myTone]]){const [x,y]=tx(pos);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,TABLE.mallet*S,0,6.28);ctx.fill();ctx.fillStyle=css('--surface');ctx.beginPath();ctx.arc(x,y,TABLE.mallet*S*.45,0,6.28);ctx.fill();}
    if(mode==='bot'){const [x,y]=tx(state.guest);ctx.fillStyle=css('--ink');for(const dx of [-.3,.3]){ctx.beginPath();ctx.arc(x+dx*TABLE.mallet*S,y-.25*TABLE.mallet*S,TABLE.mallet*S*.12,0,6.28);ctx.fill();}}
    const [px,py]=tx(state.puck);ctx.fillStyle=css('--ink');ctx.beginPath();ctx.arc(px,py,TABLE.puck*S,0,6.28);ctx.fill();
  }
  return {element:root,stop,get live(){return live;}};
}
