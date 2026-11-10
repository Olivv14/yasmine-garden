import {preparePush,dispatchThought} from '../push/client.mjs';
import {nativeConfig,NativeStore,NativeTransition,pushReceipt,pushRecords} from './native-state.js';
import {t,copy,locale} from './experience.js';
export function createNativeUI({$,el,button,client,getOwner,getPreferences}){
 const gate=new NativeTransition(),store=new NativeStore(document.baseURI),dispatching=new Set();let owner=null,controller=null,config=null,opened=false,busy=false,blocked=false,unknown=false,records=[],message='intro',activeOperation=null;
 const section=el('details');section.id='nativeSettings';const summary=el('summary',()=>t('native.title'));const status=el('p');status.id='nativeStatus';status.setAttribute('role','status');
 const preview=el('input');preview.type='checkbox';preview.id='nativePreview';const label=el('label',()=>t('native.preview'));label.htmlFor=preview.id;
 const enable=button(()=>t('native.enable'),enableClick);enable.id='nativeEnable';const prepare=button(()=>t('native.prepare'),()=>operation(prepareNow));prepare.id='nativePrepare';
 const disable=button(()=>t('native.disable'),()=>operation(disableNow));disable.id='nativeDisable';
 const prefs=button(()=>t('native.savePreferences'),()=>{$('preferencesSave').scrollIntoView({block:'center'});$('preferencesSave').focus();});prefs.id='nativePreferences';
 const devices=el('div'),delivery=el('div');delivery.id='nativeDelivery';
 section.append(summary,el('p',()=>t('native.intro'),'hint'),el('p',()=>t('native.platform'),'hint'),preview,label,prepare,enable,disable,prefs,status,devices);$('profileView').append(section);$('affectionPanel').append(delivery);
 const recovery=el('div',undefined,'statusbar error');recovery.id='nativeRecovery';recovery.hidden=true;recovery.setAttribute('role','alert');const recoveryText=el('p',()=>t('native.blocked'));const retryLogout=button(()=>t('native.retryLogout'),()=>$('logout').click());recovery.append(recoveryText,retryLogout);$('connectionStatus').after(recovery);
 function context(){const c=gate.context(owner),assert=c.assertCurrent;c.assertCurrent=()=>{assert();if(owner!==c.userId||getOwner()!==c.userId)throw Error('stale');};return c;}
 function current(c){try{c.assertCurrent();return true;}catch{return false;}}
 function hasLocale(){const p=getPreferences();return p&&p.locale===locale()&&['en','fr','aeb-TN'].includes(p.locale);}
 function supported(){return isSecureContext&&'serviceWorker'in navigator&&'PushManager'in globalThis&&'Notification'in globalThis&&!(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches&&!navigator.standalone);}
 function paint(){copy(status,()=>t('native.'+message));preview.disabled=busy||gate.frozen;prepare.disabled=busy||gate.frozen;enable.disabled=busy||gate.frozen||!controller||unknown||!hasLocale()||globalThis.Notification?.permission==='denied';disable.disabled=busy||gate.frozen||!controller||unknown;prefs.hidden=hasLocale();devices.replaceChildren();for(const row of records){let own=false;try{own=store.device(owner)===row.id;}catch{message='storage';}if(own)devices.append(el('p',()=>t(row.enabled?'native.serverEnabled':'native.serverDisabled',{preview:t(row.preview?'native.on':'native.off')}),'hint'));}recovery.hidden=!blocked;paintEvents();}
 function fail(e){message=e?.message==='queueFull'?'queueFull':e?.message==='unknown'?'unknown':/VAPID/.test(e?.message??'')?'reconcile':e?.message==='unsupported'?'unsupported':e?.message==='config'?'unavailable':e?.message==='locale'?'locale':e?.message==='storage'||e?.name==='QuotaExceededError'||e?.name==='SecurityError'?'storage':globalThis.Notification?.permission==='denied'?'denied':'uncertain';}
 async function operation(fn){if(busy||gate.frozen)return;const c=context(),op={};activeOperation=op;busy=true;paint();const valid=()=>current(c)&&activeOperation===op;try{await gate.track(()=>fn(c));}catch(e){if(valid())fail(e);}finally{if(valid()){activeOperation=null;busy=false;paint();}}}
 async function fetchConfig(c=context()){if(config)return config;try{const r=await fetch(new URL('push-config.json',document.baseURI),{cache:'no-store',credentials:'omit'});c.assertCurrent();if(!r.ok)throw Error('config');const cfg=nativeConfig(await r.json(),document.baseURI);c.assertCurrent();config=cfg;return cfg;}catch(e){c.assertCurrent();throw Error('config');}}
 async function readback(c){const {data,error}=await client.rpc('list_my_push',{});c.assertCurrent();const user=await client.auth.getUser();c.assertCurrent();if(error||user.error||user.data?.user?.id!==c.userId)throw Error('readback');records=pushRecords(data);}
 async function prepareNow(c=context()){
  c.assertCurrent();if(!owner)throw Error('owner');message='preparing';paint();if(!supported())throw Error('unsupported');const id=store.device(c.userId),cfg=await fetchConfig(c);c.assertCurrent();
  if(controller){const old=controller;await old.cancel();c.assertCurrent();if(controller===old)controller=null;}c.assertCurrent();
  const prepared=await preparePush({...cfg,supabase:client,deviceId:id,saveDeviceId:(value,captured)=>store.saveDeviceId(value,captured),expectedUserId:c.userId,getAuthGeneration:()=>gate.generation,signal:c.signal});
  try{c.assertCurrent();const registration=await navigator.serviceWorker.getRegistration(cfg.appBaseUrl);c.assertCurrent();const sub=await registration?.pushManager.getSubscription();c.assertCurrent();const binding=store.binding();unknown=!!sub&&(!id||binding?.owner!==c.userId||binding?.id!==id);await readback(c);c.assertCurrent();controller=prepared;message=unknown?'unknown':Notification.permission==='denied'?'denied':!hasLocale()?'locale':'ready';}catch(e){await prepared.cancel();throw e;}
 }
 function enableClick(){if(busy||gate.frozen||!controller||unknown)return;if(!hasLocale()){message='locale';paint();return;}busy=true;const c=context(),op={};activeOperation=op;const valid=()=>current(c)&&activeOperation===op;let task;try{
  // Must remain synchronous: no awaited verification/preparation before this call.
  task=gate.track(()=>{const enabled=controller.enableFromGesture({preview:preview.checked});return enabled.then(async()=>{c.assertCurrent();await readback(c);c.assertCurrent();message='enabled';});});
 }catch(e){if(valid()){activeOperation=null;busy=false;fail(e);paint();}return;}
 paint();task.catch(e=>{if(valid())fail(e);}).finally(()=>{if(valid()){activeOperation=null;busy=false;paint();}});
 }
 async function disableNow(c=context()){c.assertCurrent();if(unknown)throw Error('unknown');if(!controller)await prepareNow(c);c.assertCurrent();if(unknown)throw Error('unknown');const target=controller;await target.disableBeforeLogout();c.assertCurrent();records=[];message='disabled';preview.checked=false;await target.cancel();c.assertCurrent();if(controller===target)controller=null;}
 section.addEventListener('toggle',()=>{if(section.open){opened=true;operation(prepareNow);}});
 function paintEvents(){delivery.replaceChildren();if(!owner)return;let rows;try{rows=store.events(owner);}catch{delivery.append(el('p',()=>t('native.storage'),'error'));return;}for(const row of rows){const box=el('article',undefined,'entry');box.dataset.nativeEvent=row.id;box.append(el('p',()=>t(row.stored?'native.eventStored':'native.eventUnknown')));box.append(el('p',()=>row.push?t('native.provider',{accepted:row.push.provider_accepted,targets:row.push.targets,retriable:row.push.retriable,terminal:row.push.terminal}):t('native.providerUnknown')));box.append(el('p',()=>t('native.displayUnknown'),'hint'));if(!row.push||row.push.retriable){const retry=button(()=>t('native.retryEvent'),()=>dispatch(row.owner,row.id));retry.disabled=gate.frozen||busy||dispatching.has(row.id);box.append(retry);}delivery.append(box);}}
 async function dispatch(originalOwner,id){if(originalOwner!==owner||gate.frozen||dispatching.has(id))return;const c=context();dispatching.add(id);paintEvents();try{await gate.track(async()=>{await fetchConfig(c);c.assertCurrent();store.putEvent(originalOwner,id,{},c);const data=await dispatchThought({supabase:client,eventId:id,expectedUserId:originalOwner,getAuthGeneration:()=>gate.generation,signal:c.signal});c.assertCurrent();store.putEvent(originalOwner,id,{stored:true,push:pushReceipt(data,id)},c);});}catch(e){if(!c.signal.aborted)fail(e);}finally{dispatching.delete(id);if(!c.signal.aborted)paint();}}
 return {
  gate,
  receive(user){if(owner!==user){owner=user;preview.checked=false;records=[];message='intro';blocked=false;unknown=false;gate.reset();}try{paint();}catch(e){fail(e);copy(status,()=>t('native.storage'));}},
  intent(originalOwner,id){if(originalOwner!==owner)throw Error('owner');try{store.putEvent(originalOwner,id,{},context());paintEvents();}catch(e){fail(e);paint();}},
  stored(originalOwner,id){if(originalOwner!==owner)return;try{store.putEvent(originalOwner,id,{stored:true},context());paintEvents();dispatch(originalOwner,id);}catch(e){fail(e);paint();}},
  invalidate({clear=true}={}){gate.invalidate();const old=controller;controller=null;old?.cancel();busy=false;activeOperation=null;records=[];message='refresh';if(gate.frozen&&!clear){blocked=true;message='uncertain';}if(clear){owner=null;opened=false;preview.checked=false;section.open=false;blocked=false;gate.reset();delivery.replaceChildren();}else if(opened&&!gate.frozen){const c=context();setTimeout(()=>{if(current(c))operation(prepareNow);},0);}if(owner)paint();else{copy(status,()=>t('native.intro'));devices.replaceChildren();recovery.hidden=true;}},
  async logout(signout,drain,freeze=()=>{}){const c=context();try{const task=gate.logout(async()=>{c.assertCurrent();await drain();c.assertCurrent();let id,storageError;try{id=store.device(c.userId);}catch(e){storageError=e;}
   if(storageError){
    // Denial is not opt-out confirmation. Only an explicitly absent config AND
    // absent browser registration, with no prepared native state, permits core logout.
    if(storageError.name!=='SecurityError'||controller||config||!supported())throw storageError;
    const reg=await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);c.assertCurrent();if(reg)throw storageError;
    const response=await fetch(new URL('push-config.json',document.baseURI),{cache:'no-store',credentials:'omit'});c.assertCurrent();if(response.status!==404)throw storageError;
   }else if(id||controller){if(!controller)await prepareNow(c);c.assertCurrent();await disableNow(c);}else if(supported()){const reg=await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);c.assertCurrent();const sub=await reg?.pushManager.getSubscription();c.assertCurrent();if(sub)throw Error('unknown');}
   c.assertCurrent();if(controller){const old=controller;await old.cancel();c.assertCurrent();if(controller===old)controller=null;}
  },async()=>{c.assertCurrent();await signout(c);});freeze();paint();await task;if(current(c))blocked=false;}catch(e){if(current(c)){blocked=true;fail(e);paint();}throw e;}},
  preferencesChanged(){if(owner)paint();}
 };
}
