import {t,copy,uiError,errorText,locale} from './experience.js';
// Aliases are public routing only. Authorization still uses verified Auth UUIDs.
export function validateAliases(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>20)throw uiError('auth.aliasInvalid');
 const out=Object.create(null);
 for(const [alias,target] of Object.entries(value)){
  const key=alias.toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(alias)||Object.hasOwn(out,key)||typeof target!=='string'||target.length>254||!/^[a-z0-9][a-z0-9._+-]*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+invalid$/i.test(target))throw uiError('auth.aliasInvalid');
  out[key]=target;
 }
 return Object.freeze(out);
}
export function resolveLogin(input,aliases={}){
 const value=String(input).trim();
 if(value.includes('@')){if(value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw uiError('auth.invalidIdentifier');return {email:value,technical:/\.invalid$/i.test(value),source:'email'};}
 const alias=value.toLowerCase();if(!Object.hasOwn(aliases,alias))throw uiError('auth.aliasMissing');return {email:aliases[alias],technical:true,source:'alias'};
}
// Fresh Auth/enrollment verification for the private avatar controller.
// Offline removes readiness, not the confirmed binding or retained intent.
export function createAvatarContextAdapter({client,getTransport,getGeneration,onIdentityFailure=()=>{},onUnavailable=()=>{}}){
 let confirmed=null,verified=null;
 const fields=['authUserId','profileId','pairId','partnerProfileId','sessionGeneration'];
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
 const invalid=()=>Object.assign(new Error('AVATAR_CONTEXT_INVALID'),{code:'AVATAR_CONTEXT_INVALID'});
 function isCurrentContext(c){return !!verified&&!!confirmed&&getGeneration()===c.sessionGeneration&&fields.every(k=>c[k]===confirmed[k]&&c[k]===verified[k]);}
 async function getVerifiedContext(){const generation=getGeneration(),transport=getTransport(),base=transport?.context;
  const guard=()=>{if(generation!==getGeneration()||getTransport()!==transport)throw invalid();const now=transport?.context;if(!now)throw Object.assign(new Error('NETWORK'),{code:'NETWORK'});if(!base||now.user.id!==base.user.id||now.me.id!==base.me.id||now.pairId!==base.pairId)throw invalid();};
    const read=async operation=>{let r;try{r=await operation;}catch(e){guard();if(e instanceof TypeError&&![401,403].includes(Number(e.status)))throw Object.assign(new Error('NETWORK'),{code:'NETWORK'});throw e;}guard();
    // PostgREST keeps HTTP status on the OUTER envelope, not necessarily on error.
    // Preserve explicit denial before any contradictory NETWORK code can classify it.
    if([401,403].includes(Number(r?.status)))throw Object.assign(new Error('AVATAR_CONTEXT_INVALID'),r.error??{code:'AVATAR_CONTEXT_INVALID'},{status:Number(r.status)});
    if(r?.error){if(r.status===0&&![401,403].includes(Number(r.error.status)))throw Object.assign(new Error('NETWORK'),{code:'NETWORK',status:0});throw r.error;}return r?.data;};
  try{guard();const user=(await read(client.auth.getUser()))?.user;guard();if(!user||!uuid(user.id)||user.id!==base.user.id)throw invalid();
   const me=await read(client.from('users_profiles').select('id,auth_user_id').eq('auth_user_id',user.id).maybeSingle());guard();if(!me||!uuid(me.id)||me.id!==base.me.id||me.auth_user_id!==user.id)throw invalid();
   const membership=await read(client.from('pair_members').select('pair_id,profile_id').eq('profile_id',me.id).maybeSingle());guard();if(!membership||membership.profile_id!==me.id||!uuid(membership.pair_id)||membership.pair_id!==base.pairId)throw invalid();
   const members=await read(client.from('pair_members').select('pair_id,profile_id').eq('pair_id',membership.pair_id));guard();
   if(!Array.isArray(members)||members.length!==2||members.some(m=>m.pair_id!==membership.pair_id||!uuid(m.profile_id))||members.filter(m=>m.profile_id===me.id).length!==1)throw invalid();
   const partner=members.find(m=>m.profile_id!==me.id);if(!partner)throw invalid();
   const next=Object.freeze({authUserId:user.id,profileId:me.id,pairId:membership.pair_id,partnerProfileId:partner.profile_id,sessionGeneration:generation});
   if(confirmed&&fields.some(k=>confirmed[k]!==next[k]))throw invalid();confirmed=next;verified=next;return next;
  }catch(e){if(generation!==getGeneration()||getTransport()!==transport)throw invalid();verified=null;const denied=[401,403].includes(Number(e?.status));const network=!denied&&(['NETWORK','FETCH_ERROR'].includes(e?.code)||e?.name==='AuthRetryableFetchError'&&[0,502,503,504].includes(Number(e.status)));
   if(network){onUnavailable();throw Object.assign(new Error('AVATAR_REQUEST_FAILED'),{code:'NETWORK'});}confirmed=null;onIdentityFailure(e);throw e;
  }
 }
 return {getVerifiedContext,isCurrentContext,markUnavailable(){verified=null;},reset(){verified=confirmed=null;}};
}
export function createAuthAdapter(client,aliases={}){const mapping=validateAliases(aliases);return {
 capabilities:Object.freeze({emailPassword:true,usernamePassword:Object.keys(mapping).length>0,publicSignup:false}),
 resolve:input=>resolveLogin(input,mapping),
 async signIn(input,password){const {email}=resolveLogin(input,mapping);return client.auth.signInWithPassword({email,password});},
 async requestRecovery(input,redirectTo){const r=resolveLogin(input,mapping);if(r.technical)throw uiError('auth.assistedRecovery');return client.auth.resetPasswordForEmail(r.email,{redirectTo});},
 async setPassword(password){return client.auth.updateUser({password});},
 async verify(){return client.auth.getUser();},
 async signOut(){return client.auth.signOut({scope:'local'});}
};}
