// Air hockey, two ways. Live: a private Realtime channel ("hockey:<pair>", backend/005 policies); slot 1 hosts
// the physics, the guest sends its mallet and draws the host's state mirrored, so each player always defends
// the bottom of their own screen. Against the toad: everything runs on this phone, the toad takes the top half.
import {TABLE,clampMallet,step,servePuck} from './rules.js';
import {toadMove,levelOrDefault} from './bot.js';
import {createToadPicker,toadArt} from './toads.js';
import {icon} from '../design/icons.js';

const SEND_MS=33;
export function createHockey({el,button,t,copy,getClient,pairId,me,isHost,partner,person,tones,record,notify,photo=()=>null}){
  const root=el('article',undefined,'card game-card');root.id='airHockey';
  const head=el('div',undefined,'game-head');head.append(icon('live',22),el('h3',()=>t('game.hockey.title'),'title'));
  const intro=el('p',()=>t('game.hockey.intro'),'small');
  const status=el('p',undefined,'body-strong');status.setAttribute('role','status');status.id='hockeyStatus';
  const score=el('p',undefined,'visually-hidden hockey-score');score.setAttribute('aria-live','polite');
  // the scoreboard: your photo and score, then theirs (the toad's card art when you play the toad)
  const board=el('div',undefined,'hockey-board');board.hidden=true;board.setAttribute('aria-hidden','true');
  const side=()=>{const s=el('span',undefined,'hb-side');const face=el('span',undefined,'hb-face');const n=el('b',undefined,'hb-score');s.append(face,n);return {s,face,n};};
  const mineSide=side(),theirSide=side(),badge=el('span',undefined,'hb-badge');
  board.append(mineSide.s,el('span','·','hb-dot'),theirSide.s,badge);
  const canvas=document.createElement('canvas');canvas.className='hockey-table';canvas.tabIndex=0;canvas.hidden=true;canvas.setAttribute('role','img');copy(canvas,()=>t('game.hockey.canvas')+' '+t('game.hockey.keys'),'aria-label');
  const join=button(()=>t('game.hockey.join'),()=>start(),'primary');join.id='hockeyJoin';
  const bot=button(()=>t('game.hockey.bot'),()=>{picker.hidden=!picker.hidden;},'');bot.id='hockeyBot';
  const picker=createToadPicker({el,button,t,copy,choose:level=>startBot(level)});picker.hidden=true;
  const leave=button(()=>t('game.hockey.leave'),()=>stop(),'quiet');leave.hidden=true;
  const again=button(()=>t('game.hockey.again'),()=>{if(host())reset();else send('again',{});},'');again.hidden=true;
  const starts=el('div',undefined,'game-actions');starts.append(join,bot);
  root.append(head,intro,status,board,score,canvas,starts,picker,again,leave);

  // mode: null (not playing), 'live' (with your partner), 'bot' (against the toad)
  let mode=null,channel=null,live=false,raf=0,lastSend=0,state=null,mine=null,theirs=null,lastMine=null,lastTheirs=null,recordedId=null,pause=0,level='medium',memo={},trail=[];
  const host=()=>mode==='bot'||isHost();
  const ctx=canvas.getContext('2d');
  function fresh(){return {puck:servePuck(Math.random()<.5?'host':'guest'),host:[TABLE.w/2,TABLE.h*.85],guest:[TABLE.w/2,TABLE.h*.15],score:[0,0],over:false};}
  function setStatus(fn){copy(status,fn);}
  function paintScore(){
    if(!state){score.textContent='';board.hidden=true;return;}const [h,g]=state.score,[m,o]=host()?[h,g]:[g,h];
    copy(score,()=>mode==='bot'?t('game.hockey.botScore',{me:m,them:o}):t('game.hockey.score',{me:m,them:o,name:person(partner())}));
    board.hidden=false;mineSide.n.textContent=String(m);theirSide.n.textContent=String(o);
  }
  function send(event,payload){channel?.send({type:'broadcast',event,payload}).catch(()=>{});}
  // while a table is on screen the floating heart steps aside, so it never covers your half
  function playing(on){starts.hidden=on;picker.hidden=true;leave.hidden=!on;document.documentElement.classList.toggle('hockey-on',on);}
  // faces on the scoreboard: a photo when there is one, else the initial in your colour
  function face(slot,who,tone){slot.replaceChildren();slot.className='hb-face '+tone;
    if(who==='toad'){slot.append(toadArt(level));return;}
    const src=photo(who);if(src){const img=document.createElement('img');img.src=src;img.alt='';slot.append(img);}
    else slot.textContent=(person(who)||'?').trim().charAt(0).toUpperCase();}
  function faces(){face(mineSide.face,me(),'tone-'+tones().me);
    if(mode==='bot'){face(theirSide.face,'toad','tone-success');copy(badge,()=>t('game.hockey.level.'+level));badge.className='hb-badge lvl-'+level;badge.hidden=false;}
    else{face(theirSide.face,partner(),'tone-'+tones().partner);badge.hidden=true;}}

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
  function startBot(choice){
    stop(false);mode='bot';level=levelOrDefault(choice);memo={};playing(true);live=true;canvas.hidden=false;faces();
    setStatus(()=>t('game.hockey.botLive'));reset();resize();if(!raf)raf=requestAnimationFrame(loop);canvas.focus({preventScroll:true});
  }
  function stop(clearStatus=true){
    cancelAnimationFrame(raf);raf=0;const ch=channel;channel=null;live=false;if(ch)getClient()?.removeChannel(ch);
    canvas.hidden=true;playing(false);again.hidden=true;state=null;mine=null;theirs=null;lastMine=null;lastTheirs=null;mode=null;paintScore();if(clearStatus)copy(status,'');
  }
  function setLive(on){
    live=on;canvas.hidden=!on;if(on)faces();
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
      if(mode==='bot'&&!state.over&&dt>0)theirs=toadMove(state,theirs??state.guest,dt,Math.random,level,memo,state.host);
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
  // The table at dusk: a wooden rim, a deep blue ice that catches the sunset, gold lines, a glossy puck with a trail.
  const myImg=new Image();let myImgSrc='';
  function draw(){
    const w=canvas._w,h=canvas._h;if(!w||!state)return;const css=n=>getComputedStyle(root).getPropertyValue(n).trim();
    const R=Math.max(8,w*.035),iw=w-2*R,ih=h-2*R,S=iw/TABLE.w;
    const tx=([x,y])=>host()?[R+x*S,R+y*(ih/TABLE.h)]:[R+(TABLE.w-x)*S,R+(TABLE.h-y)*(ih/TABLE.h)];
    ctx.clearRect(0,0,w,h);
    // rim
    const wood=ctx.createLinearGradient(0,0,w,h);wood.addColorStop(0,'#7A4426');wood.addColorStop(.5,'#4A2814');wood.addColorStop(1,'#6A3A1E');
    ctx.fillStyle=wood;round(0,0,w,h,R*1.4);ctx.fill();
    ctx.strokeStyle='rgba(255,213,138,.35)';ctx.lineWidth=1;round(R*.45,R*.45,w-R*.9,h-R*.9,R);ctx.stroke();
    // ice
    const ice=ctx.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,h*.7);ice.addColorStop(0,'#2C3C6E');ice.addColorStop(1,'#141A34');
    ctx.fillStyle=ice;round(R,R,iw,ih,R*.6);ctx.fill();
    ctx.save();round(R,R,iw,ih,R*.6);ctx.clip();
    const glow=ctx.createRadialGradient(w*.82,R,4,w*.82,R,h*.6);glow.addColorStop(0,'rgba(255,170,110,.28)');glow.addColorStop(1,'rgba(255,170,110,0)');ctx.fillStyle=glow;ctx.fillRect(R,R,iw,ih);
    ctx.fillStyle='rgba(255,255,255,.05)';for(let y=R+10;y<R+ih;y+=14)for(let x=R+10;x<R+iw;x+=14){ctx.beginPath();ctx.arc(x,y,1,0,6.28);ctx.fill();}
    ctx.strokeStyle='rgba(255,213,138,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(R,h/2);ctx.lineTo(R+iw,h/2);ctx.stroke();
    ctx.beginPath();ctx.arc(w/2,h/2,iw*.16,0,6.28);ctx.stroke();
    ctx.strokeStyle='rgba(255,213,138,.3)';const cr=TABLE.goal*S*.62;ctx.beginPath();ctx.arc(w/2,R,cr,0,Math.PI);ctx.stroke();ctx.beginPath();ctx.arc(w/2,R+ih,cr,Math.PI,6.28);ctx.stroke();
    // trail and puck
    const [px,py]=tx(state.puck);trail.push([px,py]);if(trail.length>9)trail.shift();
    trail.forEach(([x,y],i)=>{ctx.fillStyle=`rgba(255,213,138,${(i/trail.length)*.18})`;ctx.beginPath();ctx.arc(x,y,TABLE.puck*S*(.5+i/trail.length*.5),0,6.28);ctx.fill();});
    ctx.restore();
    // goals: dark slots with gold lips
    const gw=TABLE.goal*S;for(const y of [R*.5,h-R*.5]){ctx.fillStyle='#08060A';round((w-gw)/2,y-R*.32,gw,R*.64,R*.3);ctx.fill();ctx.strokeStyle='#E8B23A';ctx.lineWidth=2;ctx.stroke();}
    const myTone=css('--'+tones().me)||'#E8443A',theirTone=mode==='bot'?'#E8A040':(css('--'+tones().partner)||'#2FA866');
    const hostPos=host()?(mine??state.host):state.host,guestPos=host()?state.guest:(mine??state.guest);
    const src=photo(me());if(src&&src!==myImgSrc){myImgSrc=src;myImg.src=src;}
    for(const [pos,color,isMe] of [[hostPos,host()?myTone:theirTone,host()],[guestPos,host()?theirTone:myTone,!host()]]){
      const [x,y]=tx(pos),r=TABLE.mallet*S;
      ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(x+2,y+4,r,r*.9,0,0,6.28);ctx.fill();
      const g=ctx.createRadialGradient(x-r*.35,y-r*.35,1,x,y,r);g.addColorStop(0,'#FFFFFF');g.addColorStop(.25,color);g.addColorStop(1,shade(color));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,6.28);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1.2;ctx.stroke();
      const k=r*.52;ctx.save();ctx.beginPath();ctx.arc(x,y,k,0,6.28);ctx.clip();
      if(isMe&&myImg.complete&&myImg.naturalWidth){ctx.drawImage(myImg,x-k,y-k,2*k,2*k);}
      else{const kg=ctx.createRadialGradient(x-k*.3,y-k*.3,1,x,y,k);kg.addColorStop(0,'#FFFFFF');kg.addColorStop(1,shade(color));ctx.fillStyle=kg;ctx.fillRect(x-k,y-k,2*k,2*k);}
      ctx.restore();
      if(!isMe&&mode==='bot'){ctx.fillStyle='#FFFDF0';for(const dx of [-.32,.32]){ctx.beginPath();ctx.arc(x+dx*r,y-.3*r,r*.2,0,6.28);ctx.fill();}
        ctx.fillStyle='#1A1414';for(const dx of [-.32,.32]){ctx.beginPath();ctx.arc(x+dx*r,y-.28*r,r*.11,0,6.28);ctx.fill();}}
    }
    const pr=TABLE.puck*S,pg=ctx.createRadialGradient(px-pr*.4,py-pr*.4,1,px,py,pr);pg.addColorStop(0,'#5A5A66');pg.addColorStop(1,'#0A0A0E');
    ctx.fillStyle=pg;ctx.beginPath();ctx.arc(px,py,pr,0,6.28);ctx.fill();ctx.strokeStyle='#E8B23A';ctx.lineWidth=1.6;ctx.stroke();
  }
  function round(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function shade(c){const m=/^#?([0-9a-f]{6})$/i.exec(c||'');if(!m)return '#222';const n=parseInt(m[1],16);const f=v=>Math.round(v*.45).toString(16).padStart(2,'0');return '#'+f(n>>16)+f((n>>8)&255)+f(n&255);}
  return {element:root,stop,get live(){return live;}};
}
