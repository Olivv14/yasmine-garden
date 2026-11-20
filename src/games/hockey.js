// Air hockey in the garden at dusk (the approved HockeyGarden design), full screen. Two ways to play.
// Live: a private Realtime channel ("hockey:<pair>", backend/005 policies); slot 1 hosts the physics, the guest
// sends its mallet and draws the host's state mirrored, so each player always defends the bottom of their screen.
// Against the toad: everything runs on this phone; pick the Dreamer, the Coach or the Champion from their cards.
// The table is the mockup's own art; puck and mallets are drawn on top through the table's perspective (persp.js).
import {TABLE,clampMallet,step,servePuck} from './rules.js';
import {toadMove,levelOrDefault} from './bot.js';
import {createToadPicker} from './toads.js';
import {LEVEL_CARD} from '../shop/items.js';
import {SCENE_ART} from './scene-art.js';
import {homography} from './persp.js';
import {icon} from '../design/icons.js';

const SEND_MS=33,WIN=7;
// the drawn table's playing surface in the art's coordinates (far-left, far-right, near-right, near-left)
const SURFACE=homography([[70,64],[300,64],[334,470],[36,470]]),ART_W=370,ART_H=560;
// mallet colours: Oliver's red, Yasmine's green, the toad's clay
const MALLET={oliver:['#FFC9C0','#E0473C','#8A1A14','#4A0C08'],yasmine:['#D8FFE6','#2FB070','#0E5A34','#06301A'],toad:['#D9F2C2','#8CC06A','#3F7A30','#1F4418']};
const SCORE_TINT={oliver:'#FFB4A8',yasmine:'#C6EDA8',toad:'#C6EDA8'};

