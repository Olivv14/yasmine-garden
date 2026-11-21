// Before sending a photo or a video (approved PolishEditor): crop and rotate, draw, add text and stickers, a filter,
// and choose how it can be seen: once, twice, or kept in the chat. Photos are flattened into a new JPEG here (the
// original never leaves the phone); a video keeps its file and carries its trim (start and end) and filter as data.
// Undo and redo every step; drag a sticker or a word onto the bin to remove it. Everything happens on this phone.
import {icon} from '../design/icons.js';

// The filters as colour recipes (the same steps as the CSS filters below). Photos get them pixel by pixel, which
// works on every phone (iPhone Safari ignores canvas filters); videos show them with CSS.
const RECIPES={none:[],warm:[['sepia',.25],['saturate',1.25],['hue',-8]],dusk:[['sepia',.35],['saturate',1.3],['hue',-20],['bright',.95]],mono:[['saturate',0],['contrast',1.1]],soft:[['bright',1.08],['contrast',.9],['saturate',.9]]};
const CSS={none:'',warm:'sepia(.25) saturate(1.25) hue-rotate(-8deg)',dusk:'sepia(.35) saturate(1.3) hue-rotate(-20deg) brightness(.95)',mono:'grayscale(1) contrast(1.1)',soft:'brightness(1.08) contrast(.9) saturate(.9)'};
export const filterCss=name=>CSS[name]||'';
const FILTER_NAMES=Object.keys(RECIPES);
const PENS=['#FFFFFF','#FFD58A','#FF9EC2','#9FE0B8','#A9BCFF','#E8443A','#1C1418'];
const MAX=1600,HISTORY=30;

// one 3x3 colour matrix plus an offset for a whole recipe (Filter Effects spec matrices)
function matrixFor(name){
  let M=[1,0,0,0,1,0,0,0,1],o=[0,0,0];
  const mul=(A,B)=>[0,1,2].flatMap(r=>[0,1,2].map(c=>A[r*3]*B[c]+A[r*3+1]*B[3+c]+A[r*3+2]*B[6+c]));
  const apply=(A,off=[0,0,0])=>{o=[0,1,2].map(r=>A[r*3]*o[0]+A[r*3+1]*o[1]+A[r*3+2]*o[2]+off[r]);M=mul(A,M);};
  for(const [op,v] of RECIPES[name]??[]){
    if(op==='sepia'){const a=1-v;apply([.393+.607*a,.769-.769*a,.189-.189*a,.349-.349*a,.686+.314*a,.168-.168*a,.272-.272*a,.534-.534*a,.131+.869*a]);}
    else if(op==='saturate')apply([.213+.787*v,.715-.715*v,.072-.072*v,.213-.213*v,.715+.285*v,.072-.072*v,.213-.213*v,.715-.715*v,.072+.928*v]);
    else if(op==='hue'){const a=v*Math.PI/180,c=Math.cos(a),s=Math.sin(a);apply([.213+c*.787-s*.213,.715-c*.715-s*.715,.072-c*.072+s*.928,.213-c*.213+s*.143,.715+c*.285+s*.140,.072-c*.072-s*.283,.213-c*.213-s*.787,.715-c*.715+s*.715,.072+c*.928+s*.072]);}
    else if(op==='bright')apply([v,0,0,0,v,0,0,0,v]);
    else if(op==='contrast'){const k=(.5-.5*v)*255;apply([v,0,0,0,v,0,0,0,v],[k,k,k]);}
  }
  return {M,o};
}
function paintFilter(ctx,w,h,name){
  if(name==='none'||!w||!h)return;const {M,o}=matrixFor(name);const im=ctx.getImageData(0,0,w,h),d=im.data;
  for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];
    d[i]=M[0]*r+M[1]*g+M[2]*b+o[0];d[i+1]=M[3]*r+M[4]*g+M[5]*b+o[1];d[i+2]=M[6]*r+M[7]*g+M[8]*b+o[2];}
  ctx.putImageData(im,0,0);
}

