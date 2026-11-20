// What you discovered in the garden. Saved for you on the server (backend/015) so it follows you to a new phone and
// your partner sees how much you found; this phone keeps a copy so a discovery counts at once, even offline.
// Discoveries made before the server knew about them are sent once.
import {CULTURE_IDS} from './culture.js';
const KEY='garden.discoveries';
let server=new Set(),save=null,sent=new Set();
const local=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return new Set(Array.isArray(v)?v.filter(id=>CULTURE_IDS.includes(id)):[]);}catch{return new Set();}};
export function loadDiscoveries(){return new Set([...local(),...server]);}
// The app tells us what the server has (yours), and how to save one more.
export function syncDiscoveries(rows,me,rpc){
  server=new Set((rows??[]).filter(r=>r.profile_id===me&&CULTURE_IDS.includes(r.spot)).map(r=>r.spot));save=rpc?id=>rpc('discover',{p_spot:id}):null;
  if(!save||!me)return;for(const id of local())if(!server.has(id)&&!sent.has(id)){sent.add(id);save(id).catch(()=>sent.delete(id));}
}
export const partnerDiscoveries=(rows,partner)=>new Set((rows??[]).filter(r=>r.profile_id===partner&&CULTURE_IDS.includes(r.spot)).map(r=>r.spot));
export function addDiscovery(id){
  const seen=loadDiscoveries();if(!CULTURE_IDS.includes(id))return {seen,fresh:false};const fresh=!seen.has(id);seen.add(id);
  try{const l=local();l.add(id);localStorage.setItem(KEY,JSON.stringify([...l]));}catch{}
  if(fresh&&save&&!sent.has(id)){sent.add(id);save(id).then(()=>server.add(id)).catch(()=>sent.delete(id));}
  return {seen,fresh};
}
export function clearDiscoveries(){server=new Set();save=null;sent=new Set();}
