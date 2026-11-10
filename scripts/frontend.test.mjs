import test from 'node:test';
import {t,uiError} from '../src/experience.js';
const copy=(node,value)=>{while(typeof value==='function')value=value();node.textContent=value;};
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateConfig,pages,row,checked,ensureFile,safeURL,sameContent,Transport} from '../src/transport.js';
import {OperationIds} from '../src/operations.js';
import {createAuthAdapter,resolveLogin,validateAliases} from '../src/auth.js';
// Deliberately labelled fake harness: no network, live Auth, Storage or RLS claims.
const FAKE_CONFIG={supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_'+ 'A'.repeat(30)};
test('config accepts publishable syntax and rejects absent/placeholders/admin/arbitrary origin',()=>{assert.equal(validateConfig(FAKE_CONFIG).supabaseUrl,FAKE_CONFIG.supabaseUrl);for(const c of [null,{}, {supabaseUrl:'REPLACE',publishableKey:'REPLACE'},{...FAKE_CONFIG,publishableKey:'sb_secret_not_allowed'},{...FAKE_CONFIG,supabaseUrl:'https://example.org'},{...FAKE_CONFIG,extra:'not allowed'},{...FAKE_CONFIG,supabaseUrl:FAKE_CONFIG.supabaseUrl+'/bad'}])assert.throws(()=>validateConfig(c));});
test('paginated fake transport reads all 451 rows with stable ranges',async()=>{const rows=Array.from({length:451},(_,id)=>({id})),ranges=[];const got=await pages(()=>({range:async(a,b)=>{ranges.push([a,b]);return{data:rows.slice(a,b+1),error:null}}}));assert.equal(got.length,451);assert.deepEqual(ranges,[[0,199],[200,399],[400,599]]);});
test('every response error and invalid RPC shape rejects',()=>{assert.throws(()=>checked({error:{message:'denied'}}));assert.throws(()=>row({data:[],error:null}));assert.throws(()=>row({data:[{},{}],error:null}));assert.deepEqual(row({data:[{id:'a'}],error:null}),{id:'a'});});
test('MIME normalization and file limits, safe external links',()=>{assert.equal(ensureFile(new Blob(['sound'],{type:'audio/webm;codecs=opus'})),'audio/webm');for(const type of ['text/html','image/svg+xml','application/pdf'])assert.throws(()=>ensureFile(new Blob(['x'],{type})));assert.throws(()=>ensureFile(new Blob([],{type:'image/jpeg'})));for(const u of ['javascript:alert(1)','https://name:pass@example.com','https://example.com/a b'])assert.equal(safeURL(u),null);assert.equal(safeURL('https://example.com/song'),'https://example.com/song');});
test('content reconciliation compares full allowed replacement only',()=>{const a={item_type:'journal',body:'a',visibility:'private'};assert.ok(sameContent(a,{...a,id:'ignored',version:5}));assert.ok(!sameContent(a,{...a,visibility:'shared'}));});
test('stable operation IDs survive adapter recreation without saving body/credentials',()=>{const m=new Map(),storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),get length(){return m.size},key:i=>[...m.keys()][i]};const a=new OperationIds('fake-real-auth-id',storage),id=a.id('journal');assert.equal(new OperationIds('fake-real-auth-id',storage).id('journal'),id);assert.notEqual(new OperationIds('other-user',storage).id('journal'),id);a.clear();assert.equal(m.size,1);});
test('alias resolver uses configured technical ID, direct real email, unknown fails closed',async()=>{const mapping=validateAliases({'test-user':'fixture@access.invalid'});assert.deepEqual(resolveLogin('TEST-USER',mapping),{email:'fixture@access.invalid',technical:true,source:'alias'});assert.equal(resolveLogin('owner@example.org',mapping).technical,false);assert.throws(()=>resolveLogin('missing',mapping));assert.throws(()=>validateAliases({'test-user':'personal@example.org'}));assert.throws(()=>validateAliases({'bad alias':'fixture@access.invalid'}));const opaque=Symbol('test-only opaque private input');let received;const a=createAuthAdapter({auth:{signInWithPassword:async x=>{received=x;return {data:{},error:null}}}},mapping);await a.signIn('test-user',opaque);assert.equal(received.email,'fixture@access.invalid');assert.equal(received.password,opaque);await assert.rejects(a.requestRecovery('test-user','https://example.org'),/auth.assistedRecovery/);assert.equal(a.capabilities.publicSignup,false);});
test('fake media harness enforces reserve -> upload no upsert -> finalize',async()=>{const calls=[];const api=new Transport({rpc:async(name,args)=>{calls.push([name,args]);return{data:{id:args.p_id,object_key:'pair/owner/media',status:name==='finalize_media'?'ready':'pending'},error:null}},storage:{from:bucket=>({upload:async(key,blob,options)=>{calls.push(['upload',{bucket,key,options}]);return{data:{},error:null}}})}});api.context={me:{id:'owner'}};const r=await api.uploadAttachment('parent',{id:'media',name:'sound.webm',blob:new Blob(['x'],{type:'audio/webm;codecs=opus'})});assert.equal(r.status,'ready');assert.deepEqual(calls.map(x=>x[0]),['reserve_media','upload','finalize_media']);assert.equal(calls[0][1].p_mime_type,'audio/webm');assert.equal(calls[1][1].options.upsert,false);assert.equal(calls[1][1].options.cacheControl,'0');});
test('fake delete lifecycle denies reads before physical deletion and finish',async()=>{const calls=[];const api=new Transport({rpc:async(n,a)=>{calls.push(n);return{data:n==='finish_media_delete'?null:{id:a.p_id,object_key:'key',status:'deleting'},error:null}},storage:{from:()=>({remove:async keys=>{calls.push('remove');return{data:keys,error:null}}})}});api.context={};await api.removeMedia({id:'media'});assert.deepEqual(calls,['mark_media_delete','remove','finish_media_delete']);});
test('fake revision R0/R1 mismatch retries full snapshot and only publishes consistent data',async()=>{const api=new Transport({});api.context={};const revisions=['0','1','1','1'];let reads=0,published=[];api.revision=async()=>revisions.shift();api.snapshot=async()=>({batch:++reads});api.onSnapshot=x=>published.push(x);await api.refresh();assert.equal(reads,2);assert.equal(published.length,1);assert.equal(published[0].batch,2);assert.equal(published[0].revision,'1');});
test('all app/transport RPC calls match authoritative contract and exact arguments',async()=>{const contract=(await Promise.all(['CONTRACT.md','PROFILE_CONTRACT.md'].map(f=>readFile(new URL('../backend/'+f,import.meta.url),'utf8')))).join('\n');const sources=(await Promise.all(['app.js','transport.js','avatar.js'].map(f=>readFile(new URL('../src/'+f,import.meta.url),'utf8')))).join('\n');const expected={save_content:['p_id','p_expected_version','p_data'],delete_content:['p_id','p_expected_version'],save_mood:['p_expected_version','p_mood','p_note','p_visibility'],plant_flower:['p_id','p_flower_type'],change_flower:['p_id','p_expected_version','p_action'],start_round:['p_id','p_question_id'],submit_round_answer:['p_round_id','p_body'],reserve_media:['p_id','p_content_id','p_filename','p_mime_type'],finalize_media:['p_id'],mark_media_delete:['p_id'],finish_media_delete:['p_id'],save_my_profile:['p_expected_version','p_display_name','p_bio','p_mood_animal'],save_my_preferences:['p_expected_version','p_theme','p_locale','p_partner_nickname'],send_thought:['p_id'],mark_thought_read:['p_id'],reserve_avatar:['p_id','p_mime_type','p_expected_active_id'],finalize_avatar:['p_id'],mark_avatar_delete:['p_id'],finish_avatar_delete:['p_id']};const found=new Set();for(const match of sources.matchAll(/\.rpc\('([a-z_]+)',\{([^}]+)\}/g)){const [,name,args]=match;assert.ok(contract.includes('`'+name+'('),name);assert.ok(expected[name],name);assert.deepEqual([...args.matchAll(/\b(p_[a-z_]+):/g)].map(m=>m[1]),expected[name],name);found.add(name);}for(const m of sources.matchAll(/rpc\(ticket, '(reserve_avatar|finalize_avatar|mark_avatar_delete|finish_avatar_delete)'/g)){assert.ok(contract.includes('`'+m[1]+'('));found.add(m[1]);}assert.match(sources,/p_id: op.id, p_mime_type: op.mimeType, p_expected_active_id: op.expectedActiveId/);assert.match(sources,/args = \{p_id: id\}/);assert.deepEqual([...found].sort(),Object.keys(expected).sort());});
test('source contains no signup/admin/signed-URL/import or old profile identity surface',async()=>{const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8'),html=await readFile(new URL('../src/template.html',import.meta.url),'utf8');assert.ok(!/auth\.admin|\.signUp\(|createSignedUrl|getPublicUrl|indexedDB|localStorage/.test(app));assert.ok(!/id="profile"|id="importData"/.test(html));assert.ok(html.includes('data-i18n="music.credits"'));});

// Execute actual app task/handlers with explicit offline transport/DOM mocks.
const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const section=(start,end)=>appSource.slice(appSource.indexOf(start),appSource.indexOf(end,appSource.indexOf(start)));
function handlerHarness(overrides={}){
 const nodes={musicFiles:{files:[],value:'',disabled:false},trackVisibility:{value:'private'},dedicationName:{value:'submitted'},dedicationUrl:{value:'https://example.org/first'},dedicationVisibility:{value:'private'},dedicationForm:{resetCount:0,querySelector(){return {disabled:false}},reset(){this.resetCount++}}};
 const messages=[],ledger=new Map(),ops={id:k=>{if(!ledger.has(k))ledger.set(k,crypto.randomUUID());return ledger.get(k)},done:k=>ledger.delete(k)};
 const api={context:{me:{id:'owner'},user:{id:'auth-owner'},pairId:'pair'},refresh:async()=>{},schedule(){}};
 const env={t,copy,uiError,resetExperience(){},$:id=>nodes[id],epoch:0,activeMutations:0,api,client:{},state:{profile:'owner'},snapshot:{},operations:ops,checkReady:()=>true,showError(){},notify:s=>{while(typeof s==='function')s=s();messages.push(s)},failure:e=>e.message,renderPending(){},action:fn=>fn,ensureFiles(){},ensureFile:()=> 'audio/mpeg',safeURL,fullData:x=>x,checked,sameContent,confirm:()=>true,...overrides};
 env.$=id=>nodes[id]??(nodes[id]={hidden:false});
 runInNewContext(section('function fullData(', 'async function saveComposer(')+section('let trackBatch=', 'function renderDedications(')+'\nglobalThis.getBatch=()=>trackBatch;',env);
 return {env,nodes,messages,ledger,api};
}
test('FR-01 readiness failure rejects task instead of resolving a successful no-op',async()=>{
 const env={uiError,checkReady:()=>false,epoch:0,activeMutations:0,api:{},$:()=>({}),showError(){}};
 runInNewContext(section('async function task(', 'function action(')+';globalThis.run=task;',env);
 let called=false;await assert.rejects(env.run(async()=>{called=true}));assert.equal(called,false);
});
test('FR-02 offline playlist retains original files and never announces server success',async()=>{
 const h=handlerHarness({checkReady:()=>false}),file={name:'fixed.mp3',size:5,lastModified:12345};
 runInNewContext(section('async function task(', 'function action('),h.env);
 h.nodes.musicFiles.files=[file];await assert.rejects(h.nodes.musicFiles.onchange());
 assert.equal(h.env.getBatch()[0].file,file);assert.ok(!h.messages.some(x=>x===t('music.saved')));
});
test('FR-03 completing submitted dedication preserves all newer editable fields',async()=>{
 let release;const pending=new Promise(r=>release=r);const h=handlerHarness({task:fn=>fn()});
 h.api.saveContent=async()=>{await pending;return{version:1}};
 const saving=h.nodes.dedicationForm.onsubmit({preventDefault(){},currentTarget:h.nodes.dedicationForm});
 h.nodes.dedicationName.value='new unsent';h.nodes.dedicationUrl.value='https://example.org/second';h.nodes.dedicationVisibility.value='shared';
 release();await saving;assert.equal(h.nodes.dedicationForm.resetCount,0);assert.equal(h.nodes.dedicationName.value,'new unsent');
});
test('FR-04 same fixed file retries committed parent without another version-zero save',async()=>{
 let row=null,failUpload=true,saves=0,uploads=0;
 const h=handlerHarness({task:async fn=>fn()});
 h.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:row,error:null})});
 h.api.saveContent=async(id,version,data)=>{saves++;if(row)throw Object.assign(Error('40001'),{code:'40001'});return row={id,owner_id:'owner',pair_id:'pair',version:1,...data}};
 h.api.uploadAttachment=async()=>{uploads++;if(failUpload)throw Error('temporary reserve failure');return{status:'ready'}};
 const file={name:'fixed.mp3',size:5,lastModified:12345};h.nodes.musicFiles.files=[file];
 await assert.rejects(h.nodes.musicFiles.onchange(),/temporary/);failUpload=false;
 await h.nodes.musicFiles.onchange();assert.equal(saves,1);assert.equal(uploads,2);assert.equal(h.env.getBatch(),null);
 assert.ok(h.messages.some(x=>x===t('music.saved')));
});

