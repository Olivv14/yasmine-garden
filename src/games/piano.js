// Piano tiles in colour (approved PianoGrand): full screen at dusk, glowing tiles fall in four columns to the beat of a
// song you uploaded (or the app's own song). Classic rules (piano-rules.js): tap the lowest tile, hold the long ones,
// nothing at the bottom of the screen. The song's beats are found on the phone (onsets), so any song works.
// A finished game is saved as a game event ('piano', backend/013): the score, the stars (a point each) and the song.
import {detectOnsets,gridBeats,chart,seeded,hashText,newRun,tap,release,advance,tileBox,stars,progress,LANES} from './piano-rules.js';
import {icon} from '../design/icons.js';

// Lane colours from the mockup: gold, pink, green, blue. [base, light, dark]
const COLORS=[['#FFC65A','#FFF4D0','#C8862A'],['#FF7FA6','#FFE0EA','#C8456E'],['#5ED494','#E0FFF0','#2E9A62'],['#7FA2FF','#E6EEFF','#4A62D0']];
const SPEED=.5,TILE=.2,HIT=.86,LEAD=2.2;
const BUILTIN={id:'builtin',title:'Love Frequency',artist:'Adeline Yeo',url:'./assets/love-frequency-adeline-yeo.mp3'};
const STAR='M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z';
const svgNS='http://www.w3.org/2000/svg';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function starIcon(on){const s=document.createElementNS(svgNS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('width','20');s.setAttribute('height','20');s.setAttribute('aria-hidden','true');
  const p=document.createElementNS(svgNS,'path');p.setAttribute('d',STAR);p.setAttribute('fill',on?'#FFD58A':'none');p.setAttribute('stroke','#FFD58A');p.setAttribute('stroke-width','1.4');s.append(p);s.classList.toggle('on',on);return s;}
// The dusk behind the tiles: blurred hills, string lights, column lines (drawn once, as in the mockup)
function scenery(){
  const wrap=document.createElement('div');wrap.className='pn-scene';wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML='<svg class="pn-hills" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice"><circle cx="300" cy="150" r="40" fill="#FFE6B8" opacity=".6"/><path d="M0 640 C40 610 60 540 72 470 C84 540 100 600 140 620 L140 844 H0Z M250 650 C280 620 300 550 312 480 C324 550 340 620 390 632 V844 H250Z" fill="#160E14"/><path d="M0 720 Q195 670 390 720 V844 H0Z" fill="#1E1418"/></svg>'
    +'<svg class="pn-lights" viewBox="0 0 390 110" preserveAspectRatio="none"><defs><radialGradient id="pnBulb"><stop offset="0" stop-color="#FFE4A0" stop-opacity=".95"/><stop offset=".4" stop-color="#FFB86A" stop-opacity=".35"/><stop offset="1" stop-color="#FFB86A" stop-opacity="0"/></radialGradient></defs><path d="M-10 30 Q 90 70 190 70 T 400 36" fill="none" stroke="#1A1018" stroke-width="1.4"/>'
    +[[30,40],[88,58],[150,68],[214,70],[276,62],[336,48]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="url(#pnBulb)"/><ellipse cx="${x}" cy="${y+1}" rx="2.4" ry="3.4" fill="#FFF0C8"/>`).join('')+'</svg>'
    +'<i class="pn-col"></i><i class="pn-col"></i><i class="pn-col"></i><span class="pn-top"></span>';
  return wrap;
}

export function createPiano({el,button,t,copy,me,getSnapshot,download,record}){
  const root=el('div',undefined,'game-card piano-card');
  let view='songs',ctx=null,source=null,startAt=0,run=null,song=null,raf=0,canvas=null,g2=null,geo=null,bursts=[],paused=false,pointerHold=null,saved=false,loading=false,flash=null;
  const charts=new Map();

  const songs=()=>{const snap=getSnapshot();const ready=new Set((snap?.media??[]).filter(m=>m.status==='ready').map(m=>m.content_id));
    return [BUILTIN,...(snap?.content??[]).filter(c=>c.item_type==='track'&&!c.deleted_at&&ready.has(c.id)).map(c=>({id:c.id,title:c.title||'',media:(snap.media??[]).find(m=>m.content_id===c.id&&m.status==='ready')}))];};
  const best=title=>{let b=null;for(const e of getSnapshot()?.gameEvents??[])if(e.game==='piano'&&e.kind==='finish'&&e.profile_id===me()&&e.response===title&&(!b||e.score_me>b.score_me))b=e;return b;};

  // ---- the list of songs
  function paintSongs(){
    view='songs';root.replaceChildren();
    const head=el('div',undefined,'pn-head');head.append(el('p',()=>t('piano.eyebrow'),'pn-eyebrow'),el('h3',()=>t('piano.title'),'pn-title'),el('p',()=>t('piano.intro'),'pn-intro'));
    const list=el('div',undefined,'pn-songs');
    for(const s of songs()){
      const row=el('div',undefined,'pn-song'),b=best(s.title),words=el('div',undefined,'pn-song-words');
      const ti=el('b');ti.textContent=s.title||'·';ti.dir='auto';words.append(ti);
      if(s.artist){const a=el('small');a.textContent=s.artist;words.append(a);}
      const st=el('span',undefined,'pn-song-stars');for(let i=0;i<3;i++)st.append(starIcon(b&&b.score_partner>i));
      if(b){const n=el('small',()=>t('piano.best',{score:b.score_me}));words.append(n);}
      const go=button(()=>t('piano.play'),()=>start(s),'primary pn-go');row.append(words,st,go);list.append(row);
    }
    root.append(head,list,el('p',()=>t('piano.uploadHint'),'small pn-hint'));
  }

  // ---- playing
  async function start(s){
    if(loading)return;loading=true;song=s;saved=false;
    root.replaceChildren();const wait=el('div',undefined,'pn-loading');wait.append(el('p',()=>t('piano.listening'),'pn-intro'));root.append(wait);
    try{
      ctx?.close?.().catch(()=>{});ctx=new (window.AudioContext||window.webkitAudioContext)();
      const bytes=s.url?await (await fetch(new URL(s.url,document.baseURI))).arrayBuffer():await (await download(s.media)).arrayBuffer();
      const buffer=await ctx.decodeAudioData(bytes);
      let tiles=charts.get(s.id);
      if(!tiles){
        // every 4th sample of the first channel is plenty to hear the beats
        const ch=buffer.getChannelData(0),step=Math.max(1,Math.round(buffer.sampleRate/11025)),mono=new Float32Array(Math.floor(ch.length/step));
        for(let i=0;i<mono.length;i++)mono[i]=ch[i*step];
        let beats=detectOnsets(mono,buffer.sampleRate/step,{minGap:.3});
        if(beats.length<buffer.duration/3)beats=gridBeats(buffer.duration,96);
        tiles=chart(beats,buffer.duration,seeded(hashText(s.id+':'+s.title)));charts.set(s.id,tiles);
      }
      run=newRun(tiles,buffer.duration);paintBoard();
      source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);
      startAt=ctx.currentTime+LEAD;source.start(startAt);paused=false;
      loop();
    }catch{paintSongs();root.prepend(el('p',()=>t('piano.cannotPlay'),'pn-error'));}
    finally{loading=false;}
  }
  const now=()=>ctx?ctx.currentTime-startAt:0;
  function paintBoard(){
    view='play';root.replaceChildren();
    const board=el('div',undefined,'pn-board');board.append(scenery());
    canvas=document.createElement('canvas');canvas.className='pn-canvas';copy(canvas,()=>t('piano.boardLabel'),'aria-label');canvas.setAttribute('role','application');
    const hud=el('div',undefined,'pn-hud'),starsEl=el('span',undefined,'pn-stars');
    const score=el('span',undefined,'pn-score'),num=el('b'),combo=el('span');score.append(num,combo);
    const pause=button(()=>'',()=>togglePause(),'pn-pause');pause.append(icon('pause',16));copy(pause,()=>t('piano.pause'),'aria-label');
    hud.append(starsEl,score,pause);
    const bar=el('div',undefined,'pn-progress'),fill=el('i');bar.append(fill);
    const caption=el('p',undefined,'pn-caption');caption.textContent=song.title;caption.dir='auto';
    board.append(canvas,hud,bar,caption);root.append(board);
    hudRefs={starsEl,num,combo,fill,last:''};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
    resize();
  }
  let hudRefs=null;
  function resize(){
    if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);g2=canvas.getContext('2d');g2.setTransform(dpr,0,0,dpr,0,0);
    geo={width:r.width,height:r.height,hitY:r.height*HIT,speed:SPEED,tileH:r.height*TILE};
  }
  addEventListener('resize',()=>{if(view==='play')resize();});
  function down(e){
    if(!run||paused||!geo)return;e.preventDefault();
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,lane=Math.max(0,Math.min(LANES-1,Math.floor(x/(r.width/LANES))));
    const res=tap(run,lane,y,now(),geo);
    if(res.kind==='hit'||res.kind==='hold'){burst(res.tile);if(res.kind==='hold'){pointerHold=e.pointerId;canvas.setPointerCapture?.(e.pointerId);}navigator.vibrate?.(8);}
    if(res.kind==='miss'){flash={lane,y,at:performance.now()};finish();}
  }
  function up(e){if(run&&run.holding&&(pointerHold===null||e.pointerId===pointerHold)){release(run,now());pointerHold=null;if(run.done)finish();}}
  function burst(tile){if(!reduced())bursts.push({lane:tile.lane,at:performance.now()});}
  function togglePause(){
    if(!ctx||!run||run.over||run.done)return;paused=!paused;
    if(paused){ctx.suspend();showPause();}else{root.querySelector('.pn-overlay')?.remove();ctx.resume();loop();}
  }
  function showPause(){
    const o=el('div',undefined,'pn-overlay');const card=el('div',undefined,'pn-result');
    card.append(el('h3',()=>t('piano.paused'),'pn-title'),button(()=>t('piano.resume'),()=>togglePause(),'primary'),button(()=>t('piano.quit'),()=>{stopAudio();paintSongs();},'pn-secondary'));
    o.append(card);root.querySelector('.pn-board')?.append(o);
  }
  function loop(){cancelAnimationFrame(raf);const f=()=>{if(paused||view!=='play')return;draw();if(run&&!run.over&&!run.done){const ev=advance(run,now(),geo);if(ev?.kind==='passed'){flash={lane:ev.tile.lane,y:geo.height-10,at:performance.now()};finish();}else if(run.done)finish();}raf=requestAnimationFrame(f);};raf=requestAnimationFrame(f);}

  function roundRect(x,y,w,h,r){g2.beginPath();g2.moveTo(x+r,y);g2.arcTo(x+w,y,x+w,y+h,r);g2.arcTo(x+w,y+h,x,y+h,r);g2.arcTo(x,y+h,x,y,r);g2.arcTo(x,y,x+w,y,r);g2.closePath();}
  function draw(){
    if(!g2||!geo)return;const {width:W,height:H}=geo,lw=W/LANES,t0=now();g2.clearRect(0,0,W,H);
    const from=Math.max(0,run.next-2);
    for(let i=from;i<run.tiles.length;i++){
      const tile=run.tiles[i],box=tileBox(tile,t0,geo);if(box.bottom<0)break;if(box.top>H)continue;
      const [c,l,d]=COLORS[tile.lane],x=tile.lane*lw+3,w=lw-6,y=box.top+2,h=box.h-4,played=i<run.next,held=run.holding?.i===tile.i;
      g2.save();g2.globalAlpha=played?.18:1;
      if(!played){g2.shadowColor=c;g2.shadowBlur=18;}
      const grad=g2.createLinearGradient(0,y+h,0,y);grad.addColorStop(0,c);grad.addColorStop(.12,l);grad.addColorStop(.44,c);grad.addColorStop(1,d);
      roundRect(x,y,w,h,8);g2.fillStyle=grad;g2.fill();g2.shadowBlur=0;
      // sheen on top, a soft edge, the white bar where your finger goes
      const sheen=g2.createLinearGradient(0,y,0,y+h*.36);sheen.addColorStop(0,'rgba(255,255,255,.28)');sheen.addColorStop(1,'rgba(255,255,255,0)');g2.fillStyle=sheen;roundRect(x,y,w,Math.min(h,h*.36+8),8);g2.fill();
      g2.strokeStyle='rgba(255,255,255,.55)';g2.lineWidth=1;roundRect(x+.5,y+.5,w-1,h-1,8);g2.stroke();
      g2.fillStyle='rgba(255,255,255,.95)';roundRect(x+w/2-14,y+h-14,28,4,2);g2.fill();
      if(tile.len){
        g2.fillStyle='rgba(255,255,255,.6)';roundRect(x+w/2-2,y+14,4,h-28,2);g2.fill();
        if(held){const part=Math.max(0,Math.min(1,(t0-tile.t)/tile.len)),fh=h*part,fg=g2.createLinearGradient(0,y+h,0,y+h-fh);fg.addColorStop(0,'#FFFFFF');fg.addColorStop(.22,l);fg.addColorStop(.8,c);fg.addColorStop(1,'#FFFFFF');
          g2.fillStyle=fg;roundRect(x,y+h-fh,w,fh,8);g2.fill();}
      }else if(!played){ // the little note in the middle
        g2.globalAlpha=.55;g2.strokeStyle='#FFFFFF';g2.fillStyle='#FFFFFF';g2.lineWidth=1.8;const cx=x+w/2,cy=y+h*.42;
        g2.beginPath();g2.moveTo(cx-4,cy+7);g2.lineTo(cx-4,cy-5);g2.lineTo(cx+6,cy-7);g2.lineTo(cx+6,cy+4);g2.stroke();
        g2.beginPath();g2.arc(cx-6.5,cy+7,2.6,0,7);g2.fill();g2.beginPath();g2.arc(cx+3.5,cy+4,2.6,0,7);g2.fill();
      }
      g2.restore();
    }
    // bursts of light where you tapped
    const ms=performance.now();bursts=bursts.filter(b=>ms-b.at<420);
    for(const b of bursts){const k=(ms-b.at)/420,[c,l]=COLORS[b.lane],cx=b.lane*lw+lw/2,cy=geo.hitY;
      g2.save();g2.globalAlpha=1-k;const rg=g2.createRadialGradient(cx,cy,0,cx,cy,60+40*k);rg.addColorStop(0,'#FFFFFF');rg.addColorStop(.3,l);rg.addColorStop(.55,c+'66');rg.addColorStop(1,'rgba(0,0,0,0)');
      g2.fillStyle=rg;g2.fillRect(cx-110,cy-110,220,220);g2.strokeStyle=l;g2.lineWidth=2;
      for(let a=-80;a<=80;a+=32){const r=(a*Math.PI)/180-Math.PI/2,d=22+28*k;g2.beginPath();g2.moveTo(cx+Math.cos(r)*d,cy+Math.sin(r)*d);g2.lineTo(cx+Math.cos(r)*(d+14),cy+Math.sin(r)*(d+14));g2.stroke();}
      g2.restore();}
    if(flash){const k=Math.min(1,(ms-flash.at)/600);g2.save();g2.globalAlpha=.55*(1-k);g2.fillStyle='#FF5A5A';g2.fillRect(flash.lane*lw,0,lw,H);g2.restore();}
    // the numbers on top
    if(hudRefs){const s=stars(run),key=run.score+'|'+run.combo+'|'+s;
      if(key!==hudRefs.last){hudRefs.last=key;hudRefs.num.textContent=String(run.score);copy(hudRefs.combo,()=>run.combo>1?t('piano.combo',{count:run.combo}):'');
        hudRefs.starsEl.replaceChildren(...[0,1,2].map(i=>starIcon(s>i)));}
      hudRefs.fill.style.inlineSize=(progress(run)*100).toFixed(1)+'%';}
  }
  async function finish(){
    if(!run||saved)return;saved=true;const s=stars(run),score=run.score;
    setTimeout(()=>{stopAudio(true);showResult(s,score);},run.done?500:700);
    if(score>0)await record({game:'piano',kind:'finish',response:song.title.slice(0,200)||'·',scoreMe:Math.min(32000,score),scorePartner:s});
  }
  function showResult(s,score){
    const board=root.querySelector('.pn-board');if(!board)return;const o=el('div',undefined,'pn-overlay'),card=el('div',undefined,'pn-result');
    const st=el('div',undefined,'pn-result-stars');for(let i=0;i<3;i++){const x=starIcon(s>i);x.setAttribute('width','40');x.setAttribute('height','40');st.append(x);}
    const n=el('p',undefined,'pn-result-score');n.textContent=String(score);
    card.append(st,n,el('p',()=>run?.done?t('piano.finished'):t('piano.over'),'pn-intro'),el('p',()=>t('piano.points',{count:s}),'small'),
      button(()=>t('piano.again'),()=>start(song),'primary'),button(()=>t('piano.songs'),()=>paintSongs(),'pn-secondary'));
    o.append(card);board.append(o);
  }
  function stopAudio(keepView){cancelAnimationFrame(raf);try{source?.stop();}catch{}source=null;paused=false;pointerHold=null;
    const c=ctx;ctx=null;c?.close?.().catch(()=>{});if(!keepView){run=null;canvas=null;g2=null;}}

  return {element:root,render(){if(view==='songs')paintSongs();},stop(){stopAudio();view='songs';}};
}
