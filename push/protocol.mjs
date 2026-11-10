// Dependency-free shared boundary. Import has no effects and no browser secrets.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const VENDORS = Object.freeze(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com']);
export function decodeKey(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid push key');
  const bytes = Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4)), c=>c.charCodeAt(0));
  if (bytes.length!==size || encodeKey(bytes)!==value || (size===65 && bytes[0]!==4)) throw new Error('Invalid push key');
  return bytes;
}
export function encodeKey(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function endpointURL(value) {
  if (typeof value!=='string' || value.length>2048 || !/^https:\/\/[a-z.]+\/[A-Za-z0-9_./~-]+$/.test(value) || /(^|\/)\.{1,2}(\/|$)/.test(value)) throw new Error('Invalid push endpoint');
  const url = new URL(value);
  if (!VENDORS.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) throw new Error('Invalid push endpoint');
  return url;
}
export function appURL(value) {
  const url = new URL(value);
  if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error('Invalid public app URL');
  return url;
}
export function dispatchBody(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).join(',')!=='event_id' || !UUID.test(value.event_id)) throw new Error('Invalid dispatch body');
  return value.event_id;
}
export function validatePayload(p) {
  if (!p || p.version!==1 || !UUID.test(p.event_id) || !['en','fr','aeb-TN'].includes(p.locale) || typeof p.title!=='string' || !p.title || p.title.length>160 || typeof p.body!=='string' || !p.body || p.body.length>500 || typeof p.preview!=='boolean') throw new Error('Invalid push payload');
  return p;
}
export function notificationOptions(payload, scope) {
  const p = validatePayload(payload); const url=appURL(scope);
  // URL is generated from local registration scope, never from the message.
  return {title:p.title, options:{body:p.body, lang:p.locale, dir:p.locale==='aeb-TN'?'rtl':'ltr',tag:'thought-'+p.event_id,renotify:false,
    icon:new URL('push/icons/icon-192.png',url).href, badge:new URL('push/icons/badge-96.png',url).href,
    data:{event_id:p.event_id,url:url.href}}};
}
