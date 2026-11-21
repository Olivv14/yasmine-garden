// Questions as messages in a bottle (approved QMore5 #3). A night sea is drawn live: waves, moonlight on the
// water, stars, and a glass bottle. Each blind round is a bottle:
//  - nothing open: choose a question, write, throw the bottle;
//  - your bottle is out: it drifts on the horizon until your partner answers;
//  - a bottle washed up: your partner sent a question; answer it and throw it back;
//  - opened bottles: both answers, read side by side.
// The rounds themselves are unchanged (start_round / submit_round_answer, answers hidden until both wrote).
import {openSheet} from '../design/sheet.js';
import {icon} from '../design/icons.js';
import {QUESTION_BANK} from '../../experience/questions.mjs';

export function createBottles({$,el,button,t,copy,locale,getSnapshot,me,person,partner,throwBottle,answerBottle,openPrize,openAlbum,prizes,notify}){
  const page=$('page-questions');if(!page)return {render(){},clear(){}};
  const root=el('section',undefined,'bt');page.prepend(root);page.classList.add('bt-on');
  const canvas=document.createElement('canvas');canvas.className='bt-sea';canvas.setAttribute('role','img');copy(canvas,()=>t('bt.seaLabel'),'aria-label');
  const card=el('div',undefined,'bt-card'),opened=el('div',undefined,'bt-opened');
  const notesLink=button(()=>t('bt.notes'),()=>page.classList.toggle('bt-notes'),'bt-notes-link');
  root.append(canvas,card,opened,notesLink);
  let state='none',theme='all',chosen=null,draft='',busy=false;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dateFmt=v=>new Intl.DateTimeFormat(locale()==='aeb-TN'?'ar-TN':locale(),{day:'numeric',month:'short'}).format(new Date(v));
  const prompt=id=>t('questions.'+id),themeOf=id=>QUESTION_BANK.find(q=>q.id===id)?.themeId;

  // ---------------- the sea (canvas, drawn every frame while visible)
  const sea={w:0,h:0,dpr:1,t:0,bottle:{x:.5,y:.62,s:1,a:1,glow:0},target:null,throwAt:0,stars:[]};
  for(let i=0;i<70;i++)sea.stars.push({x:Math.random(),y:Math.random()*.42,r:Math.random()*1.2+.3,p:Math.random()*6});
  function size(){const r=canvas.getBoundingClientRect();sea.dpr=Math.min(2.5,devicePixelRatio||1);sea.w=r.width;sea.h=r.height;canvas.width=Math.round(r.width*sea.dpr);canvas.height=Math.round(r.height*sea.dpr);}
  const POS={none:{x:.24,y:.91,s:.62,a:1,glow:0},sent:{x:.72,y:.47,s:.32,a:.9,glow:0},arrived:{x:.42,y:.74,s:1.05,a:1,glow:1},thrown:{x:.8,y:.42,s:.2,a:0,glow:0}};
  const horizon=()=>sea.h*.46;
  function wave(x,base,amp,len,speed,phase){return base+Math.sin(x/len+sea.t*speed+phase)*amp+Math.sin(x/(len*.43)-sea.t*speed*1.3+phase*2)*amp*.35;}
  function drawSky(g){const H=horizon();const sky=g.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#0B0E2A');sky.addColorStop(.55,'#1F2148');sky.addColorStop(1,'#5A3C66');g.fillStyle=sky;g.fillRect(0,0,sea.w,H+2);
    for(const s of sea.stars){const tw=.55+.45*Math.sin(sea.t*1.6+s.p);g.globalAlpha=tw;g.fillStyle='#FFF4C8';g.beginPath();g.arc(s.x*sea.w,s.y*sea.h,s.r,0,7);g.fill();}g.globalAlpha=1;
    // the moon with its halo
    const mx=sea.w*.78,my=sea.h*.16,mr=Math.max(14,sea.w*.045);const halo=g.createRadialGradient(mx,my,mr*.5,mx,my,mr*4);halo.addColorStop(0,'rgba(255,244,200,.35)');halo.addColorStop(1,'rgba(255,244,200,0)');g.fillStyle=halo;g.fillRect(mx-mr*4,my-mr*4,mr*8,mr*8);
    const disc=g.createRadialGradient(mx-mr*.3,my-mr*.3,mr*.1,mx,my,mr);disc.addColorStop(0,'#FFFBE8');disc.addColorStop(1,'#F2DFA8');g.fillStyle=disc;g.beginPath();g.arc(mx,my,mr,0,7);g.fill();
    g.fillStyle='rgba(200,180,140,.25)';for(const [dx,dy,r] of [[-.3,-.1,.22],[.25,.2,.16],[.05,.35,.1]]){g.beginPath();g.arc(mx+dx*mr,my+dy*mr,r*mr,0,7);g.fill();}}
  function drawSea(g){const H=horizon();const water=g.createLinearGradient(0,H,0,sea.h);water.addColorStop(0,'#2A3A6A');water.addColorStop(.5,'#16305A');water.addColorStop(1,'#0B1A34');g.fillStyle=water;g.fillRect(0,H,sea.w,sea.h-H);
    // moonlight path: short glittering strokes that come and go
    const mx=sea.w*.78;for(let i=0;i<90;i++){const k=i/90,y=H+4+k*(sea.h-H)*.75,spread=8+k*sea.w*.22,ph=i*12.9898;
      const x=mx+Math.sin(ph)*spread*(.5+.5*Math.sin(sea.t*.7+ph));const on=.5+.5*Math.sin(sea.t*2.2+ph*3);if(on<.35)continue;
      g.globalAlpha=(1-k*.8)*on*.85;g.fillStyle='#FFF4C8';g.fillRect(x,y,4+k*14,1.4+k*1.2);}g.globalAlpha=1;
    // wave layers, back to front
    const layers=[[H+10,3,60,.6,'rgba(70,100,160,.35)'],[H+(sea.h-H)*.3,5,80,.8,'rgba(40,70,130,.5)'],[H+(sea.h-H)*.55,7,95,1,'rgba(25,52,105,.6)']];
    for(const [base,amp,len,sp,col] of layers){g.fillStyle=col;g.beginPath();g.moveTo(0,sea.h);for(let x=0;x<=sea.w+8;x+=8)g.lineTo(x,wave(x,base,amp,len,sp,base));g.lineTo(sea.w,sea.h);g.closePath();g.fill();
      g.strokeStyle='rgba(169,216,255,.25)';g.lineWidth=1.2;g.beginPath();for(let x=0;x<=sea.w+8;x+=8){const y=wave(x,base,amp,len,sp,base);x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
    // the shore at the bottom
    const sand=g.createLinearGradient(0,sea.h*.86,0,sea.h);sand.addColorStop(0,'#C9A86A');sand.addColorStop(1,'#8A6A3A');g.fillStyle=sand;g.beginPath();g.moveTo(0,sea.h);
    for(let x=0;x<=sea.w+8;x+=8)g.lineTo(x,sea.h*.9+Math.sin(x/70)*4+Math.sin(sea.t*.9+x/40)*1.5);g.lineTo(sea.w,sea.h);g.closePath();g.fill();
    g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=2;g.beginPath();for(let x=0;x<=sea.w+8;x+=8){const y=sea.h*.9+Math.sin(x/70)*4+Math.sin(sea.t*.9+x/40)*1.5-2;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
  function drawBottle(g){const b=sea.bottle;if(b.a<=.01)return;const L=Math.min(sea.w,sea.h)*.42*b.s,ashore=state==='none';const x=b.x*sea.w,y=b.y*sea.h+(ashore?0:Math.sin(sea.t*1.6)*L*.04);
    g.save();g.globalAlpha=b.a;g.translate(x,y);g.rotate(ashore?-.12:-.35+Math.sin(sea.t*1.1)*.12);
    if(b.glow>0){const gl=g.createRadialGradient(0,0,L*.1,0,0,L*.9);gl.addColorStop(0,`rgba(255,213,138,${.35*b.glow})`);gl.addColorStop(1,'rgba(255,213,138,0)');g.fillStyle=gl;g.beginPath();g.arc(0,0,L*.9,0,7);g.fill();}
    const bw=L*.34,bl=L*.62;
    // the paper scroll inside
    g.fillStyle='#FBF3E4';g.fillRect(-bl*.36,-bw*.24,bl*.6,bw*.48);g.strokeStyle='#C9B58A';g.lineWidth=Math.max(1,L*.008);for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(-bl*.3,i*bw*.12);g.lineTo(bl*.18,i*bw*.12);g.stroke();}
    g.fillStyle='#C9443A';g.fillRect(-bl*.06,-bw*.26,bl*.05,bw*.52);
    // glass body, neck, cork
    const glass=g.createLinearGradient(0,-bw/2,0,bw/2);glass.addColorStop(0,'rgba(190,240,215,.55)');glass.addColorStop(.45,'rgba(120,200,170,.28)');glass.addColorStop(1,'rgba(60,140,120,.5)');
    g.fillStyle=glass;g.strokeStyle='rgba(230,255,245,.75)';g.lineWidth=Math.max(1.2,L*.012);
    g.beginPath();g.moveTo(-bl/2+bw/2,-bw/2);g.lineTo(bl*.22,-bw/2);g.quadraticCurveTo(bl*.34,-bw/2,bl*.36,-bw*.18);g.lineTo(bl*.52,-bw*.16);g.lineTo(bl*.52,bw*.16);g.lineTo(bl*.36,bw*.18);g.quadraticCurveTo(bl*.34,bw/2,bl*.22,bw/2);g.lineTo(-bl/2+bw/2,bw/2);
    g.arc(-bl/2+bw/2,0,bw/2,Math.PI/2,Math.PI*1.5);g.closePath();g.fill();g.stroke();
    g.fillStyle='#B5844A';g.fillRect(bl*.52,-bw*.15,bl*.1,bw*.3);g.fillStyle='rgba(0,0,0,.2)';g.fillRect(bl*.52,bw*.05,bl*.1,bw*.1);
    // the shine on the glass
    g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=Math.max(1.5,L*.018);g.lineCap='round';g.beginPath();g.moveTo(-bl*.32,-bw*.34);g.lineTo(bl*.16,-bw*.34);g.stroke();
    g.strokeStyle='rgba(255,255,255,.4)';g.beginPath();g.moveTo(bl*.38,-bw*.1);g.lineTo(bl*.48,-bw*.1);g.stroke();
    g.restore();
    // ripples around a floating bottle
    if(b.a>.3&&!ashore){g.strokeStyle='rgba(200,230,255,.35)';g.lineWidth=1.2;for(let i=0;i<2;i++){const k=((sea.t*.5+i*.5)%1);g.globalAlpha=(1-k)*b.a*.8;g.beginPath();g.ellipse(x,y+L*.12,L*(.3+k*.5),L*(.05+k*.08),0,0,7);g.stroke();}g.globalAlpha=1;}}
  function frame(dt){
    sea.t+=dt;const goal=POS[state]??POS.none,b=sea.bottle,k=Math.min(1,dt*(state==='thrown'?1.4:2.2));
    for(const key of ['x','y','s','a','glow'])b[key]+=(goal[key]-b[key])*k;
    const g=canvas.getContext('2d');g.setTransform(sea.dpr,0,0,sea.dpr,0,0);drawSky(g);drawSea(g);drawBottle(g);}
  let raf=0,last=0,onScreen=false;
  function loop(now){raf=0;if(!onScreen||document.hidden)return;const dt=last?Math.min(.05,(now-last)/1000):.016;last=now;frame(reduced()?dt*.25:dt);raf=requestAnimationFrame(loop);}
  const run=()=>{if(!raf&&onScreen&&!document.hidden){last=0;raf=requestAnimationFrame(loop);}};
  new IntersectionObserver(es=>{onScreen=es.some(e=>e.isIntersecting);if(onScreen){size();run();}}).observe(canvas);
  new ResizeObserver(()=>{size();if(!raf)frame(0);}).observe(canvas);
  document.addEventListener('visibilitychange',run);
  canvas.addEventListener('click',()=>{if(state==='arrived')card.querySelector('textarea')?.focus();});

  // ---------------- the words below the sea
  function rounds(){const s=getSnapshot();return {rs:s?.rounds??[],as:s?.answers??[]};}
  function current(){const {rs,as}=rounds();const open=rs.find(r=>!r.revealed_at);if(!open)return {open:null};
    const mine=as.find(a=>a.round_id===open.id&&a.owner_id===me());return {open,mine};}
  function paper(kicker,question,extra){const p=el('div',undefined,'bt-paper');p.append(el('span',kicker,'bt-kicker'));const q=el('b',undefined,'bt-question');q.textContent=question;q.dir='auto';p.append(q);if(extra)p.append(extra);return p;}
  function render(){
    if(!getSnapshot()||!me())return;const {open,mine}=current();
    const next=!open?'none':mine?'sent':'arrived';if(state!=='thrown'||Date.now()-sea.throwAt>1400)state=next;
    card.replaceChildren();
    if(next==='arrived'){const from=open.started_by===me()?t('bt.yourOwn'):t('bt.from',{name:person(open.started_by)});
      const area=document.createElement('textarea');area.rows=3;area.maxLength=20000;area.dir='auto';area.value=draft;copy(area,()=>t('bt.writeBack'),'placeholder');copy(area,()=>t('bt.writeBack'),'aria-label');area.oninput=()=>{draft=area.value;};
      card.append(paper(()=>t('bt.washedUp')+' · '+from,prompt(open.question_id),area),el('p',()=>t('bt.blindHint',{name:person(partner())}),'bt-hint'));
      const go=button(()=>t('bt.throwBack'),async()=>{const body=area.value.trim();if(!body||busy)return;busy=true;go.disabled=true;
        try{await answerBottle(open.id,body);draft='';throwAnim();notify(()=>t('bt.thrown'));}catch{notify(()=>t('bt.failed'));}finally{busy=false;go.disabled=false;}},'bt-go');go.prepend(icon('send',18));card.append(go);}
    else if(next==='sent'){const mineP=el('p',undefined,'bt-answer');mineP.textContent=mine.body;mineP.dir='auto';
      card.append(paper(()=>t('bt.onTheSea'),prompt(open.question_id),mineP),el('p',()=>t('bt.waiting',{name:person(partner())}),'bt-hint'));}
    else{card.append(el('h3',()=>t('bt.choose'),'bt-h'));
      const chips=el('div',undefined,'bt-themes');chips.setAttribute('role','radiogroup');copy(chips,()=>t('bt.choose'),'aria-label');
      for(const th of ['all','everyday','memories','future','care']){const c=button(()=>th==='all'?t('questions.allThemes'):t('questionThemes.'+th),()=>{theme=th;render();},'bt-chip');c.setAttribute('role','radio');c.setAttribute('aria-checked',String(theme===th));chips.append(c);}
      const list=el('div',undefined,'bt-tags');const {rs}=rounds();
      for(const q of QUESTION_BANK){if(theme!=='all'&&q.themeId!==theme)continue;const sent=rs.filter(r=>r.question_id===q.id).length;
        const b=button(()=>'',()=>{chosen=q.id;render();card.querySelector('textarea')?.focus();},'bt-tag');b.setAttribute('aria-pressed',String(chosen===q.id));
        const pq=el('span',undefined,'bt-tag-q');pq.textContent=prompt(q.id);pq.dir='auto';b.append(el('span',()=>t('questionThemes.'+q.themeId),'bt-tag-theme'),pq);if(sent)b.append(el('span',()=>t('bt.sentTimes',{count:sent}),'bt-tag-sent'));list.append(b);}
      card.append(chips,list);
      if(chosen){const area=document.createElement('textarea');area.rows=3;area.maxLength=20000;area.dir='auto';area.value=draft;copy(area,()=>t('bt.writeFirst'),'placeholder');copy(area,()=>t('bt.writeFirst'),'aria-label');area.oninput=()=>{draft=area.value;};
        card.append(paper(()=>t('bt.yourBottle'),prompt(chosen),area),el('p',()=>t('bt.blindHint',{name:person(partner())}),'bt-hint'));
        const go=button(()=>t('bt.throw'),async()=>{const body=area.value.trim();if(!body||busy)return;busy=true;go.disabled=true;
          try{await throwBottle(chosen,body);draft='';chosen=null;throwAnim();notify(()=>t('bt.thrown'));}catch{notify(()=>t('bt.failed'));}finally{busy=false;go.disabled=false;}},'bt-go');go.prepend(icon('send',18));card.append(go);}}
    paintOpened();
  }
  function throwAnim(){state='thrown';sea.throwAt=Date.now();Object.assign(sea.bottle,{x:.5,y:.8,s:1.1,a:1,glow:.6});run();setTimeout(render,1500);}
  function paintOpened(){
    opened.replaceChildren();const {rs,as}=rounds();const order=rs.filter(r=>r.revealed_at).sort((a,b)=>String(a.revealed_at).localeCompare(String(b.revealed_at))||String(a.id).localeCompare(String(b.id)));
    // every third opened bottle holds a shell for each of you (backend/019)
    const shell=new Set(order.filter((r,i)=>(i+1)%3===0).map(r=>r.id)),won=getSnapshot()?.bottlePrizes??[];
    const done=[...order].reverse();
    const toNext=3-(order.length%3);
    const next=el('div',undefined,'bt-next');next.append(icon('sparkles',16),el('span',()=>t('bt.nextShell',{count:toNext})));
    if(prizes){const inside=button(()=>t('prize.inside'),()=>prizes.catalog(id=>owned(id)),'bt-inside');next.append(inside);}
    opened.append(next);
    paintAlbum(order);
    if(!done.length)return;
    opened.append(el('h3',()=>t('bt.opened',{count:done.length}),'bt-h'));const row=el('div',undefined,'bt-shelf');
    for(const r of done){const mineP=won.find(p=>p.round_id===r.id&&p.owner_id===me()),hasShell=shell.has(r.id);
      const b=button(()=>'',()=>{if(hasShell&&!mineP)openShell(r);else read(r);},'bt-done'+(hasShell&&!mineP?' bt-has-shell':''));const q=el('span',undefined,'bt-done-q');q.textContent=prompt(r.question_id);q.dir='auto';
      const art=el('span',undefined,'bt-done-art'+(hasShell?' bt-has-shell':''));art.append(hasShell?shellIcon():icon('mail',18));
      const end=hasShell&&!mineP?el('span',()=>t('bt.openShell'),'bt-done-cta'):mineP?el('span',()=>(mineP.item&&prizes?prizes.name(mineP.item):t('bt.prize.'+mineP.tier))+' · +'+mineP.points,'bt-done-prize '+mineP.tier):el('span',dateFmt(r.revealed_at),'bt-done-date');
      b.append(art,q,end);row.append(b);}
    opened.append(row);
    function read(r){const s=openSheet({title:h=>copy(h,()=>t('bt.openedTitle')),closeLabel:b=>copy(b,()=>t('common.close'),'aria-label'),className:'bt-read'});
      const q=el('b',undefined,'bt-question');q.textContent=prompt(r.question_id);q.dir='auto';s.body.append(q);
      for(const a of as.filter(a=>a.round_id===r.id).sort((x)=>x.owner_id===me()?-1:1)){const p=el('div',undefined,'bt-paper');p.append(el('span',()=>a.owner_id===me()?t('bt.you'):person(a.owner_id),'bt-kicker'));const body=el('p',undefined,'bt-answer');body.textContent=a.body;body.dir='auto';p.append(body);s.body.append(p);}
      const mp=(getSnapshot()?.bottlePrizes??[]).find(p=>p.round_id===r.id&&p.owner_id===me());
      if(mp&&prizes){const v=button(()=>t('prize.yours',{item:prizes.name(mp.item??'points')}),()=>{s.close();prizes.view(mp);},'bt-inside');v.prepend(icon('box',16));s.body.append(v);}}
  }
  function shellIcon(){const NS='http://www.w3.org/2000/svg',sv=document.createElementNS(NS,'svg');sv.setAttribute('viewBox','0 0 24 24');sv.setAttribute('width','22');sv.setAttribute('height','22');sv.setAttribute('aria-hidden','true');
    for(const [tag,at] of [['path',{d:'M12 3c5 0 9 4 9 9 0 3-2 6-9 9C5 18 3 15 3 12c0-5 4-9 9-9z',fill:'#FFC9A8'}],['path',{d:'M12 4v16M7 6l5 14M17 6l-5 14M4 10l8 10M20 10l-8 10',stroke:'#C98A6A','stroke-width':'1.2',fill:'none'}]]){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(at))n.setAttribute(k,v);sv.append(n);}return sv;}
  // opening your shell: the box shakes, opens, and shows what was inside
  async function openShell(r){
    if(prizes){await prizes.open(()=>t('bt.shellTitle'),()=>openPrize(r.id));return;}
  }
  // what you already own (for "What can be inside"): items you won, and shop items that are yours
  function owned(id){const snap=getSnapshot(),mine=[...(snap?.bottlePrizes??[]),...(snap?.rewardBoxes??[])].filter(p=>p.owner_id===me());
    return mine.some(p=>p.item===id)||(snap?.shopPurchases??[]).some(p=>p.profile_id===me()&&p.item===id);}
  // the stamp album (mockup QPostcards): a stamp for every bottle opened, rows of five; a full row holds a big box
  const STAMP={everyday:['#E8644A','sun'],memories:['#5A3C66','heart'],future:['#1F5FA8','plane'],care:['#2E6A44','sprout']};
  function paintAlbum(order){
    const box=el('section',undefined,'bt-album');const rows=Math.max(1,Math.ceil((order.length+1)/5));
    const head=el('div',undefined,'bt-album-head');head.append(el('h3',()=>t('album.title'),'bt-h'),el('span',()=>t('album.count',{count:order.length}),'bt-album-count'));box.append(head);
    const boxes=(getSnapshot()?.rewardBoxes??[]).filter(b=>b.owner_id===me()&&b.source.startsWith('album:'));
    for(let r=0;r<rows;r++){
      const line=el('div',undefined,'bt-album-row');
      for(let k=0;k<5;k++){const round=order[r*5+k];const st=el('span',undefined,'bt-stamp'+(round?'':' empty'));
        if(round){const [col,ic]=STAMP[themeOf(round.question_id)]??['#C9443A','star'];st.style.setProperty('--stamp',col);st.append(icon(ic,18));const n=el('b');n.textContent=String(r*5+k+1);st.append(n);
          st.setAttribute('role','img');copy(st,()=>prompt(round.question_id),'aria-label');}
        line.append(st);}
      const full=order.length>=(r+1)*5,got=boxes.find(b=>b.source==='album:'+(r+1));
      const end=el('span',undefined,'bt-album-box');
      if(got&&prizes){const v=button(()=>'',()=>prizes.view(got),'bt-album-open got');v.append(icon('box',16));copy(v,()=>prizes.name(got.item??'points'),'aria-label');end.append(v);}
      else if(full&&prizes){const o=button(()=>t('album.open'),async()=>{await prizes.open(()=>t('album.boxTitle'),()=>openAlbum(r+1));},'bt-album-open');o.prepend(icon('box',16));end.append(o);}
      else{const lock=el('span',undefined,'bt-album-lock');lock.append(icon('box',16));end.append(lock);}
      line.append(end);box.append(line);}
    box.append(el('p',()=>t('album.hint'),'bt-hint'));
    opened.append(box);
  }
  return {render,clear(){card.replaceChildren();opened.replaceChildren();state='none';draft='';chosen=null;}};
}
