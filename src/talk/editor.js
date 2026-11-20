// Before sending a photo or a video (approved PolishEditor): crop and rotate, draw, add text and stickers, a filter,
// and choose how it can be seen: once, twice, or kept in the chat. Photos are flattened into a new JPEG here (the
// original never leaves the phone); a video keeps its file and carries its trim (start and end) and filter as data.
// Everything happens on this phone.
import {icon} from '../design/icons.js';

const FILTERS=[['none',''],['warm','sepia(.25) saturate(1.25) hue-rotate(-8deg)'],['dusk','sepia(.35) saturate(1.3) hue-rotate(-20deg) brightness(.95)'],['mono','grayscale(1) contrast(1.1)'],['soft','brightness(1.08) contrast(.9) saturate(.9)']];
export const filterCss=name=>FILTERS.find(f=>f[0]===name)?.[1]||'';
const PENS=['#FFFFFF','#FFD58A','#FF9EC2','#9FE0B8','#A9BCFF','#E8443A','#1C1418'];
const MAX=1600;

export function openEditor({file,t,copy,el,button,stickers=()=>[],onSend,onClose}){
  const isVideo=file.type.startsWith('video/');
  const root=el('div',undefined,'ed');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');copy(root,()=>t('editor.label'),'aria-label');
  const stage=el('div',undefined,'ed-stage');const canvas=document.createElement('canvas');canvas.className='ed-canvas';
  const ink=document.createElement('canvas');ink.className='ed-ink';const frame=el('div',undefined,'ed-frame');const layer=el('div',undefined,'ed-layer');
  let img=null,video=null,rot=0,crop='full',filter='none',tool=null,pen=PENS[1],view='keep',trim=[0,0];
  const url=URL.createObjectURL(file);
  // ---- the picture (or the video's frame)
  function base(){return img?{w:img.naturalWidth,h:img.naturalHeight,src:img}:video?{w:video.videoWidth,h:video.videoHeight,src:video}:null;}
  function box(){const b=base();if(!b)return {w:1,h:1};let w=rot%180?b.h:b.w,h=rot%180?b.w:b.h;if(crop==='square'){const s=Math.min(w,h);w=h=s;}else if(crop==='portrait'){const tw=Math.min(w,h*4/5);h=Math.min(h,tw*5/4);w=tw;}
    const k=Math.min(1,MAX/Math.max(w,h));return {w:Math.round(w*k),h:Math.round(h*k),k};}
  function draw(target=canvas,withInk=false){
    const b=base();if(!b)return;const {w,h,k}=box();target.width=w;target.height=h;const g=target.getContext('2d');g.save();
    g.filter=FILTERS.find(f=>f[0]===filter)[1]||'none';g.translate(w/2,h/2);g.rotate(rot*Math.PI/180);
    const dw=b.w*k,dh=b.h*k;g.drawImage(b.src,-dw/2,-dh/2,dw,dh);g.restore();
    if(withInk){g.drawImage(ink,0,0,w,h);}
  }
  function fit(){const {w,h}=box();if(ink.width!==w||ink.height!==h){const old=document.createElement('canvas');old.width=ink.width;old.height=ink.height;old.getContext('2d').drawImage(ink,0,0);ink.width=w;ink.height=h;ink.getContext('2d').drawImage(old,0,0,w,h);}draw();}
  if(isVideo){video=document.createElement('video');video.src=url;video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');video.loop=true;video.className='ed-video';
    video.onloadedmetadata=()=>{trim=[0,Math.min(video.duration||0,60)];paintTrim();fit();video.play().catch(()=>{});};frame.append(video,ink,layer);stage.append(frame);}
  else{img=new Image();img.onload=()=>fit();img.src=url;frame.append(canvas,ink,layer);stage.append(frame);}
  // ---- drawing with a finger
  let drawing=false;
  ink.addEventListener('pointerdown',e=>{if(tool!=='draw')return;drawing=true;ink.setPointerCapture(e.pointerId);const g=ink.getContext('2d'),r=ink.getBoundingClientRect();g.strokeStyle=pen;g.lineWidth=Math.max(4,ink.width/90);g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo((e.clientX-r.left)*ink.width/r.width,(e.clientY-r.top)*ink.height/r.height);});
  ink.addEventListener('pointermove',e=>{if(!drawing)return;const g=ink.getContext('2d'),r=ink.getBoundingClientRect();g.lineTo((e.clientX-r.left)*ink.width/r.width,(e.clientY-r.top)*ink.height/r.height);g.stroke();});
  ink.addEventListener('pointerup',()=>{drawing=false;});
  // ---- text and stickers: placed on top, dragged with a finger, baked into the photo when sending
  function addItem(node,kind){const it=el('div',undefined,'ed-item '+kind);it.append(node);it.style.left='35%';it.style.top='40%';layer.append(it);
    let d=null;it.addEventListener('pointerdown',e=>{d={x:e.clientX,y:e.clientY,l:it.offsetLeft,t:it.offsetTop};it.setPointerCapture(e.pointerId);e.stopPropagation();});
    it.addEventListener('pointermove',e=>{if(!d)return;it.style.left=(d.l+e.clientX-d.x)+'px';it.style.top=(d.t+e.clientY-d.y)+'px';});
    it.addEventListener('pointerup',()=>{d=null;});it.addEventListener('dblclick',()=>it.remove());return it;}
  function addText(){const words=prompt(t('editor.textPrompt'));if(!words)return;const s=el('span');s.textContent=words;s.style.color=pen;s.dir='auto';addItem(s,'text');}
  function addSticker(src){const i=new Image();i.src=src;i.alt='';addItem(i,'sticker');}
  // ---- tools
  const top=el('div',undefined,'ed-top');const close=button(()=>'',()=>done(),'ed-round');close.append(icon('close',18));copy(close,()=>t('common.close'),'aria-label');
  const tools=el('div',undefined,'ed-tools');
  const toolBtn=(name,ic,fn)=>{const b=button(()=>'',fn,'ed-round');b.dataset.tool=name;b.append(icon(ic,18));copy(b,()=>t('editor.'+name),'aria-label');tools.append(b);return b;};
  const panel=el('div',undefined,'ed-panel');
  const setTool=name=>{tool=tool===name?null:name;for(const b of tools.children)b.setAttribute('aria-pressed',String(b.dataset.tool===tool));ink.classList.toggle('drawing',tool==='draw');paintPanel();};
  toolBtn('crop','crop',()=>setTool('crop'));toolBtn('draw','pen',()=>setTool('draw'));toolBtn('text','text',()=>{setTool('text');});toolBtn('stickers','smile',()=>setTool('stickers'));toolBtn('filters','sparkles',()=>setTool('filters'));
  if(isVideo)toolBtn('trim','scissors',()=>setTool('trim'));
  top.append(close,tools);
  function paintPanel(){
    panel.replaceChildren();if(!tool)return;
    if(tool==='crop'){for(const c of ['full','square','portrait']){const b=button(()=>t('editor.crop.'+c),()=>{crop=c;fit();paintPanel();},'ed-chip');b.setAttribute('aria-pressed',String(crop===c));panel.append(b);}
      const r=button(()=>t('editor.rotate'),()=>{rot=(rot+90)%360;fit();},'ed-chip');r.prepend(icon('rotate',14));panel.append(r);}
    if(tool==='draw'||tool==='text'){for(const c of PENS){const b=button(()=>'',()=>{pen=c;paintPanel();},'ed-color');b.style.background=c;copy(b,()=>t('editor.color'),'aria-label');b.setAttribute('aria-pressed',String(pen===c));panel.append(b);}
      if(tool==='text')panel.append(button(()=>t('editor.addText'),()=>addText(),'ed-chip'));
      if(tool==='draw')panel.append(button(()=>t('editor.undoAll'),()=>{ink.getContext('2d').clearRect(0,0,ink.width,ink.height);},'ed-chip'));}
    if(tool==='stickers'){for(const e of ['❤️','😘','🌹','✨','🌙','⭐','😂','🔥'])panel.append(button(()=>e,()=>{const sp=el('span');sp.textContent=e;addItem(sp,'emoji');},'ed-emoji'));
      for(const s of stickers()){const b=button(()=>'',()=>addSticker(s.image),'ed-sticker');const i=new Image();i.src=s.image;i.alt='';b.append(i);panel.append(b);}}
    if(tool==='filters'){for(const [n] of FILTERS){const b=button(()=>t('editor.filter.'+n),()=>{filter=n;if(video)video.style.filter=FILTERS.find(f=>f[0]===n)[1]||'none';else draw();paintPanel();},'ed-chip');b.setAttribute('aria-pressed',String(filter===n));panel.append(b);}}
    if(tool==='trim')paintTrim();
  }
  function paintTrim(){if(tool!=='trim'||!video)return;panel.replaceChildren();const dur=video.duration||0;
    for(const [i,key] of [[0,'editor.start'],[1,'editor.end']]){const l=el('label',()=>t(key,{s:trim[i].toFixed(1)}),'ed-trim');const r=document.createElement('input');r.type='range';r.min='0';r.max=String(dur);r.step='0.1';r.value=String(trim[i]);
      r.oninput=()=>{trim[i]=+r.value;if(trim[0]>trim[1]-.5)trim[i===0?1:0]=i===0?Math.min(dur,trim[0]+.5):Math.max(0,trim[1]-.5);video.currentTime=trim[i];paintTrim();};l.append(r);panel.append(l);}}
  if(isVideo)setInterval(()=>{if(video&&trim[1]>0&&video.currentTime>trim[1])video.currentTime=trim[0];},200);
  // ---- how it can be seen, and send
  const bottom=el('div',undefined,'ed-bottom');const views=el('div',undefined,'ed-views');views.setAttribute('role','radiogroup');
  for(const v of ['once','twice','keep']){const b=button(()=>t('editor.view.'+v),()=>{view=v;for(const x of views.children)x.setAttribute('aria-checked',String(x.dataset.v===v));},'ed-view');b.dataset.v=v;b.setAttribute('role','radio');b.setAttribute('aria-checked',String(v===view));views.append(b);}
  const send=button(()=>'',async()=>{send.disabled=true;try{await finish();}finally{send.disabled=false;}},'ed-send');send.append(icon('send',20));copy(send,()=>t('talk.send'),'aria-label');
  bottom.append(views,send);
  root.append(stage,top,panel,bottom);document.body.append(root);document.documentElement.classList.add('ed-open');
  async function finish(){
    const payload=view==='keep'?{}:{view};
    if(isVideo){if(trim[1]>0&&(trim[0]>0||trim[1]<(video.duration||0)-.05)){payload.start=+trim[0].toFixed(2);payload.end=+trim[1].toFixed(2);}if(filter!=='none')payload.filter=filter;
      await onSend({kind:'video',blob:file,filename:'video.'+(file.type.includes('mp4')?'mp4':file.type.includes('quicktime')?'mov':'webm'),payload});done();return;}
    // bake the photo: filter + rotation + crop + drawing + the placed text and stickers
    const out=document.createElement('canvas');draw(out,true);const g=out.getContext('2d'),sr=stage.getBoundingClientRect(),cr=canvas.getBoundingClientRect(),kx=out.width/cr.width,ky=out.height/cr.height;
    for(const it of layer.children){const r=it.getBoundingClientRect(),x=(r.left-cr.left)*kx,y=(r.top-cr.top)*ky;
      if(it.classList.contains('emoji')){g.font=`${Math.round(44*ky)}px sans-serif`;g.textBaseline='top';g.fillText(it.firstChild.textContent,x,y);}
      else if(it.classList.contains('text')){const s=it.firstChild;g.font=`700 ${Math.round(28*ky)}px Caveat, cursive`;g.fillStyle=s.style.color;g.shadowColor='rgba(0,0,0,.5)';g.shadowBlur=6*ky;g.textBaseline='top';g.fillText(s.textContent,x,y);g.shadowBlur=0;}
      else{const i=it.firstChild;try{g.drawImage(i,x,y,r.width*kx,r.height*ky);}catch{}}}
    const blob=await new Promise(r=>out.toBlob(r,'image/jpeg',.88));if(!blob)return;
    await onSend({kind:'photo',blob,filename:'photo.jpg',payload});done();
  }
  function done(){root.remove();document.documentElement.classList.remove('ed-open');URL.revokeObjectURL(url);video?.pause();onClose?.();}
  return {close:done};
}
