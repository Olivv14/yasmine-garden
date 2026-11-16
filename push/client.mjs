import { decodeKey,appURL,dispatchBody } from './protocol.mjs';
// Parent serializes Auth transitions; observers fence work, not recall sent RPCs.
function authGuard({supabase,expectedUserId,getAuthGeneration,signal}) {
 const abort=new AbortController();let owner=expectedUserId;const generation=getAuthGeneration?.();
 const cancel=()=>abort.abort();
 const assertCurrent=()=>{if(abort.signal.aborted||signal?.aborted||(getAuthGeneration&&getAuthGeneration()!==generation))throw new Error('Push account context changed or cancelled');};
 const observed=supabase.auth.onAuthStateChange?.((event,session)=>{
  if(event!=='INITIAL_SESSION'||(owner&&session?.user?.id!==owner))cancel();
 });
 signal?.addEventListener('abort',cancel,{once:true});
 async function verify(){
  assertCurrent();const {data,error}=await supabase.auth.getUser();assertCurrent();
  const id=data?.user?.id;if(error||!id)throw new Error('Authentication required');
  if(owner&&owner!==id){cancel();assertCurrent();}owner=id;return id;
 }
 async function wait(operation){assertCurrent();const result=await operation();assertCurrent();await verify();assertCurrent();return result;}
 function dispose(){observed?.data?.subscription?.unsubscribe();signal?.removeEventListener('abort',cancel);}
 return {verify,wait,assertCurrent,cancel,dispose,context:()=>({userId:owner,authGeneration:generation,signal:abort.signal,assertCurrent})};
}
function checkApplicationKey(subscription,key){
 const raw=subscription.options?.applicationServerKey;
 const actual=raw instanceof ArrayBuffer?new Uint8Array(raw):ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):null;
 if(!actual||actual.length!==65||actual.some((byte,index)=>byte!==key[index]))throw new Error('Push VAPID reconciliation needed');
}
// Call prepare ONLY after explicit opt-in UI; it never prompts or subscribes.
// Parent serves a classic root worker importing this pack's service-worker.js.
export async function preparePush({appBaseUrl,workerUrl,vapidPublicKey,supabase,deviceId,saveDeviceId,expectedUserId,getAuthGeneration,signal}) {
 const base=appURL(appBaseUrl),worker=new URL(workerUrl,base);
 if(base.origin!==location.origin || worker.origin!==base.origin || !worker.pathname.startsWith(base.pathname)) throw new Error('Invalid local push scope');
 if(!isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in globalThis) || !('Notification' in globalThis)) throw new Error('Push unsupported');
 const key=decodeKey(vapidPublicKey,65),guard=authGuard({supabase,expectedUserId,getAuthGeneration,signal});let running=null;
 try {
 await guard.verify();
 const registration=await guard.wait(()=>navigator.serviceWorker.register(worker.href,{scope:base.pathname}));
 if(!registration.active) await guard.wait(()=>new Promise((resolve,reject)=>{
   const candidate=registration.installing||registration.waiting;if(!candidate) return reject(new Error('Worker unavailable'));
   const timer=setTimeout(()=>{cleanup();reject(new Error('Worker activation timeout'));},15000);
   const cleanup=()=>{clearTimeout(timer);candidate.removeEventListener('statechange',check);};
   const check=()=>{if(candidate.state==='activated'){cleanup();resolve();}if(candidate.state==='redundant'){cleanup();reject(new Error('Worker unavailable'));}};
   candidate.addEventListener('statechange',check);check();
 }));
 async function checkedRpc(name,args){const result=await guard.wait(()=>supabase.rpc(name,args));guard.assertCurrent();if(result.error) throw new Error('Push subscription operation failed');return result.data;}
 function run(operation){
  guard.assertCurrent();if(running)throw new Error('Push operation already in progress');
  const task=operation();running=task;
  return task.finally(()=>{if(running===task)running=null;});
 }
 return {
  // Cancels synchronously, then waits for in-flight work. Never clears IDs.
  async cancel(){guard.cancel();guard.dispose();if(running)await running.catch(()=>{});},
  // Invoke synchronously from a click handler, not after an await in that handler.
  async enableFromGesture({preview=false}={}) {
   return run(async()=>{
    if(!navigator.userActivation?.isActive) throw new Error('User gesture required');
    if(typeof preview!=='boolean') throw new Error('Preview consent required');
    // No await before the synchronous permission invocation.
    const permission=await guard.wait(()=>Notification.requestPermission());if(permission!=='granted') throw new Error('Push permission not granted');
    let sub=await guard.wait(()=>registration.pushManager.getSubscription());
    if(sub)checkApplicationKey(sub,key);
    const id=deviceId||crypto.randomUUID();
    // Parent must use this fixed owner and guard its async storage transaction.
    await guard.wait(()=>saveDeviceId(id,guard.context()));guard.assertCurrent();deviceId=id;
    if(!sub)sub=await guard.wait(()=>registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}));
    checkApplicationKey(sub,key);
    const json=sub.toJSON();guard.assertCurrent();
    const receipt=await checkedRpc('register_my_push',{p_id:id,p_endpoint:json.endpoint,p_p256dh:json.keys?.p256dh,p_auth:json.keys?.auth,p_preview:preview});guard.assertCurrent();
    const records=await checkedRpc('list_my_push',{});guard.assertCurrent();
    if(!Array.isArray(records)||!records.some(r=>r.id===id&&r.enabled&&r.preview===preview)) throw new Error('Push subscription verification failed');
    return receipt;
   });
  },
  // MUST complete BEFORE auth.signOut / account switch. Failure is actionable.
  async disableBeforeLogout() {
   return run(async()=>{
    await guard.verify();guard.assertCurrent();
    if(deviceId) {
     await checkedRpc('disable_my_push',{p_id:deviceId});guard.assertCurrent();
     const records=await checkedRpc('list_my_push',{});guard.assertCurrent();
     if(!Array.isArray(records)||!records.some(r=>r.id===deviceId&&!r.enabled)) throw new Error('Push disable verification failed');
    }
    const sub=await guard.wait(()=>registration.pushManager.getSubscription());guard.assertCurrent();
    if(sub&&!await guard.wait(()=>sub.unsubscribe())) throw new Error('Browser push unsubscribe failed');
    guard.assertCurrent();const notifications=await guard.wait(()=>registration.getNotifications());guard.assertCurrent();
    for(const notification of notifications){guard.assertCurrent();notification.close();}
    await guard.wait(()=>saveDeviceId(null,guard.context()));guard.assertCurrent();deviceId=null;
    return true;
   });
  }
 };
 }catch(error){guard.cancel();guard.dispose();throw error;}
}
export async function dispatchThought({supabase,eventId,expectedUserId,getAuthGeneration,signal}) {
 dispatchBody({event_id:eventId});
 // A persisted outbox owner cannot safely be inferred from current Auth.
 if(typeof expectedUserId!=='string'||!expectedUserId)throw new Error('Push outbox owner required; retry same event UUID');
 const guard=authGuard({supabase,expectedUserId,getAuthGeneration,signal});
 try{
  await guard.verify();guard.assertCurrent();
  const {data,error}=await guard.wait(()=>supabase.functions.invoke('dispatch-thought',{body:{event_id:eventId}}));guard.assertCurrent();
  if(error) throw new Error('Push dispatch failed; retry same event UUID');
  if(data?.event_persisted!==true || data?.device_displayed!=='unknown') throw new Error('Invalid dispatch receipt');
  return data;
 }finally{guard.dispose();}
}
