import { createPushSender } from '../_shared/push-transport.ts';
import { createHandler,requiredEnvironment,type Dependencies,type Result } from '../_shared/push-handler.ts';
import { encodeKey,decodeKey,endpointURL } from '../../../push/protocol.mjs';
import { buildPayload } from '../../../push/payload.mjs';
import { PHRASES } from '../../../push/catalogs.mjs';
import { decrypt,Header } from 'jsr:@negrel/http-ece@0.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
function ok(value:unknown,label='assertion'){if(!value)throw new Error(label);}
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Values differ');}
async function rejects(fn:()=>unknown|Promise<unknown>){let failed=false;try{await fn();}catch{failed=true;}ok(failed,'Expected rejection');}
const eventId=crypto.randomUUID();
const target={subscription_id:crypto.randomUUID(),lease_token:crypto.randomUUID(),locale:'fr',phrase_key:'affection.phrase02',sender:'Synthetic A',preview:true};
Deno.test('30 exact static phrase translations match experience keys, no fallback',async()=>{
 for(const locale of ['en','fr','aeb-TN'] as const){
  const catalog=JSON.parse(await Deno.readTextFile(new URL(`../../../experience/locales/${locale}.json`,import.meta.url)));
  for(let i=1;i<=10;i++){
   const key='affection.phrase'+String(i).padStart(2,'0');
   eq(PHRASES[locale][i-1],catalog[key]);
   eq(buildPayload(eventId,{...target,locale,phrase_key:key}).body,catalog[key].replace('{{sender}}',target.sender));
  }
 }
 eq(buildPayload(eventId,{...target,preview:false}).body,'Vous avez une nouvelle notification.');
 await rejects(()=>buildPayload(eventId,{...target,locale:'ar'}));
 await rejects(()=>buildPayload(eventId,{...target,phrase_key:'thought.01'}));
});
Deno.test('SSRF URL and canonical key validation rejects all non-vendor inputs',async()=>{
 for(const value of ['https://127.0.0.1/a','http://web.push.apple.com/a','https://web.push.apple.com.evil/a','https://u@web.push.apple.com/a','https://web.push.apple.com:443/a','https://web.push.apple.com/a?x=1','https://web.push.apple.com/a#f','https://web.push.apple.com/a/%2e%2e/b','https://web.push.apple.com/a/../b','https://web.push.apple.com./a'])await rejects(()=>endpointURL(value));
 endpointURL('https://web.push.apple.com/synthetic-token');
 await rejects(()=>decodeKey('xx=',16));await rejects(()=>decodeKey('x',65));
});
Deno.test('required env has no project/key/contact/url fallback',async()=>{
 await rejects(()=>requiredEnvironment(()=>undefined));
});
Deno.test('real RFC8291 encryption decrypts + VAPID ES256 verifies, provider is mock only',async()=>{
 const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pub=encodeKey(new Uint8Array(await crypto.subtle.exportKey('raw',vapid.publicKey)));
 const jwk=await crypto.subtle.exportKey('jwk',vapid.privateKey);ok(jwk.d);
 const ua=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const p=encodeKey(new Uint8Array(await crypto.subtle.exportKey('raw',ua.publicKey)));
 const auth=crypto.getRandomValues(new Uint8Array(16));const endpoint='https://web.push.apple.com/synthetic-only';let calls=0;let status=201;let throwNetwork=false;
 const payload=buildPayload(eventId,target);
 const mock:typeof fetch=async(input,init)=>{
  calls++;eq(input,endpoint);eq(init?.redirect,'error');ok(init?.signal);eq(init?.method,'POST');
  const headers=new Headers(init?.headers);eq(headers.get('Content-Encoding'),'aes128gcm');eq(headers.get('TTL'),'300');
  const authorization=headers.get('Authorization')||'';const jwt=authorization.match(/^vapid t=([^,]+), k=(.+)$/);ok(jwt);if(!jwt)throw new Error('Missing VAPID');eq(jwt[2],pub);
  const pieces=jwt[1].split('.');const claims=JSON.parse(new TextDecoder().decode(decodeKey(pieces[1],decodeKeyLength(pieces[1]))));
  eq(claims.aud,'https://web.push.apple.com');eq(claims.sub,'mailto:operator@example.invalid');ok(claims.exp>Date.now()/1000&&claims.exp<Date.now()/1000+86400);
  ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vapid.publicKey,decodeKey(pieces[2],64),new TextEncoder().encode(pieces[0]+'.'+pieces[1])),'VAPID signature');
  if(!(init?.body instanceof ArrayBuffer))throw new Error('Expected encrypted bytes');
  const body=init.body;ok(!new TextDecoder().decode(body).includes(payload.body));
  const header=Header.fromBytes(body);const rawKey=new Uint8Array(header.keyid);
  const peer=await crypto.subtle.importKey('raw',rawKey,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=await crypto.subtle.deriveBits({name:'ECDH',public:peer},ua.privateKey,256);
  const info=new Uint8Array(14+65+65);info.set(new TextEncoder().encode('WebPush: info\0'));info.set(decodeKey(p,65),14);info.set(rawKey,79);
  const h=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveBits']);
  const ikm=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:auth,info},h,256);
  eq(JSON.parse(new TextDecoder().decode(await decrypt(body,ikm))),payload);
  if(throwNetwork)throw new TypeError('private diagnostic must not escape');
  return new Response(null,{status});
 };
 const send=await createPushSender({publicKey:pub,privateKey:jwk.d!,contact:'mailto:operator@example.invalid'},mock);
 const subscription={endpoint,p256dh:p,auth:encodeKey(auth)};
 eq(await send(subscription,payload),'accepted');
 for(const [code,outcome] of [[404,'gone'],[410,'gone'],[429,'retry'],[503,'retry'],[302,'rejected'],[400,'rejected']] as const){status=code;eq(await send(subscription,payload),outcome);}
 throwNetwork=true;eq(await send(subscription,payload),'retry');const before=calls;await rejects(()=>send({...subscription,endpoint:'https://127.0.0.1/a'},payload));eq(calls,before);
});
function decodeKeyLength(s:string){return Math.floor(s.length*6/8);}
for(const mode of ['network','timeout','500','503','408','unknown','denial','conflict','cooldown'] as const)Deno.test('BUG23 actual SDK persistence result '+mode,async()=>{
 let requests=0,privileged=0;const ids:unknown[]=[];
 const sdk=createClient('https://project.example.invalid','synthetic-anon',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(_input,init)=>{
   requests++;ids.push(JSON.parse(String(init?.body)).p_id);
   if(mode==='network')throw new TypeError('private connection lost after possible commit');
   if(mode==='timeout')throw new DOMException('private timeout','TimeoutError');
   const status=mode==='denial'?403:mode==='conflict'?409:mode==='cooldown'?400:mode==='unknown'?400:Number(mode);
   return new Response(JSON.stringify({code:mode==='denial'?'42501':mode==='conflict'?'23505':mode==='cooldown'?'P0001':mode==='500'?'42501':'XX000',message:'private upstream diagnostic'}),{status,headers:{'Content-Type':'application/json'}});
 }}});
 const handler=createHandler({appUrl:'https://app.example.invalid/',authenticate:async()=>({user:{id:'synthetic'},rpc:async(name,args)=>{const result=await sdk.rpc(name,args);if(mode==='network'||mode==='timeout')eq(result.status,0);return result;}}),privileged:async()=>{privileged++;throw new Error('privilege must not run');}});
 for(let retry=0;retry<2;retry++){
  const response=await handler(new Request('https://app.example.invalid/',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({event_id:eventId})}));
  const known=['denial','conflict','cooldown'].includes(mode);eq(response.status,known?409:503);eq(await response.json(),known?{error:'event_not_persisted'}:{error:'event_persistence_unknown',retry_same_event:true});
 }
 eq(requests,2);eq(ids,[eventId,eventId]);eq(privileged,0);
});
Deno.test('manual bearer auth + ownership happen BEFORE privileged client; strict body',async()=>{
 let auth=true,owner=true,privileged=0,sends=0;const order:string[]=[];
 const deps:Dependencies={appUrl:'https://app.example.invalid/yasmine-garden/',
  authenticate:async()=>{order.push('getUser');if(!auth)throw new Error('no');return {user:{id:crypto.randomUUID()},rpc:async(name,args)=>{order.push(name);eq(args,{p_id:eventId});return owner?{data:{id:eventId,phrase_key:target.phrase_key},error:null}:{data:null,error:{code:'42501'},status:403};}};},
  privileged:async()=>{privileged++;order.push('service');return{send:async()=>{sends++;return 'accepted';},rpc:async(name):Promise<Result>=>({error:null,data:name==='push_claim'?[target]:name==='push_complete'?true:{targets:1,provider_accepted:1,retriable:0,terminal:0}})};}};
 const handler=createHandler(deps);
 const request=(body:unknown={event_id:eventId},token='Bearer synthetic')=>new Request(deps.appUrl,{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 eq((await handler(request({},''))).status,401);eq(privileged,0);
 auth=false;eq((await handler(request())).status,401);eq(privileged,0);auth=true;
 for(const body of [{event_id:eventId,recipient:'forged'},{event_id:eventId,locale:'fr'},{event_id:eventId,actor:'forged'},{event_id:'x'},{event_id:eventId,extra:'x'.repeat(300)}])eq((await handler(request(body))).status,400);eq(privileged,0);
 owner=false;eq((await handler(request())).status,409);eq(privileged,0);owner=true;order.length=0;
 const response=await handler(request());eq(response.status,200);eq(order,['getUser','send_thought','service']);eq(sends,1);const result=await response.json();eq(result.device_displayed,'unknown');eq(result.event_persisted,true);ok(!JSON.stringify(result).includes('endpoint'));
});
Deno.test('provider exception / completion failure produce explicit persisted + retriable response',async()=>{
 const handler=createHandler({appUrl:'https://app.example.invalid/',authenticate:async()=>({user:{},rpc:async()=>({data:{id:eventId},error:null})}),privileged:async()=>({send:async()=>{throw new Error('sensitive');},rpc:async(name)=>({data:name==='push_claim'?[target]:null,error:name==='push_complete'?{}:null})})});
 const result=await handler(new Request('https://app.example.invalid/',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({event_id:eventId})}));eq(result.status,503);const body=await result.json();eq(body.event_persisted,true);eq(body.retry_same_event,true);ok(!JSON.stringify(body).includes('sensitive'));
});
