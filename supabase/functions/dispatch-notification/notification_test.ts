import { createNotificationHandler } from '../_shared/notification-handler.ts';
import { KINDS } from '../../../push/catalogs.mjs';
const eq=(a:unknown,b:unknown,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m} ${JSON.stringify(a)} != ${JSON.stringify(b)}`);};
const APP='https://olivv14.github.io/yasmine-garden/',ORIGIN='https://olivv14.github.io',ID='e0000000-0000-4000-8000-000000000001';
const req=(init:RequestInit&{origin?:string}={})=>new Request('https://x.supabase.co/functions/v1/dispatch-notification',{method:'POST',
  headers:{'Origin':init.origin??ORIGIN,'Authorization':'Bearer token.abc','Content-Type':'application/json',...(init.headers as Record<string,string>??{})},body:init.body??JSON.stringify({event_id:ID}),...init});
function fixture(claim:{data?:unknown;error?:unknown}={data:[]}){
 const calls:{name:string;args:Record<string,unknown>}[]=[];const sent:unknown[]=[];
 const handler=createNotificationHandler({appUrl:APP,authenticate:async t=>t==='token.abc'?'auth-user-1':null,
  privileged:async()=>({rpc:async(name,args)=>{calls.push({name,args});
    if(name==='push_claim_notification')return {data:claim.data??null,error:claim.error??null};
    if(name==='push_complete_notification')return {data:true,error:null};
    return {data:{targets:1,provider_accepted:1,retriable:0,terminal:0},error:null};},
   send:async(_t,p)=>{sent.push(p);return 'accepted';}})});
 return {handler,calls,sent};
}
const target={subscription_id:'s1',lease_token:'l1',endpoint:'https://web.push.apple.com/x',p256dh:'k',auth:'a',locale:'es',kind:'message',sender:'Yasmine',preview:true,text:'Te extraño'};
Deno.test('origin, method, sign-in and body are checked before anything private',async()=>{
 const {handler,calls}=fixture();
 eq((await handler(req({origin:'https://evil.example'}))).status,403,'foreign origin');
 eq((await handler(req({method:'OPTIONS',body:null}))).status,204,'preflight');
 eq((await handler(req({method:'GET',body:null}))).status,405,'method');
 eq((await handler(req({headers:{'Authorization':'Bearer wrong'}}))).status,401,'unverified user');
 eq((await handler(req({body:JSON.stringify({event_id:'nope'})}))).status,400,'bad id');
 eq((await handler(req({body:JSON.stringify({event_id:ID,extra:1})}))).status,400,'extra field');
 eq(calls.length,0,'no privileged call yet');
});
Deno.test('only the sender can dispatch: the verified user id goes to SQL',async()=>{
 const {handler,calls}=fixture({error:{code:'42501'}});
 const r=await handler(req());eq(r.status,403);eq(calls[0],{name:'push_claim_notification',args:{p_id:ID,p_sender_auth:'auth-user-1'}});
});
Deno.test('each claimed device gets its own language, and the outcome is recorded',async()=>{
 const {handler,calls,sent}=fixture({data:[target,{...target,subscription_id:'s2',lease_token:'l2',locale:'fr',preview:false,text:null}]});
 const r=await handler(req());eq(r.status,200);
 eq((sent[0] as {title:string;body:string}).title,'Yasmine te mandó un mensaje');eq((sent[0] as {body:string}).body,'Te extraño');
 eq((sent[1] as {title:string}).title,'Notifications');eq((sent[1] as {body:string}).body,'Vous avez une nouvelle notification.');
 eq(calls.filter(c=>c.name==='push_complete_notification').map(c=>c.args.p_outcome),['accepted','accepted']);
});
Deno.test('push lines match the app catalog in every language',async()=>{
 const keys:Record<string,string>={message:'message',dedication:'dedication',song_added:'songAdded',game_invite:'gameInvite',game_turn:'gameTurn',game_result:'gameResult',teach_card:'teachCard'};
 eq(Object.values(KINDS).every(l=>Object.keys(l).length===Object.keys(keys).length),true,'every push kind is checked');
 for(const [locale,lines] of Object.entries(KINDS)){
  const catalog=JSON.parse(await Deno.readTextFile(new URL(`../../../experience/locales/${locale}.json`,import.meta.url)));
  for(const [kind,key] of Object.entries(keys))eq((lines as Record<string,string>)[kind],catalog['push.kind.'+key],locale+' '+kind);
 }
});