export function createHockey({el,button,t,copy,getClient,pairId,me,isHost,partner,person,tones,record,notify,photo=()=>null}){
  const root=el('article',undefined,'card game-card hockey-card');root.id='airHockey';
  // home: title, the two ways to play, and the toad cards
  const home=el('div',undefined,'hk-home');
  const head=el('div',undefined,'game-head');head.append(icon('live',22),el('h3',()=>t('game.hockey.title'),'title'));
  const intro=el('p',()=>t('game.hockey.intro'),'small');
  const join=button(()=>t('game.hockey.join'),()=>start(),'primary');join.id='hockeyJoin';
  const bot=button(()=>t('game.hockey.bot'),()=>{picker.hidden=!picker.hidden;if(!picker.hidden)picker.scrollIntoView?.({block:'start',behavior:'smooth'});},'');bot.id='hockeyBot';
  const starts=el('div',undefined,'game-actions');starts.append(join,bot);
  const picker=createToadPicker({el,button,t,copy,choose:level=>startBot(level),game:'hockey'});picker.hidden=true;
  home.append(head,intro,starts,picker);
  // the match: chip, scoreboard, table, status
  const match=el('div',undefined,'hk-match');match.hidden=true;
  const chip=el('span',undefined,'game-chip in-bar');
  const board=el('div',undefined,'hk-board');
  const faceMe=el('span',undefined,'hk-face'),faceThem=el('span',undefined,'hk-face'),scoreMe=el('b'),scoreThem=el('b');
  const nums=el('div',undefined,'hk-score');nums.append(scoreMe,el('span','–','hk-dash'),scoreThem);
  const row=el('div',undefined,'hk-board-row');row.append(faceMe,nums,faceThem);
  const caption=el('p',undefined,'hk-caption');board.append(row,caption);
  const score=el('p',undefined,'visually-hidden hockey-score');score.setAttribute('aria-live','polite');
  const stageBox=el('div',undefined,'hk-table scene-art');
  const art=el('div',undefined,'hk-art');art.innerHTML=SCENE_ART.hockeyTable;
  const toadLayer=el('div',undefined,'hk-toad');toadLayer.innerHTML=SCENE_ART.hockeyToad;toadLayer.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.className='hockey-table';canvas.tabIndex=0;canvas.setAttribute('role','img');copy(canvas,()=>t('game.hockey.canvas')+' '+t('game.hockey.keys'),'aria-label');
  stageBox.append(art,toadLayer,canvas);
  const status=el('p',undefined,'hk-status');status.setAttribute('role','status');status.id='hockeyStatus';
  const again=button(()=>t('game.hockey.again'),()=>{if(host())reset();else send('again',{});},'primary');again.hidden=true;
  const leave=button(()=>t('game.hockey.leave'),()=>stop(),'quiet');
  const foot=el('div',undefined,'game-actions hk-foot');foot.append(again,leave);
  match.append(chip,board,score,stageBox,status,foot);
  root.append(home,match);

  // mode: null (not playing), 'live' (with your partner), 'bot' (against the toad)
  let mode=null,channel=null,live=false,raf=0,lastSend=0,state=null,mine=null,theirs=null,lastMine=null,lastTheirs=null,recordedId=null,pause=0,level='medium',memo={},trail=[];
  const host=()=>mode==='bot'||isHost();
  const ctx=canvas.getContext('2d');
  function fresh(){return {puck:servePuck(Math.random()<.5?'host':'guest'),host:[TABLE.w/2,TABLE.h*.85],guest:[TABLE.w/2,TABLE.h*.15],score:[0,0],over:false};}
  const setStatus=fn=>copy(status,fn);
  const myTone=()=>tones().me==='yasmine'?'yasmine':'oliver',theirTone=()=>mode==='bot'?'toad':tones().partner==='yasmine'?'yasmine':'oliver';
  function paintScore(){
    if(!state){score.textContent='';return;}const [h,g]=state.score,[m,o]=host()?[h,g]:[g,h];
    copy(score,()=>mode==='bot'?t('game.hockey.botScore',{me:m,them:o}):t('game.hockey.score',{me:m,them:o,name:person(partner())}));
    scoreMe.textContent=String(m);scoreThem.textContent=String(o);scoreMe.style.color=SCORE_TINT[myTone()];scoreThem.style.color=SCORE_TINT[theirTone()];
  }
  function face(slot,who){slot.replaceChildren();slot.className='hk-face';
    if(who==='toad'){slot.classList.add('hk-face-toad','lvl-'+level);slot.append(el('span',()=>t('game.hockey.level.'+level)));return;}
    slot.classList.add('tone-'+(who===me()?myTone():theirTone()));
    const src=photo(who);if(src){const img=document.createElement('img');img.src=src;img.alt='';slot.append(img);}
    else slot.textContent=(person(who)||'?').trim().charAt(0).toUpperCase();}
  function faces(){face(faceMe,me());face(faceThem,mode==='bot'?'toad':partner());toadLayer.hidden=mode!=='bot';
    const them=()=>mode==='bot'?t('game.hockey.toadName',{level:t('game.hockey.level.'+level+'.name')}):person(partner());
    copy(chip,()=>mode==='bot'?t('game.hockey.vs',{name:t('game.hockey.level.'+level+'.name'),level:t('game.hockey.level.'+level)}):person(partner()));
    copy(caption,()=>t('game.hockey.caption',{me:person(me()),them:them(),win:WIN}));}
  function send(event,payload){channel?.send({type:'broadcast',event,payload}).catch(()=>{});}
  // while a table is on screen the floating heart steps aside
  function playing(on){home.hidden=on;match.hidden=!on;picker.hidden=true;document.documentElement.classList.toggle('hockey-on',on);}

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
        if(st==='SUBSCRIBED'){await channel.track({at:Date.now()});playing(true);faces();join.disabled=false;setLive(false);}
        else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){setStatus(()=>t('game.hockey.offline'));join.disabled=false;stop(false);}
      });
  }
  function startBot(choice){
    stop(false);mode='bot';level=levelOrDefault(choice);memo={};playing(true);faces();live=true;
    setStatus(()=>t('game.hockey.botLive'));reset();resize();if(!raf)raf=requestAnimationFrame(loop);canvas.focus({preventScroll:true});
  }
  function stop(clearStatus=true){
    cancelAnimationFrame(raf);raf=0;const ch=channel;channel=null;live=false;if(ch)getClient()?.removeChannel(ch);
    playing(false);again.hidden=true;state=null;mine=null;theirs=null;lastMine=null;lastTheirs=null;mode=null;trail=[];paintScore();if(clearStatus)copy(status,'');
  }
  function setLive(on){
    live=on;
    setStatus(()=>on?t('game.hockey.live',{name:person(partner())}):t('game.hockey.waiting',{name:person(partner())}));
    if(on){faces();if(isHost()&&(!state||state.over))reset();mine??=isHost()?[TABLE.w/2,TABLE.h*.85]:[TABLE.w/2,TABLE.h*.15];resize();if(!raf)raf=requestAnimationFrame(loop);}
    else{cancelAnimationFrame(raf);raf=0;}
  }
  function reset(){state=fresh();mine=[...state.host];theirs=[...state.guest];recordedId=null;pause=performance.now()+700;again.hidden=true;trail=[];paintScore();
    if(mode==='bot')setStatus(()=>t('game.hockey.botLive'));}
  function receive(p){
    const wasOver=state?.over;state={puck:p.puck,host:p.host,guest:p.guest,score:p.score,over:p.over};paintScore();
    if(state.over&&!wasOver)finished();if(!state.over)again.hidden=true;
  }
  function finished(){
    again.hidden=false;const [h,g]=state.score,[m,o]=host()?[h,g]:[g,h];
    if(mode==='bot'){
      setStatus(()=>m>o?t('game.hockey.botWon',{me:m,them:o}):t('game.hockey.botLost',{me:m,them:o}));
      if(!recordedId){recordedId=crypto.randomUUID();record({id:recordedId,game:'hockey_bot',kind:'finish',card:LEVEL_CARD[level],scoreMe:m,scorePartner:o});}
      return;
    }
    setStatus(()=>m>o?t('game.hockey.won',{me:m,them:o}):t('game.hockey.lost',{name:person(partner()),me:m,them:o}));
    if(isHost()&&!recordedId){recordedId=crypto.randomUUID();record({id:recordedId,game:'hockey',kind:'finish',scoreMe:h,scorePartner:g});}
  }

  // Input: your finger moves your mallet in your half; the touch is mapped back through the table's perspective.
  let k=1;
  const toTable=(px,py)=>{const r=canvas.getBoundingClientRect();const [u,v]=SURFACE.from((px-r.left)/k,(py-r.top)/k);let x=u*TABLE.w,y=v*TABLE.h;if(!host()){x=TABLE.w-x;y=TABLE.h-y;}return [x,y];};
  const move=p=>{mine=clampMallet(p,host());};
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);move(toTable(e.clientX,e.clientY));});
  canvas.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType!=='mouse')move(toTable(e.clientX,e.clientY));});
  canvas.addEventListener('keydown',e=>{if(!mine)return;const d=.05,f=host()?1:-1,kk={ArrowLeft:[-d*f,0],ArrowRight:[d*f,0],ArrowUp:[0,-d*f],ArrowDown:[0,d*f]}[e.key];if(kk){e.preventDefault();move([mine[0]+kk[0],mine[1]+kk[1]]);}});
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
        if(r.scored){state.score[r.scored==='host'?0:1]++;state.puck=servePuck(r.scored==='host'?'guest':'host');pause=now+900;trail=[];paintScore();if(Math.max(...state.score)>=WIN){state.over=true;finished();}}
      }
      lastMine=[...state.host];lastTheirs=[...state.guest];
      if(mode==='live'&&now-lastSend>SEND_MS){lastSend=now;send('s',{puck:state.puck.map(v=>+v.toFixed(4)),host:state.host,guest:state.guest,score:state.score,over:state.over});}
    }else if(mine&&now-lastSend>SEND_MS){lastSend=now;send('m',{p:mine.map(v=>+v.toFixed(4))});}
    draw();
  }
  // The table keeps the art's proportions and fills the space left between the scoreboard and the status.
  function resize(){
    const avail=Math.max(260,(innerHeight||800)-(board.offsetHeight||110)-170),w=Math.min(stageBox.parentElement?.clientWidth||root.clientWidth||360,ART_W*1.25,avail*ART_W/ART_H);
    const h=w*ART_H/ART_W,dpr=Math.min(2,devicePixelRatio||1);
    stageBox.style.width=w+'px';stageBox.style.height=h+'px';canvas.width=w*dpr;canvas.height=h*dpr;k=w/ART_W;ctx.setTransform(dpr*k,0,0,dpr*k,0,0);
  }
  new ResizeObserver(()=>{if(live)resize();}).observe(root);
  addEventListener('resize',()=>{if(live)resize();});

  // Drawing in the art's units: everything through the table's perspective, the farthest first.
  const at=([x,y])=>{const u=host()?x/TABLE.w:1-x/TABLE.w,v=host()?y/TABLE.h:1-y/TABLE.h;return {p:SURFACE.to(u,v),s:SURFACE.scale(u,v)};};
  function ellipse(x,y,rx,ry,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,6.2832);ctx.fill();}
  function mallet(pos,set){
    const {p:[x,y],s}=at(pos),r=TABLE.mallet*s,[c0,c1,c2,c3]=set;
    const sh=ctx.createRadialGradient(x+4,y+r*.5,1,x+4,y+r*.5,r*1.3);sh.addColorStop(0,'rgba(26,42,52,.5)');sh.addColorStop(1,'rgba(26,42,52,0)');ellipse(x+4,y+r*.45,r*1.3,r*.5,sh);
    ellipse(x,y+r*.17,r,r*.72,c3);
    const g=ctx.createRadialGradient(x-r*.24,y-r*.3,1,x,y,r*1.05);g.addColorStop(0,c0);g.addColorStop(.35,c1);g.addColorStop(.8,c2);g.addColorStop(1,c3);ellipse(x,y,r,r*.7,g);
    ellipse(x,y-r*.17,r*.43,r*.33,c3);
    const kg=ctx.createRadialGradient(x-r*.12,y-r*.48,1,x,y-r*.37,r*.45);kg.addColorStop(0,c0);kg.addColorStop(.5,c1);kg.addColorStop(1,c3);ellipse(x,y-r*.37,r*.43,r*.33,kg);
    ellipse(x-r*.17,y-r*.5,r*.17,r*.1,'rgba(255,255,255,.55)');ellipse(x-r*.33,y-r*.23,r*.33,r*.13,'rgba(255,255,255,.18)');
  }
  function puck(pos){
    const {p:[x,y],s}=at(pos),r=TABLE.puck*s;
    for(const [i,[tx,ty]] of trail.entries())ellipse(tx,ty,r,r*.66,`rgba(26,26,32,${(i/trail.length)*.12})`);
    trail.push([x,y]);if(trail.length>7)trail.shift();
    const sh=ctx.createRadialGradient(x+2,y+r*.6,1,x+2,y+r*.6,r*1.2);sh.addColorStop(0,'rgba(26,42,52,.45)');sh.addColorStop(1,'rgba(26,42,52,0)');ellipse(x+2,y+r*.55,r*1.15,r*.45,sh);
    ellipse(x,y+r*.2,r,r*.72,'#050507');
    const g=ctx.createRadialGradient(x-r*.16,y-r*.2,1,x,y,r);g.addColorStop(0,'#5A5A64');g.addColorStop(.6,'#1A1A20');g.addColorStop(1,'#050507');ellipse(x,y,r,r*.68,g);
    ellipse(x-r*.33,y-r*.27,r*.33,r*.17,'rgba(255,255,255,.35)');
  }
  function draw(){
    if(!state)return;ctx.clearRect(0,0,ART_W,ART_H);
    const hostPos=host()?(mine??state.host):state.host,guestPos=host()?state.guest:(mine??state.guest);
    const meSet=MALLET[myTone()],themSet=MALLET[theirTone()];
    const items=[{pos:hostPos,draw:()=>mallet(hostPos,host()?meSet:themSet)},{pos:guestPos,draw:()=>mallet(guestPos,host()?themSet:meSet)},{pos:state.puck,draw:()=>puck(state.puck)}];
    items.sort((a,b)=>at(a.pos).p[1]-at(b.pos).p[1]);for(const i of items)i.draw();
  }
  return {element:root,stop,get live(){return live;}};
}
