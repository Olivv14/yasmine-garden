import { PHRASES,COPY } from './catalogs.mjs';
import { validatePayload } from './protocol.mjs';
export function buildPayload(eventId,target) {
  if (!Object.hasOwn(PHRASES,target.locale) || !/^affection\.phrase(0[1-9]|10)$/.test(target.phrase_key) || typeof target.sender!=='string' || target.sender.length<1 || [...target.sender].length>80 || typeof target.preview!=='boolean') throw new Error('Invalid push target');
  const catalog=PHRASES[target.locale]; const text=COPY[target.locale];
  return validatePayload({version:1,event_id:eventId,locale:target.locale,title:text.title,preview:target.preview,
    body:target.preview ? catalog[Number(target.phrase_key.slice(-2))-1].replace('{{sender}}',()=>target.sender) : text.generic});
}
