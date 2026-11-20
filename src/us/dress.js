// The approved designs over the plain form fields (PolishHome, PolishDiary, PolishMood): the original <select>s stay
// (saving keeps working exactly as before) but are hidden; chips, a switch and a paper page drive them.
import {icon} from '../design/icons.js';

const MOOD_ICON={none:'sparkles',calm:'moon',hopeful:'sun',nostalgic:'sunset',hug:'heart',difficult:'flame'};
const MOOD_COLOR={none:'rgba(255,226,198,.25)',calm:'#9FE0B8',hopeful:'#FFD58A',nostalgic:'#A9BCFF',hug:'#FF9EC2',difficult:'#FFB25A'};

// A <select> becomes a row of chips (one per option); the select still holds the value.
export function chips(select,{t,cls='dress-chips',big=false}={}){
  if(!select||select.dataset.dressed)return null;select.dataset.dressed='1';
  const row=document.createElement('div');row.className=cls+(big?' big':'');row.setAttribute('role','radiogroup');
  const label=select.labels?.[0];if(label){label.classList.add('dress-label');row.setAttribute('aria-labelledby',label.id||(label.id='l'+Math.random().toString(36).slice(2)));}
  const paint=()=>{for(const b of row.children)b.setAttribute('aria-checked',String(b.dataset.value===select.value));};
  for(const o of select.options){
    const b=document.createElement('button');b.type='button';b.className='dress-chip';b.dataset.value=o.value;b.setAttribute('role','radio');
    const dot=document.createElement('span');dot.className='dress-dot';dot.style.setProperty('--c',MOOD_COLOR[o.value]??'rgba(255,226,198,.25)');
    if(MOOD_ICON[o.value])dot.append(icon(MOOD_ICON[o.value],big?26:18));
    const txt=document.createElement('span');txt.textContent=o.textContent;b.append(dot,txt);
    b.onclick=()=>{select.value=o.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));paint();};
    row.append(b);
  }
  // keep the words in the chips in step with the options (language changes, edits)
  new MutationObserver(()=>{[...select.options].forEach((o,i)=>{const s=row.children[i]?.lastChild;if(s&&s.textContent!==o.textContent)s.textContent=o.textContent;});paint();}).observe(select,{subtree:true,characterData:true,childList:true});
  select.addEventListener('change',paint);select.classList.add('dress-hidden');select.after(row);paint();
  // values set by code (reset, edit) show too
  const proto=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
  Object.defineProperty(select,'value',{get(){return proto.get.call(this);},set(v){proto.set.call(this,v);paint();},configurable:true});
  return row;
}
// A private/shared <select> becomes one switch: "For <partner> too".
export function shareSwitch(select,{t,copy,partnerName}){
  if(!select||select.dataset.dressed)return null;select.dataset.dressed='1';
  const b=document.createElement('button');b.type='button';b.className='dress-share';b.setAttribute('role','switch');
  b.append(icon('heart',16),document.createElement('span'));
  const paint=()=>{const on=select.value==='shared';b.setAttribute('aria-checked',String(on));copy(b.lastChild,()=>on?t('dress.sharedWith',{name:partnerName()}):t('dress.onlyMe'));};
  b.onclick=()=>{select.value=select.value==='shared'?'private':'shared';select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));paint();};
  select.labels?.[0]?.classList.add('dress-hidden');select.classList.add('dress-hidden');select.after(b);
  const proto=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
  Object.defineProperty(select,'value',{get(){return proto.get.call(this);},set(v){proto.set.call(this,v);paint();},configurable:true});
  paint();return b;
}
