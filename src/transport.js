import {t,copy,uiError,errorText,locale} from './experience.js';
import { createClient } from '@supabase/supabase-js';
import {validateAliases} from './auth.js';
import {losslessFetch,casVersion} from './lossless-json.js';
import {validThoughtIntent,validThoughtReceipt} from './profile-state.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BUCKET='connection-private';
export const MIME=new Set(['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','video/mp4','video/webm','video/quicktime']);
export function validateConfig(c){
  if(!c||Object.keys(c).some(k=>!['supabaseUrl','publishableKey','loginAliases'].includes(k)))throw uiError('errors.configFields');
  let u;try{u=new URL(c.supabaseUrl)}catch{throw uiError('errors.projectURL');}
  if(u.protocol!=='https:'||!/^([a-z0-9]{20})\.supabase\.co$/.test(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||/placeholder|example|your|replace|project/i.test(u.hostname))throw uiError('errors.projectURL');
  if(typeof c.publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(c.publishableKey)||/placeholder|replace|example|your/i.test(c.publishableKey))throw uiError('errors.publishableKey');
  return {supabaseUrl:u.origin,publishableKey:c.publishableKey,loginAliases:validateAliases(c.loginAliases)};
}
export async function loadClient(){
  let r;try{r=await fetch(new URL('./public-config.json',document.baseURI),{cache:'no-store',credentials:'same-origin'});}catch{throw uiError('errors.configRead');}
  if(!r.ok)throw uiError('sync.configMissing');
  let c;try{c=validateConfig(await r.json())}catch(e){throw e}
  const client=createClient(c.supabaseUrl,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'entre-nosotros-auth-'+new URL(c.supabaseUrl).hostname},global:{fetch:losslessFetch(c.supabaseUrl),headers:{'X-Client-Info':'entre-nosotros-shared-v2'}}});
  Object.defineProperty(client,'connectionPublicConfig',{value:c});return client;
}
export function checked(r){if(r.error)throw r.error;return r.data;}
export function row(r){const d=checked(r),v=Array.isArray(d)?(d.length===1?d[0]:null):d;if(!v||typeof v!=='object')throw uiError('errors.serverShape');return v;}
function unconfirmedThought(){const e=uiError('b1.unconfirmed');e.code='INVALID_THOUGHT_RECEIPT';return e;}
// Only successful thought payloads enter this boundary. RPC/Auth errors and
// generation guards have already run; never catch or demote those failures.
function thoughtRow(data){const v=Array.isArray(data)?(data.length===1?data[0]:null):data;if(!v||typeof v!=='object'||Array.isArray(v))throw unconfirmedThought();return v;}
export async function pages(make){const out=[];for(let start=0;;start+=200){const data=checked(await make().range(start,start+199));if(!Array.isArray(data))throw uiError('errors.invalidRead');out.push(...data);if(data.length<200)return out;}}
export const versionEqual=(a,b)=>String(typeof a==='bigint'?a:casVersion(a))===String(typeof b==='bigint'?b:casVersion(b));
export function contentData(x){return Object.fromEntries(['item_type','visibility','body','title','url','question_id','entry_kind','mood'].map(k=>[k,x[k]??({url:null,question_id:null,visibility:'private',entry_kind:'note',mood:'none',body:'',title:''}[k])]));}
export function sameContent(a,b){return JSON.stringify(contentData(a))===JSON.stringify(contentData(b));}
export function safeURL(s){try{if(typeof s!=='string'||s.length>2048||/\s/.test(s))return null;const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&/^[a-z0-9.-]+$/i.test(u.hostname)?u.href:null}catch{return null}}
export function ensureFile(f){const mime=f.type.split(';')[0].toLowerCase();if(!MIME.has(mime)||f.size===0||f.size>26214400)throw uiError('errors.invalidFile');return mime;}
export class Transport{
  constructor(client){this.client=client;this.context=null;this.generation=0;this.channel=null;this.onStatus=()=>{};this.onSnapshot=()=>{};this.onFailure=()=>{};this.inflight=null;this.again=false;this.timer=null;this.poll=null;this.uploads=new Map();}
  async identify(){const generation=this.generation;const u=checked(await this.client.auth.getUser())?.user;if(!u)throw uiError('auth.noSession');const me=checked(await this.client.from('users_profiles').select('id,auth_user_id,display_name,created_at').eq('auth_user_id',u.id).maybeSingle());if(!me)throw uiError('auth.notEnrolled');const member=checked(await this.client.from('pair_members').select('pair_id,slot,profile_id').eq('profile_id',me.id).maybeSingle());if(!member)throw uiError('auth.notEnrolled');if(generation!==this.generation)throw uiError('sync.changedSession');this.context={user:u,me,pairId:member.pair_id};return this.context;}
  guard(g){if(g!==this.generation||!this.context)throw uiError('sync.changedSession');}
  async rpc(name,args,voidResult=false){if(!this.context)throw uiError('sync.notReady');if('p_expected_version'in args)args={...args,p_expected_version:casVersion(args.p_expected_version)};const g=this.generation;const r=await this.client.rpc(name,args);this.guard(g);return voidResult?checked(r):row(r);}
  async revision(){const x=row(await this.client.from('sync_signals').select('profile_id,pair_id,revision,updated_at').eq('profile_id',this.context.me.id).single());return String(casVersion(x.revision));}
  async snapshot(){const {pairId,me}=this.context;const all=(table,filter=q=>q)=>pages(()=>filter(this.client.from(table).select('*')).order('created_at').order('id'));
    const [profiles,members,questions,content,moods,flowers,rounds,media,details,preferences,thoughts,avatars]=await Promise.all([
      pages(()=>this.client.from('users_profiles').select('id,auth_user_id,display_name,created_at').order('id')),
      pages(()=>this.client.from('pair_members').select('pair_id,slot,profile_id').eq('pair_id',pairId).order('slot')),
      pages(()=>this.client.from('question_bank').select('id,theme,prompt').order('id')),
      all('content_items',q=>q.eq('pair_id',pairId)),
      pages(()=>this.client.from('moods').select('*').eq('pair_id',pairId).order('profile_id')),
      all('flowers',q=>q.eq('pair_id',pairId)),all('question_rounds',q=>q.eq('pair_id',pairId)),all('media_files',q=>q.eq('pair_id',pairId)),
      pages(()=>this.client.from('profile_details').select('*').eq('pair_id',pairId).order('profile_id')),
      this.client.from('profile_preferences').select('*').eq('profile_id',me.id).maybeSingle().then(checked),
      pages(()=>this.client.from('thought_events').select('*').eq('recipient_id',me.id).order('created_at',{ascending:false}).order('id')),all('profile_avatars',q=>q.eq('pair_id',pairId))]);
    const answers=[];for(const r of rounds)answers.push(...await pages(()=>this.client.from('round_answers').select('round_id,owner_id,body,submitted_at').eq('round_id',r.id).order('owner_id')));
    const currentMe=profiles.find(p=>p.id===me.id);if(!currentMe||currentMe.auth_user_id!==me.auth_user_id)throw uiError('sync.changedSession');
    return {profiles,members,questions,content,moods,flowers,rounds,media,answers,details,preferences,thoughts,avatars,me:currentMe,pairId};
  }
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh().catch(this.onFailure),120);}
  refresh(){if(this.inflight){this.again=true;return this.inflight;}const g=this.generation;this.inflight=(async()=>{try{let attempts=0;do{this.again=false;this.guard(g);const r0=await this.revision();const data=await this.snapshot();const r1=await this.revision();this.guard(g);if(r0!==r1||this.again){if(++attempts>=6)throw uiError('errors.changedDuringRead');continue;}this.context.members=data.members;this.onSnapshot({...data,revision:r1});this.onStatus(()=>t('sync.revision',{revision:r1}));return;}while(true)}finally{if(g===this.generation){this.inflight=null;if(this.again)this.schedule();}}})();return this.inflight;}
  async connect(){await this.disconnect();const g=this.generation;await this.identify();this.guard(g);this.channel=this.client.channel('connection-sync-'+this.context.me.id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'sync_signals',filter:'profile_id=eq.'+this.context.me.id},()=>this.schedule()).subscribe(status=>{if(g!==this.generation)return;if(status==='SUBSCRIBED'){this.onStatus(()=>t('sync.transportConnected'));this.schedule();}else this.onStatus(()=>t('sync.stale'));});this.poll=setInterval(()=>{if(!document.hidden)this.schedule();},30000);await this.refresh();}
  async disconnect(clear=true){this.generation++;clearTimeout(this.timer);clearInterval(this.poll);this.timer=this.poll=null;this.again=false;this.inflight=null;const ch=this.channel;this.channel=null;if(ch)await this.client.removeChannel(ch);if(clear)this.context=null;}
  async verifyActor(){const g=this.generation,ctx=this.context;if(!ctx)throw uiError('sync.notReady');const user=checked(await this.client.auth.getUser())?.user;this.guard(g);if(!user||user.id!==ctx.me.auth_user_id)throw uiError('sync.changedSession');const me=checked(await this.client.from('users_profiles').select('id,auth_user_id,display_name,created_at').eq('auth_user_id',user.id).maybeSingle());this.guard(g);if(!me||me.id!==ctx.me.id||me.auth_user_id!==user.id)throw uiError('sync.changedSession');return {...ctx,me};}
  async readOwnAccount(){const g=this.generation,{me,pairId}=this.context;
    // R0/R1 protects the combined name/details/preferences authoritative read.
    for(let attempt=0;attempt<6;attempt++){const r0=await this.revision();const [profile,details,preferences]=await Promise.all([
      this.client.from('users_profiles').select('id,auth_user_id,display_name,created_at').eq('id',me.id).single().then(row),
      this.client.from('profile_details').select('*').eq('profile_id',me.id).maybeSingle().then(checked),
      this.client.from('profile_preferences').select('*').eq('profile_id',me.id).maybeSingle().then(checked)]);
      const r1=await this.revision();this.guard(g);if(r0!==r1)continue;
      if(profile.id!==me.id||profile.auth_user_id!==me.auth_user_id||[details,preferences].some(x=>x&&(x.profile_id!==me.id||x.pair_id!==pairId)))throw uiError('errors.serverShape');
      return {profile,details,preferences};}throw uiError('errors.changedDuringRead');
  }
  async saveOwnDomain(domain,expected,data){if(!['profile','preferences'].includes(domain))throw uiError('errors.arguments');expected=casVersion(expected);const generation=this.generation;await this.verifyActor();this.guard(generation);let receipt,error;
    try{receipt=domain==='profile'?await this.rpc('save_my_profile',{p_expected_version:expected,p_display_name:data.display_name,p_bio:data.bio,p_mood_animal:data.mood_animal}):await this.rpc('save_my_preferences',{p_expected_version:expected,p_theme:data.theme,p_locale:data.locale,p_partner_nickname:data.partner_nickname});}
    catch(e){error=e;if(e.code||e.uiKey){this.schedule();throw e;}}
    const own=await this.readOwnAccount(),stored=domain==='profile'?own.details:own.preferences;
    const matches=stored&&versionEqual(stored.version,BigInt(expected)+1n)&&(!receipt||versionEqual(stored.version,receipt.version))&&Object.entries(data).every(([k,v])=>(k==='display_name'?own.profile[k]:stored[k])===v);
    if(!matches)throw error??uiError('b1.unconfirmed');return own;
  }
  async sendThought(intent){if(!validThoughtIntent(intent))throw uiError('errors.invalidValue');const generation=this.generation;const context=await this.verifyActor();this.guard(generation);
    const receipt=thoughtRow(await this.rpc('send_thought',{p_id:intent.idempotencyKey},true));
    // A malformed send acknowledgement is not an Auth failure: preserve the
    // durable original operation for explicit same-UUID retry, not global logout.
    if(!validThoughtReceipt(intent,receipt,context))throw unconfirmedThought();
    return receipt;
  }
  async markThoughtRead(event){const generation=this.generation;const {me}=await this.verifyActor();this.guard(generation);if(event.recipient_id!==me.id)throw uiError('errors.forbidden');const receipt=thoughtRow(await this.rpc('mark_thought_read',{p_id:event.id},true));if(receipt.id!==event.id||receipt.recipient_id!==me.id||typeof receipt.read_at!=='string'||!Number.isFinite(Date.parse(receipt.read_at)))throw unconfirmedThought();return receipt;}
  async saveContent(id,expected,data){try{return await this.rpc('save_content',{p_id:id,p_expected_version:expected,p_data:contentData(data)});}catch(e){if(e.code){this.schedule();throw e;}const g=this.generation;const found=checked(await this.client.from('content_items').select('*').eq('id',id).maybeSingle());this.guard(g);if(found&&sameContent(found,data)&&String(found.version)===String(BigInt(expected)+1n))return found;throw e;}}
  async uploadAttachment(parentId,attachment){const {blob,name,id}=attachment;const mime=ensureFile(blob);if(this.uploads.has(id))return this.uploads.get(id);const task=(async()=>{let r=await this.rpc('reserve_media',{p_id:id,p_content_id:parentId,p_filename:name.slice(0,200),p_mime_type:mime});if(r.status==='ready')return r;if(r.status!=='pending')throw uiError('media.deleting');const g=this.generation;const uploaded=await this.client.storage.from(BUCKET).upload(r.object_key,blob,{upsert:false,contentType:mime,cacheControl:'0'});this.guard(g);if(uploaded.error){try{return await this.rpc('finalize_media',{p_id:id});}catch{throw uploaded.error;}}return this.rpc('finalize_media',{p_id:id});})();this.uploads.set(id,task);try{return await task}finally{this.uploads.delete(id);}}
  async removeMedia(m){if(this.uploads.has(m.id))await this.uploads.get(m.id).catch(()=>{});const r=await this.rpc('mark_media_delete',{p_id:m.id});const g=this.generation;checked(await this.client.storage.from(BUCKET).remove([r.object_key]));this.guard(g);await this.rpc('finish_media_delete',{p_id:m.id},true);}
  async download(m){const g=this.generation;const blob=checked(await this.client.storage.from(BUCKET).download(m.object_key));this.guard(g);if(!(blob instanceof Blob))throw uiError('errors.invalidDownload');return blob;}
}
