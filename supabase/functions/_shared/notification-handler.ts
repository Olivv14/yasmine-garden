// Push for a bell row (backend 006/009): a message, a dedication, an added song, a game, a word.
// Same checks as the thought dispatch: allowed origin, a verified signed-in user, a bounded body.
// Only the row's sender can dispatch it (checked in SQL with the verified Auth user id).
import { dispatchBody,appURL } from '../../../push/protocol.mjs';
import { buildNotificationPayload } from '../../../push/payload.mjs';
import type { Subscription,PushOutcome } from './push-transport.ts';
export type Result = {data:unknown;error:unknown;status?:number};
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<Result>;
export type NotificationTarget=Subscription & {subscription_id:string;lease_token:string;locale:string;kind:string;sender:string;preview:boolean;text:string|null};
export type NotificationDependencies={
 appUrl:string;
 authenticate:(token:string)=>Promise<string|null>; // the verified Auth user id
 privileged:()=>Promise<{rpc:Rpc;send:(target:Subscription,payload:unknown)=>Promise<PushOutcome>}>;
};

export function createNotificationHandler(deps:NotificationDependencies){
 const allowedOrigin=appURL(deps.appUrl).origin;
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin===allowedOrigin?{'Access-Control-Allow-Origin':allowedOrigin}:{})};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&origin!==allowedOrigin) return reply(403,{error:'origin_denied'});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
  if(request.method!=='POST') return reply(405,{error:'method_not_allowed'});
  const auth=request.headers.get('Authorization');
  if(!auth||!/^Bearer [A-Za-z0-9._~-]+$/.test(auth)||auth.length>8192) return reply(401,{error:'authentication_required'});
  let userId:string|null;
  try{ userId=await deps.authenticate(auth.slice(7)); }catch{ userId=null; }
  if(!userId) return reply(401,{error:'authentication_required'});
  let id:string;
  try{
   if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('content type');
   const text=await request.text(); if(text.length>256) throw new Error('size');
   id=dispatchBody(JSON.parse(text));
  }catch{ return reply(400,{error:'invalid_request'}); }
  try{
   const service=await deps.privileged();
   const claim=await service.rpc('push_claim_notification',{p_id:id,p_sender_auth:userId});
   if(claim.error){const code=(claim.error as {code?:unknown}).code;if(code==='42501')return reply(403,{error:'not_your_notification'});throw new Error('claim failed');}
   if(!Array.isArray(claim.data)||claim.data.length>5) throw new Error('claim shape');
   await Promise.all((claim.data as NotificationTarget[]).map(async target=>{
    let outcome:PushOutcome='rejected';let payload:unknown;
    try{ payload=buildNotificationPayload(id,target); }catch{ outcome='rejected'; }
    if(payload){ try{ outcome=await service.send(target,payload); }catch{ outcome='retry'; } }
    const complete=await service.rpc('push_complete_notification',{p_id:id,p_subscription_id:target.subscription_id,p_lease_token:target.lease_token,p_outcome:outcome});
    if(complete.error||complete.data!==true) throw new Error('completion not committed');
   }));
   const status=await service.rpc('push_status_notification',{p_id:id});if(status.error) throw new Error('status failed');
   return reply(200,{push:status.data,device_displayed:'unknown'});
  }catch{ return reply(503,{error:'push_dispatch_incomplete',retry_same_event:true,device_displayed:'unknown'}); }
 };
}
