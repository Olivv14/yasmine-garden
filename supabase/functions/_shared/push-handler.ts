import { dispatchBody,appURL,decodeKey } from '../../../push/protocol.mjs';
import { buildPayload } from '../../../push/payload.mjs';
import type { Subscription,PushOutcome } from './push-transport.ts';
export type Result = {data:unknown;error:unknown;status?:number};
// Only recognizable, completed DB denials are proof of a non-persisted call.
function deterministicDenial(result:Result){
 const code=(result.error as {code?:unknown}|null)?.code;
 return typeof result.status==='number'&&result.status>=400&&result.status<500&&![408,429].includes(result.status)&&typeof code==='string'&&['22023','23505','42501','54000','P0001','40001'].includes(code);
}
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<Result>;
export type Target=Subscription & {subscription_id:string;lease_token:string;locale:string;phrase_key:string;sender:string;preview:boolean};
export type Dependencies={
 appUrl:string;
 authenticate:(token:string)=>Promise<{user:unknown;rpc:Rpc}>;
 privileged:()=>Promise<{rpc:Rpc;send:(target:Subscription,payload:unknown)=>Promise<PushOutcome>}>;
};
export function requiredEnvironment(get:(key:string)=>string|undefined) {
 const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_CONTACT','PUBLIC_APP_URL'] as const;
 const env=Object.fromEntries(names.map(name=>{const value=get(name);if(!value) throw new Error('Missing required environment: '+name);return[name,value];})) as Record<typeof names[number],string>;
 const project=new URL(env.SUPABASE_URL); if(project.protocol!=='https:' || project.username || project.password || project.search || project.hash || project.pathname!=='/') throw new Error('Invalid Supabase URL');
 appURL(env.PUBLIC_APP_URL); decodeKey(env.VAPID_PUBLIC_KEY,65);decodeKey(env.VAPID_PRIVATE_KEY,32);
 const contact=new URL(env.VAPID_CONTACT);if(!['https:','mailto:'].includes(contact.protocol) || contact.username || contact.password || !contact.pathname || /[\s\r\n]/.test(env.VAPID_CONTACT)) throw new Error('Invalid VAPID contact');
 return env;
}
export function createHandler(deps:Dependencies) {
 const allowedOrigin=appURL(deps.appUrl).origin;
 return async (request:Request):Promise<Response> => {
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin===allowedOrigin?{'Access-Control-Allow-Origin':allowedOrigin}:{})};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(origin && origin!==allowedOrigin) return reply(403,{error:'origin_denied'});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
  if(request.method!=='POST') return reply(405,{error:'method_not_allowed'});
  const auth=request.headers.get('Authorization');
  if(!auth || !/^Bearer [A-Za-z0-9._~-]+$/.test(auth) || auth.length>8192) return reply(401,{error:'authentication_required'});
  let userSession;
  try { userSession=await deps.authenticate(auth.slice(7)); if(!userSession.user) return reply(401,{error:'authentication_required'}); }
  catch { return reply(401,{error:'authentication_required'}); }
  let eventId:string;
  try {
    if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('content type');
    // Bounded reader, not merely a client-controlled Content-Length check.
    const reader=request.body?.getReader(); if(!reader) throw new Error('body');
    let body='';let bytes=0;const decoder=new TextDecoder();
    try { while(true){const part=await reader.read();if(part.done) break;bytes+=part.value.length;if(bytes>256) throw new Error('size');body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode(); }
    finally { await reader.cancel(); }
    eventId=dispatchBody(JSON.parse(body));
  } catch { return reply(400,{error:'invalid_request'}); }
  let receipt:unknown;
  try {
    // ALWAYS use the bearer user's client: create/idempotency/owner check runs in SQL.
    const persisted=await userSession.rpc('send_thought',{p_id:eventId});
    if(persisted.error){if(deterministicDenial(persisted))return reply(409,{error:'event_not_persisted'});throw new Error('persistence unknown');}
    const row=Array.isArray(persisted.data)?(persisted.data.length===1?persisted.data[0]:null):persisted.data;
    if(!row || row.id!==eventId) throw new Error('invalid receipt');
    receipt={id:row.id,phrase_key:row.phrase_key,sequence:row.sequence,created_at:row.created_at};
  } catch { return reply(503,{error:'event_persistence_unknown',retry_same_event:true}); }
  try {
    // Service client and cryptographic sender are instantiated only AFTER verified Auth + owner RPC.
    const service=await deps.privileged();
    const claim=await service.rpc('push_claim',{p_event_id:eventId});
    if(claim.error || !Array.isArray(claim.data) || claim.data.length>5) throw new Error('claim failed');
    await Promise.all((claim.data as Target[]).map(async target=>{
      let outcome:PushOutcome='rejected';
      let payload:unknown;
      try { payload=buildPayload(eventId,target); }
      catch { outcome='rejected'; } // invalid stored target, sanitized terminal failure
      if(payload) {
        try { outcome=await service.send(target,payload); }
        catch { outcome='retry'; } // unknown transport failure is explicitly retriable
      }
      outcome ??= 'rejected';
      const complete=await service.rpc('push_complete',{p_event_id:eventId,p_subscription_id:target.subscription_id,p_lease_token:target.lease_token,p_outcome:outcome});
      if(complete.error || complete.data!==true) throw new Error('completion not committed');
    }));
    const status=await service.rpc('push_status',{p_event_id:eventId});if(status.error) throw new Error('status failed');
    return reply(200,{event_persisted:true,receipt,push:status.data,device_displayed:'unknown'});
  } catch { return reply(503,{event_persisted:true,receipt,error:'push_dispatch_incomplete',retry_same_event:true,device_displayed:'unknown'}); }
 };
}
