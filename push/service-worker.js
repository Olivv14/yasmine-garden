/* Classic worker resource. Parent root worker: importScripts('./push/service-worker.js');
   No fetch handler, caching, tokens, endpoint storage or notification on page load. */
'use strict';
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let p;try{if(!event.data||event.data.text().length>4096)return;p=event.data.json();}catch{return;}
  if(!p||p.version!==1||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.event_id)||!['en','fr','aeb-TN'].includes(p.locale)||typeof p.title!=='string'||!p.title||p.title.length>160||typeof p.body!=='string'||!p.body||p.body.length>500||typeof p.preview!=='boolean')return;
  const app=new URL(self.registration.scope);
  if(app.origin!==self.location.origin||app.protocol!=='https:')return;
  // Never consume a URL supplied by the network payload.
  await self.registration.showNotification(p.title,{body:p.body,lang:p.locale,dir:p.locale==='aeb-TN'?'rtl':'ltr',tag:'thought-'+p.event_id,renotify:false,
    icon:new URL('push/icons/icon-192.png',app).href,badge:new URL('push/icons/badge-96.png',app).href,data:{event_id:p.event_id}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const app=new URL(self.registration.scope);
  if(app.origin!==self.location.origin||app.protocol!=='https:')return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){const url=new URL(client.url);if(url.origin===app.origin&&url.pathname.startsWith(app.pathname)){await client.focus();return;}}
  await self.clients.openWindow(app.href);
 })());
});
// Subscription expiry/rotation requires foreground authenticated re-opt-in/reconciliation.
// No background renewal using stored credentials, no automatic permission prompt.