export function openEditor({file,t,copy,el,button,stickers=()=>[],onSend,onClose}){
  const isVideo=file.type.startsWith('video/');
  const root=el('div',undefined,'ed');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');copy(root,()=>t('editor.label'),'aria-label');
  const stage=el('div',undefined,'ed-stage');const canvas=document.createElement('canvas');canvas.className='ed-canvas';
  const ink=document.createElement('canvas');ink.className='ed-ink';const frame=el('div',undefined,'ed-frame');const layer=el('div',undefined,'ed-layer');
  const spinner=el('div',undefined,'ed-loading');spinner.append(el('span',undefined,'ed-spin'),el('span',()=>t('editor.loading')));
  const bin=el('div',undefined,'ed-bin');bin.append(icon('trash',24));bin.hidden=true;
  let img=null,video=null,rot=0,crop='full',filter='none',tool=null,pen=PENS[1],view='keep',trim=[0,0],ready=false;
  const url=URL.createObjectURL(file);
  const loading=on=>{spinner.hidden=!on;};

  // ---- the picture (or the video's frame)
  function base(){return img?{w:img.naturalWidth,h:img.naturalHeight,src:img}:video?{w:video.videoWidth,h:video.videoHeight,src:video}:null;}
  function box(){const b=base();if(!b)return {w:1,h:1,k:1};let w=rot%180?b.h:b.w,h=rot%180?b.w:b.h;if(crop==='square'){const s=Math.min(w,h);w=h=s;}else if(crop==='portrait'){const tw=Math.min(w,h*4/5);h=Math.min(h,tw*5/4);w=tw;}
    const k=Math.min(1,MAX/Math.max(w,h));return {w:Math.round(w*k),h:Math.round(h*k),k};}
  function draw(target=canvas,withInk=false){
    const b=base();if(!b)return;const {w,h,k}=box();target.width=w;target.height=h;const g=target.getContext('2d',{willReadFrequently:true});g.save();
    g.translate(w/2,h/2);g.rotate(rot*Math.PI/180);const dw=b.w*k,dh=b.h*k;g.drawImage(b.src,-dw/2,-dh/2,dw,dh);g.restore();
    if(!video)paintFilter(g,w,h,filter);
    if(withInk)g.drawImage(ink,0,0,w,h);
  }
  function fit(){const {w,h}=box();if(ink.width!==w||ink.height!==h){const old=document.createElement('canvas');old.width=ink.width;old.height=ink.height;old.getContext('2d').drawImage(ink,0,0);ink.width=w;ink.height=h;ink.getContext('2d').drawImage(old,0,0,w,h);}if(!video)draw();}
  if(isVideo){video=document.createElement('video');video.src=url;video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');video.loop=true;video.className='ed-video';
    video.onloadeddata=()=>{trim=[0,Math.min(video.duration||0,60)];ready=true;loading(false);fit();paintPanel();video.play().catch(()=>{});};
    video.onerror=()=>{loading(false);};frame.append(video,ink,layer);}
  else{img=new Image();img.onload=()=>{ready=true;loading(false);fit();paintPanel();};img.onerror=()=>loading(false);img.src=url;frame.append(canvas,ink,layer);}
  stage.append(frame,spinner,bin);

  // ---- undo / redo: a snapshot of everything you can change, taken before each change
  const undo=[],redo=[];
  function snap(){return {rot,crop,filter,trim:[...trim],ink:ink.width&&ink.height?ink.getContext('2d').getImageData(0,0,ink.width,ink.height):null,
    items:[...layer.children].map(it=>({kind:it.dataset.kind,value:it.dataset.value,color:it.dataset.color??'',left:it.style.left,top:it.style.top}))};}
  function checkpoint(){undo.push(snap());if(undo.length>HISTORY)undo.shift();redo.length=0;paintHistory();}
  function restore(s){rot=s.rot;crop=s.crop;filter=s.filter;trim=[...s.trim];fit();
    if(s.ink&&s.ink.width===ink.width&&s.ink.height===ink.height)ink.getContext('2d').putImageData(s.ink,0,0);else ink.getContext('2d').clearRect(0,0,ink.width,ink.height);
    layer.replaceChildren();for(const i of s.items)rebuild(i);if(video)video.style.filter=filterCss(filter);paintPanel();paintHistory();}
  function step(from,to){if(!from.length)return;to.push(snap());restore(from.pop());}
  const undoB=button(()=>'',()=>step(undo,redo),'ed-round');undoB.append(icon('undo',18));copy(undoB,()=>t('editor.undo'),'aria-label');
  const redoB=button(()=>'',()=>step(redo,undo),'ed-round');redoB.append(icon('redo',18));copy(redoB,()=>t('editor.redo'),'aria-label');
  function paintHistory(){undoB.disabled=!undo.length;redoB.disabled=!redo.length;}

  // ---- drawing with a finger
  let drawing=false;
  ink.addEventListener('pointerdown',e=>{if(tool!=='draw')return;checkpoint();drawing=true;ink.setPointerCapture(e.pointerId);const g=ink.getContext('2d'),r=ink.getBoundingClientRect();g.strokeStyle=pen;g.lineWidth=Math.max(4,ink.width/90);g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo((e.clientX-r.left)*ink.width/r.width,(e.clientY-r.top)*ink.height/r.height);});
  ink.addEventListener('pointermove',e=>{if(!drawing)return;const g=ink.getContext('2d'),r=ink.getBoundingClientRect();g.lineTo((e.clientX-r.left)*ink.width/r.width,(e.clientY-r.top)*ink.height/r.height);g.stroke();});
  ink.addEventListener('pointerup',()=>{drawing=false;});

  // ---- text and stickers: placed on top, dragged with a finger; drop one on the bin to remove it
  function overBin(x,y){const r=bin.getBoundingClientRect();return x>=r.left-10&&x<=r.right+10&&y>=r.top-10&&y<=r.bottom+10;}
  function addItem(node,kind,value,color,at){const it=el('div',undefined,'ed-item '+kind);it.dataset.kind=kind;it.dataset.value=value;if(color)it.dataset.color=color;it.append(node);it.style.left=at?.left??'35%';it.style.top=at?.top??'40%';layer.append(it);
    let d=null,moved=false;
    it.addEventListener('pointerdown',e=>{d={x:e.clientX,y:e.clientY,l:it.offsetLeft,t:it.offsetTop};moved=false;it.setPointerCapture(e.pointerId);e.stopPropagation();bin.hidden=false;});
    it.addEventListener('pointermove',e=>{if(!d)return;if(!moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>4){moved=true;checkpoint();}
      it.style.left=(d.l+e.clientX-d.x)+'px';it.style.top=(d.t+e.clientY-d.y)+'px';bin.classList.toggle('hot',overBin(e.clientX,e.clientY));});
    const up=e=>{if(!d)return;d=null;const drop=moved&&overBin(e.clientX,e.clientY);bin.hidden=true;bin.classList.remove('hot');if(drop)it.remove();};
    it.addEventListener('pointerup',up);it.addEventListener('pointercancel',up);
    return it;}
  function rebuild(i){if(i.kind==='sticker'){const im=new Image();im.src=i.value;im.alt='';addItem(im,'sticker',i.value,'',i);return;}
    const s=el('span');s.textContent=i.value;if(i.kind==='text'){s.style.color=i.color;s.dir='auto';}addItem(s,i.kind,i.value,i.color,i);}
  function addText(){const words=prompt(t('editor.textPrompt'));if(!words)return;checkpoint();rebuild({kind:'text',value:words,color:pen});}
  function addEmoji(e){checkpoint();rebuild({kind:'emoji',value:e});}
  function addSticker(src){checkpoint();rebuild({kind:'sticker',value:src});}

  // ---- tools
  const top=el('div',undefined,'ed-top');const close=button(()=>'',()=>done(),'ed-round');close.append(icon('close',18));copy(close,()=>t('common.close'),'aria-label');
  const tools=el('div',undefined,'ed-tools');
  const toolBtn=(name,ic,fn)=>{const b=button(()=>'',fn,'ed-round');b.dataset.tool=name;b.append(icon(ic,18));copy(b,()=>t('editor.'+name),'aria-label');tools.append(b);return b;};
  const panel=el('div',undefined,'ed-panel');
  const setTool=name=>{tool=tool===name?null:name;for(const b of tools.children)if(b.dataset.tool)b.setAttribute('aria-pressed',String(b.dataset.tool===tool));ink.classList.toggle('drawing',tool==='draw');paintPanel();};
  toolBtn('crop','crop',()=>setTool('crop'));toolBtn('draw','pen',()=>setTool('draw'));toolBtn('text','text',()=>{setTool('text');});toolBtn('stickers','smile',()=>setTool('stickers'));toolBtn('filters','sparkles',()=>setTool('filters'));
  if(isVideo)toolBtn('trim','scissors',()=>setTool('trim'));
  const history=el('div',undefined,'ed-history');history.append(undoB,redoB);
  top.append(close,tools);stage.append(history);paintHistory();
  let thumbs=null;
  // small previews of your own picture with each filter (made once, after the picture has loaded)
  function filterThumbs(){
    if(thumbs)return thumbs;const b=base();if(!b||!b.w)return null;const S=120,k=S/Math.min(b.w,b.h),src=document.createElement('canvas');src.width=src.height=S;
    const g=src.getContext('2d',{willReadFrequently:true});g.drawImage(b.src,(S-b.w*k)/2,(S-b.h*k)/2,b.w*k,b.h*k);const plain=g.getImageData(0,0,S,S);
    thumbs={};for(const n of FILTER_NAMES){g.putImageData(plain,0,0);paintFilter(g,S,S,n);thumbs[n]=src.toDataURL('image/jpeg',.8);}return thumbs;
  }
  function paintPanel(){
    panel.replaceChildren();if(!tool)return;
    if(!ready){const l=el('div',undefined,'ed-panel-loading');l.append(el('span',undefined,'ed-spin'),el('span',()=>t('editor.loading')));panel.append(l);return;}
    if(tool==='crop'){for(const c of ['full','square','portrait']){const b=button(()=>t('editor.crop.'+c),()=>{if(crop===c)return;checkpoint();crop=c;fit();paintPanel();},'ed-chip');b.setAttribute('aria-pressed',String(crop===c));panel.append(b);}
      const r=button(()=>t('editor.rotate'),()=>{checkpoint();rot=(rot+90)%360;fit();},'ed-chip');r.prepend(icon('rotate',14));panel.append(r);}
    if(tool==='draw'||tool==='text'){for(const c of PENS){const b=button(()=>'',()=>{pen=c;paintPanel();},'ed-color');b.style.background=c;copy(b,()=>t('editor.color'),'aria-label');b.setAttribute('aria-pressed',String(pen===c));panel.append(b);}
      if(tool==='text')panel.append(button(()=>t('editor.addText'),()=>addText(),'ed-chip'));
      if(tool==='draw')panel.append(button(()=>t('editor.undoAll'),()=>{checkpoint();ink.getContext('2d').clearRect(0,0,ink.width,ink.height);},'ed-chip'));}
    if(tool==='stickers'){for(const e of ['❤️','😘','🌹','✨','🌙','⭐','😂','🔥'])panel.append(button(()=>e,()=>addEmoji(e),'ed-emoji'));
      for(const s of stickers()){const b=button(()=>'',()=>addSticker(s.image),'ed-sticker');const i=new Image();i.src=s.image;i.alt='';b.append(i);panel.append(b);}
      panel.append(el('p',()=>t('editor.binHint'),'ed-hint'));}
    if(tool==='filters'){const row=el('div',undefined,'ed-filters');const th=filterThumbs();
      for(const n of FILTER_NAMES){const b=button(()=>'',()=>{if(filter===n)return;checkpoint();filter=n;loading(true);
          requestAnimationFrame(()=>{if(video)video.style.filter=filterCss(n);else draw();loading(false);paintPanel();});},'ed-filter');
        b.setAttribute('aria-pressed',String(filter===n));const pic=new Image();pic.alt='';if(th)pic.src=th[n];else{pic.className='ed-thumb-wait';}
        b.append(pic,el('span',()=>t('editor.filter.'+n)));row.append(b);}
      panel.append(row);}
    if(tool==='trim')paintTrim();
  }
  function paintTrim(){if(tool!=='trim'||!video)return;panel.replaceChildren();const dur=video.duration||0;
    for(const [i,key] of [[0,'editor.start'],[1,'editor.end']]){const l=el('label',()=>t(key,{s:trim[i].toFixed(1)}),'ed-trim');const r=document.createElement('input');r.type='range';r.min='0';r.max=String(dur);r.step='0.1';r.value=String(trim[i]);
      r.onpointerdown=()=>checkpoint();
      r.oninput=()=>{trim[i]=+r.value;if(trim[0]>trim[1]-.5)trim[i===0?1:0]=i===0?Math.min(dur,trim[0]+.5):Math.max(0,trim[1]-.5);video.currentTime=trim[i];paintTrim();};l.append(r);panel.append(l);}}
  const loop=isVideo?setInterval(()=>{if(video&&trim[1]>0&&video.currentTime>trim[1])video.currentTime=trim[0];},200):null;

  // ---- how it can be seen, and send
  const bottom=el('div',undefined,'ed-bottom');const views=el('div',undefined,'ed-views');views.setAttribute('role','radiogroup');
  for(const v of ['once','twice','keep']){const b=button(()=>t('editor.view.'+v),()=>{view=v;for(const x of views.children)x.setAttribute('aria-checked',String(x.dataset.v===v));},'ed-view');b.dataset.v=v;b.setAttribute('role','radio');b.setAttribute('aria-checked',String(v===view));views.append(b);}
  const send=button(()=>'',async()=>{if(!ready)return;send.disabled=true;loading(true);try{await finish();}finally{send.disabled=false;loading(false);}},'ed-send');send.append(icon('send',20));copy(send,()=>t('talk.send'),'aria-label');
  bottom.append(views,send);
  root.append(stage,top,panel,bottom);document.body.append(root);document.documentElement.classList.add('ed-open');
  async function finish(){
    const payload=view==='keep'?{}:{view};
    if(isVideo){if(trim[1]>0&&(trim[0]>0||trim[1]<(video.duration||0)-.05)){payload.start=+trim[0].toFixed(2);payload.end=+trim[1].toFixed(2);}if(filter!=='none')payload.filter=filter;
      await onSend({kind:'video',blob:file,filename:'video.'+(file.type.includes('mp4')?'mp4':file.type.includes('quicktime')?'mov':'webm'),payload});done();return;}
    // bake the photo: filter + rotation + crop + drawing + the placed text and stickers
    const out=document.createElement('canvas');draw(out,true);const g=out.getContext('2d'),cr=canvas.getBoundingClientRect(),kx=out.width/cr.width,ky=out.height/cr.height;
    for(const it of layer.children){const r=it.getBoundingClientRect(),x=(r.left-cr.left)*kx,y=(r.top-cr.top)*ky;
      if(it.dataset.kind==='emoji'){g.font=`${Math.round(44*ky)}px sans-serif`;g.textBaseline='top';g.fillText(it.dataset.value,x,y);}
      else if(it.dataset.kind==='text'){g.font=`700 ${Math.round(28*ky)}px Caveat, cursive`;g.fillStyle=it.dataset.color||'#fff';g.shadowColor='rgba(0,0,0,.5)';g.shadowBlur=6*ky;g.textBaseline='top';g.fillText(it.dataset.value,x,y);g.shadowBlur=0;}
      else{const i=it.firstChild;try{g.drawImage(i,x,y,r.width*kx,r.height*ky);}catch{}}}
    const blob=await new Promise(r=>out.toBlob(r,'image/jpeg',.88));if(!blob)return;
    await onSend({kind:'photo',blob,filename:'photo.jpg',payload});done();
  }
  function done(){clearInterval(loop);root.remove();document.documentElement.classList.remove('ed-open');URL.revokeObjectURL(url);video?.pause();onClose?.();}
  return {close:done};
}
