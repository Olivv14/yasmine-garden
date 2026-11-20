// Copy my step, pure (scripts/piano.test.mjs tests it too): dance styles, today's style, the streak of days you
// danced, and what the studio card should offer you now. A step and a copy are Talk messages of kind 'dance'
// (backend/013): payload {role:'step'|'copy', style, of}; the one who filmed the step gives the copy 1 to 3 hearts.
export const STYLES=Object.freeze([
  {id:'bachata',bpm:126},{id:'salsa',bpm:180},{id:'merengue',bpm:130},{id:'reggaeton',bpm:95},{id:'mezoued',bpm:110},{id:'joropo',bpm:150},
]);
export const STEP_SECONDS=15,WAIT_DAYS=14;
const time=v=>{const n=Date.parse(v??'');return Number.isFinite(n)?n:0;};
const day=ms=>{const d=new Date(ms);return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();};

export const styleOf=id=>STYLES.find(s=>s.id===id)??STYLES[0];
// Today's style changes every day, the same on both phones.
export function todayStyle(now=Date.now()){const d=new Date(now),n=Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);return STYLES[((n%STYLES.length)+STYLES.length)%STYLES.length];}

export const dances=messages=>(messages??[]).filter(m=>m.kind==='dance'&&!m.deleted_at&&m.payload&&(m.payload.role==='step'||m.payload.role==='copy'));

// Days in a row with at least one step or copy from either of you, ending today (or yesterday, if today is still empty).
export function streak(messages,now=Date.now()){
  const days=new Set(dances(messages).map(m=>day(time(m.created_at))));let n=0;let d=new Date(now);
  if(!days.has(day(d.getTime())))d.setDate(d.getDate()-1);
  while(days.has(day(d.getTime()))){n++;d.setDate(d.getDate()-1);}
  return n;
}
// Each step with its copy (the latest one) and the hearts, newest first.
export function pairs(messages,ratings=[]){
  const list=dances(messages),hearts=new Map((ratings??[]).map(r=>[r.copy_id,r.hearts]));
  return list.filter(m=>m.payload.role==='step').map(step=>{
    const copy=list.filter(m=>m.payload.role==='copy'&&m.payload.of===step.id).sort((a,b)=>time(b.created_at)-time(a.created_at))[0]??null;
    return {step,copy,hearts:copy?hearts.get(copy.id)??null:null};
  }).sort((a,b)=>time(b.step.created_at)-time(a.step.created_at));
}
// What the studio card offers: copy your partner's step, rate their copy of yours, or film a new step.
export function nextMove(messages,ratings,me,now=Date.now()){
  const all=pairs(messages,ratings),fresh=p=>now-time(p.step.created_at)<WAIT_DAYS*86400000;
  const toCopy=all.find(p=>fresh(p)&&p.step.sender_id!==me&&!p.copy);
  if(toCopy)return {kind:'copy',pair:toCopy};
  const toRate=all.find(p=>p.step.sender_id===me&&p.copy&&p.hearts===null);
  if(toRate)return {kind:'rate',pair:toRate};
  const waiting=all.find(p=>fresh(p)&&p.step.sender_id===me&&!p.copy);
  if(waiting)return {kind:'waiting',pair:waiting};
  return {kind:'film'};
}
// Hearts each of you collected for your copies.
export function heartsBy(messages,ratings){
  const by=new Map();for(const p of pairs(messages,ratings))if(p.copy&&p.hearts)by.set(p.copy.sender_id,(by.get(p.copy.sender_id)??0)+p.hearts);return by;
}
