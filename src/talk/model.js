// Talk: the pure parts (no DOM, no network), so they can be tested on their own.
const time=v=>{const n=Date.parse(v??'');return Number.isFinite(n)?n:0;};
const order=(a,b)=>time(a.created_at)-time(b.created_at)||String(a.id).localeCompare(String(b.id));

// Add messages from a page load or a live event; the newest copy of each id wins (edits, deletions).
export function mergeMessages(list,incoming){
  const byId=new Map(list.map(m=>[m.id,m]));
  for(const m of incoming){if(!m?.id)continue;const old=byId.get(m.id);
    if(!old||time(m.edited_at??m.deleted_at??m.created_at)>=time(old.edited_at??old.deleted_at??old.created_at)||m.deleted_at)byId.set(m.id,{...old,...m});}
  return [...byId.values()].sort(order);
}
// Messages from the partner that arrived after my read mark.
export const unreadCount=(list,me,myReadAt)=>list.filter(m=>m.sender_id!==me&&!m.deleted_at&&time(m.created_at)>time(myReadAt)).length;
// My last message the partner has seen (for the "Seen" mark under it), or null.
export function lastSeenId(list,me,partnerReadAt){
  let found=null;for(const m of list)if(m.sender_id===me&&!m.deleted_at&&time(m.created_at)<=time(partnerReadAt))found=m.id;
  return found;
}
// A new day starts a small date line between bubbles.
export const newDay=(prev,m)=>!prev||new Date(time(prev.created_at)).toDateString()!==new Date(time(m.created_at)).toDateString();
// Reactions as {messageId: {profileId: emoji}}; a null emoji takes it away.
export function applyReaction(map,{message_id,profile_id,emoji}){
  const next={...map,[message_id]:{...(map[message_id]??{})}};
  if(emoji)next[message_id][profile_id]=emoji;else delete next[message_id][profile_id];
  return next;
}
// The outbox keeps unsent messages (their client ids make retries safe) until the server confirms them.
export function outboxAdd(box,item){return [...box.filter(x=>x.id!==item.id),item].slice(-50);}
export const outboxRemove=(box,id)=>box.filter(x=>x.id!==id);
export const isUuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v??''));
// Photos travel small: longest side 1600 px.
export function fitSize(w,h,max=1600){if(!(w>0&&h>0))return {w:0,h:0};const k=Math.min(1,max/Math.max(w,h));return {w:Math.round(w*k),h:Math.round(h*k)};}