test('FR-01 blind draft clears only after refreshed own exact answer is confirmed',async()=>{
 for(const confirmed of [false,true]){
  const body={value:'keep this',disabled:false},submit={disabled:false},form={querySelector:()=>submit};
  const env={t,uiError,epoch:0,state:{profile:'owner'},snapshot:{rounds:[{id:'round',revealed_at:null}],answers:confirmed?[{round_id:'round',owner_id:'owner',body:'keep this'}]:[]},$:id=>id==='roundForm'?form:body,task:async()=>{},api:{rpc:async()=>{}},notify(){},failure:e=>e.message};
  runInNewContext(section("$('roundForm').onsubmit=",'function renderRounds('),env);
  await form.onsubmit({preventDefault(){}});assert.equal(body.value,confirmed?'':'keep this');assert.equal(body.disabled,false);
 }
});
test('FR-04 reconciliation rejects changed owner/pair/payload/version or deleted parent without mutation',async()=>{
 for(const change of [{owner_id:'other'},{pair_id:'other'},{title:'unexpected'},{version:2},{deleted_at:'deleted'}]){
  const h=handlerHarness({task:fn=>fn()});let mutations=0;
  h.nodes.musicFiles.files=[{name:'fixed.mp3',size:5,lastModified:12345}];
  h.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>{const t=h.env.getBatch()[0];return{data:{id:t.id,owner_id:'owner',pair_id:'pair',version:1,...t.data,...change},error:null}}});
  h.api.saveContent=h.api.uploadAttachment=async()=>{mutations++};
  await assert.rejects(h.nodes.musicFiles.onchange(),/ui.trackMismatch/);assert.equal(mutations,0);assert.equal(h.env.getBatch().length,1);assert.ok(!h.messages.some(x=>x===t('music.saved')));
 }
});
test('FR-04 ledger recovery after memory loss reads exact matching parent and reuses both UUIDs',async()=>{
 const a=handlerHarness({task:fn=>fn()}),file={name:'fixed.mp3',size:5,lastModified:12345};let row,mediaId;
 a.nodes.musicFiles.files=[file];a.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})});
 a.api.saveContent=async(id,version,data)=>row={id,owner_id:'owner',pair_id:'pair',version:1,...data};
 a.api.uploadAttachment=async(parent,attachment)=>{mediaId=attachment.id;throw Error('reservation interrupted')};
 await assert.rejects(a.nodes.musicFiles.onchange());
 const b=handlerHarness({task:fn=>fn(),operations:a.env.operations});let saves=0,upload;
 b.nodes.musicFiles.files=[file];b.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:row,error:null})});
 b.api.saveContent=async()=>{saves++};b.api.uploadAttachment=async(parent,attachment)=>{upload={parent,id:attachment.id};return{status:'ready'}};
 await b.nodes.musicFiles.onchange();assert.equal(saves,0);assert.deepEqual(upload,{parent:row.id,id:mediaId});assert.equal(b.env.getBatch(),null);
});
test('FR-02 upload no-op cannot be reported as finalized server success',async()=>{
 const h=handlerHarness({task:fn=>fn()});h.nodes.musicFiles.files=[{name:'fixed.mp3',size:5,lastModified:12345}];
 h.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})});
 h.api.saveContent=async(id,version,data)=>({id,owner_id:'owner',pair_id:'pair',version:1,...data});h.api.uploadAttachment=async()=>{};
 await assert.rejects(h.nodes.musicFiles.onchange(),/ui.audioUnconfirmed/);assert.equal(h.env.getBatch().length,1);assert.ok(!h.messages.some(x=>x===t('music.saved')));
});
test('FR-04 session change while exact parent read is pending prevents upload and ledger completion',async()=>{
 const h=handlerHarness({task:fn=>fn()});h.nodes.musicFiles.files=[{name:'fixed.mp3',size:5,lastModified:12345}];let release,mutations=0;
 const pending=new Promise(r=>release=r);h.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>{await pending;return{data:null,error:null}}});
 h.api.saveContent=h.api.uploadAttachment=async()=>{mutations++};const saving=h.nodes.musicFiles.onchange();h.env.epoch++;release();
 await assert.rejects(saving,/sync.changedSession/);assert.equal(mutations,0);assert.equal(h.ledger.size,2);assert.ok(!h.messages.some(x=>x===t('music.saved')));
});

