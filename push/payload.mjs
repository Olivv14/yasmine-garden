import { PHRASES,COPY,KINDS } from './catalogs.mjs';
import { validatePayload } from './protocol.mjs';
export function buildPayload(eventId,target) {
  if (!Object.hasOwn(PHRASES,target.locale) || !/^affection\.phrase(0[1-9]|10)$/.test(target.phrase_key) || typeof target.sender!=='string' || target.sender.length<1 || [...target.sender].length>80 || typeof target.preview!=='boolean') throw new Error('Invalid push target');
  const catalog=PHRASES[target.locale]; const text=COPY[target.locale];
  return validatePayload({version:1,event_id:eventId,locale:target.locale,title:text.title,preview:target.preview,
    body:target.preview ? catalog[Number(target.phrase_key.slice(-2))-1].replace('{{sender}}',()=>target.sender) : text.generic});
}
// A bell row (message, dedication, song, game, word). Preview off: the generic lock-screen line.
// Preview on: who and what, with the message words or song title when there are any.
export function buildNotificationPayload(id,target) {
  if (!Object.hasOwn(KINDS,target.locale) || !Object.hasOwn(KINDS[target.locale],target.kind) || typeof target.sender!=='string' || target.sender.length<1 || [...target.sender].length>80
    || typeof target.preview!=='boolean' || (target.text!=null && (typeof target.text!=='string' || target.text.length>140))) throw new Error('Invalid push target');
  const line=KINDS[target.locale][target.kind].replace('{{sender}}',()=>target.sender), text=COPY[target.locale];
  return validatePayload({version:1,event_id:id,locale:target.locale,preview:target.preview,
    title:target.preview?line:text.title, body:target.preview?(target.text?.trim()||line):text.generic});
}
