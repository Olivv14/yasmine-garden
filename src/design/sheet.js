// Bottom sheet on a native <dialog>: focus stays inside, Esc closes, swipe down or tap the scrim closes.
import {animate,DURATION,reducedMotion} from './motion.js';
import {icon} from './icons.js';

let seq=0;
export function openSheet({title,closeLabel,size='half',className='',onClose}){
  const id='sheet-title-'+(++seq);
  const dialog=document.createElement('dialog');dialog.className=`sheet sheet-${size} ${className}`.trim();dialog.setAttribute('aria-labelledby',id);
  const handle=document.createElement('div');handle.className='sheet-handle';handle.setAttribute('aria-hidden','true');
  const head=document.createElement('div');head.className='sheet-head';
  const h=document.createElement('h2');h.id=id;h.className='title';h.dir='auto';
  const close=document.createElement('button');close.type='button';close.className='icon-button';close.append(icon('close'));
  const body=document.createElement('div');body.className='sheet-body';
  head.append(h,close);dialog.append(handle,head,body);document.body.append(dialog);
  title(h);closeLabel(close);
  let closing=false;
  async function dismiss(){
    if(closing)return;closing=true;
    if(!reducedMotion())await animate(dialog,{transform:['translateY(0)','translateY(100%)'],opacity:[1,.6]},{duration:DURATION.sheet}).finished?.catch(()=>{});
    dialog.close();dialog.remove();document.documentElement.classList.toggle('sheet-open',!!document.querySelector('dialog.sheet[open]'));onClose?.();
  }
  close.onclick=dismiss;
  dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dismiss();});
  let startY=null;
  handle.addEventListener('pointerdown',e=>{startY=e.clientY;handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(startY!==null&&e.clientY-startY>0)dialog.style.transform=`translateY(${e.clientY-startY}px)`;});
  handle.addEventListener('pointerup',e=>{const dy=e.clientY-(startY??e.clientY);startY=null;if(dy>80)dismiss();else dialog.style.transform='';});
  dialog.showModal();document.documentElement.classList.add('sheet-open');
  animate(dialog,{transform:['translateY(40%)','translateY(0)'],opacity:[0,1]},{duration:DURATION.sheet});
  return {dialog,body,close:dismiss,get open(){return dialog.open&&!closing;}};
}