test('FR-02/04 logout cleanup drops retained Files and operation UUIDs, then rejects stale continuation',async()=>{
 const h=handlerHarness({task:fn=>fn()});h.nodes.musicFiles.files=[{name:'fixed.mp3',size:5,lastModified:12345}];let release,mutations=0,cleared=false;
 const pending=new Promise(r=>release=r);h.env.client.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>{await pending;return{data:null,error:null}}});
 h.api.saveContent=h.api.uploadAttachment=async()=>{mutations++};h.env.operations.clear=()=>{cleared=true;h.ledger.clear()};
 const saving=h.nodes.musicFiles.onchange();
 for(const id of ['roundForm','roundBody','dedicationForm','musicFiles','passwordForm'])h.env.$(id);
 for(const n of Object.values(h.nodes)){n.replaceChildren??=()=>{};n.reset??=()=>{};n.querySelector??=()=>({disabled:false});}
 const original$=h.env.$;h.env.$=id=>{const n=original$(id);n.querySelector??=()=>({remove(){},disabled:false});n.replaceChildren??=()=>{};n.reset??=()=>{};n.querySelector??=()=>({disabled:false});return n};
 Object.assign(h.env,{profileUI:{clear(){}},avatarUI:null,revokeViews(){},composers:{},moodForm:{reset(){}},moodVersion:0,moodDirty:false,plantId:null,roundId:null});
 runInNewContext(section('function clearPrivate(', 'async function activate('),h.env);h.env.clearPrivate();release();
 await assert.rejects(saving,/sync.changedSession/);assert.equal(cleared,true);assert.equal(h.ledger.size,0);assert.equal(h.env.getBatch(),null);assert.equal(h.nodes.musicFiles.value,'');assert.equal(mutations,0);
});
