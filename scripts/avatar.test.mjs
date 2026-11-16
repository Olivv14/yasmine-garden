import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {createAvatarController, validateAvatarImage, AvatarError, AVATAR_MAX_BYTES, AVATAR_BUCKET} from '../src/avatar.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = () => ({authUserId:id(1), profileId:id(2), pairId:id(3), partnerProfileId:id(4), sessionGeneration:1});
const pngBytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const file = () => new File([pngBytes], 'private.png', {type:'image/png'});
const ok = data => ({data: structuredClone(data), error:null});
const err = code => ({data:null, error:{code}});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve=r}); return {promise,resolve};};
const flush = () => new Promise(resolve => setImmediate(resolve));
async function until(fn) {for(let i=0;i<100;i++){if(fn())return;await flush();}assert.fail('condition not reached');}
const rejects = (promise, code, serverCode) => assert.rejects(promise, e => e instanceof AvatarError && e.code===code && (serverCode===undefined || e.serverCode===serverCode));

// Deliberate SDK-shape fake, NOT a cloud/SQL emulator claim. Immutable operation identity,
// exact args, strict active CAS + permanently invalidated pending publication are enforced.
function fixture(options={}) {
  const rows = new Map(), objects = new Map(), retired = new Set(), calls = [];
  let current = context(), counter=100;
  const hooks = {};
  const own = row => row?.owner_id===current?.profileId && row?.pair_id===current?.pairId;
  const active = owner => [...rows.values()].find(r=>r.owner_id===owner && r.active && r.status==='ready');
  function makeRow(n, overrides={}) {
    const c=current??context();
    return {id:id(n), pair_id:c.pairId, owner_id:c.profileId, object_key:`${c.pairId}/${c.profileId}/${id(n)}`,
      mime_type:'image/png', status:'pending', active:false, expected_active_id:null,
      reserved_bytes:AVATAR_MAX_BYTES, size_bytes:null, publication_invalidated:false,
      created_at:'2026-11-10T00:00:00Z', updated_at:'2026-11-10T00:00:00Z', ...overrides};
  }
  async function invoke(name,args,actual) {
    calls.push({name,args});
    if(hooks[name]) return hooks[name](args,actual);
    return actual();
  }
  const client = {
    async rpc(name,args) {
      return invoke(name,args,()=>{
        assert.deepEqual(Object.keys(args).sort(), (name==='reserve_avatar'?['p_id','p_mime_type','p_expected_active_id']:['p_id']).sort());
        const row=rows.get(args.p_id);
        if(name==='reserve_avatar') {
          if(retired.has(args.p_id))return err('23505');
          if(row) {
            if(!own(row)||row.mime_type!==args.p_mime_type||row.expected_active_id!==args.p_expected_active_id||row.status==='deleting')return err('23505');
            return ok([row]);
          }
          if((active(current.profileId)?.id??null)!==args.p_expected_active_id)return err('40001');
          const r=makeRow(0,{id:args.p_id, object_key:`${current.pairId}/${current.profileId}/${args.p_id}`,
            mime_type:args.p_mime_type, expected_active_id:args.p_expected_active_id});
          rows.set(r.id,r); return ok(r);
        }
        if(name==='finalize_avatar') {
          if(!own(row))return err('42501');
          if(row.status==='ready'&&row.active)return ok(row);
          if(row.status!=='pending')return err('22023');
          if(row.publication_invalidated||(active(current.profileId)?.id??null)!==row.expected_active_id)return err('40001');
          const object=objects.get(row.object_key);
          if(!object||object.size<=0||object.size>AVATAR_MAX_BYTES||object.type!==row.mime_type)return err('22023');
          const previous=active(current.profileId); if(previous){previous.active=false;previous.status='deleting';}
          for(const other of rows.values())if(other.owner_id===row.owner_id&&other.id!==row.id&&other.status==='pending')other.publication_invalidated=true;
          row.status='ready';row.active=true;row.size_bytes=object.size;row.reserved_bytes=object.size;
          return ok(row);
        }
        if(name==='mark_avatar_delete') {
          if(!own(row))return err('42501');
          row.status='deleting';row.active=false; return ok(row);
        }
        if(name==='finish_avatar_delete') {
          if(!row)return ok(null);
          if(!own(row))return err('42501');
          if(row.status!=='deleting'||objects.has(row.object_key))return err('22023');
          rows.delete(row.id);retired.add(row.id);return ok(null);
        }
        assert.fail(`unexpected RPC ${name}`);
      });
    },
    from(table) {
      assert.equal(table,'profile_avatars'); const filters=[];
      const query={select(value){assert.equal(value,'*');return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},
        async maybeSingle(){return invoke('read',filters,()=>{const found=[...rows.values()].filter(r=>filters.every(([k,v])=>r[k]===v));assert.ok(found.length<=1);return ok(found[0]??null);});},
        async range(start,end){return invoke('list',filters,()=>ok([...rows.values()].filter(r=>filters.every(([k,v])=>r[k]===v)).slice(start,end+1)));}};
      return query;
    },
    storage:{from(bucket){assert.equal(bucket,AVATAR_BUCKET);return {
      async upload(key,bytes,config){return invoke('upload',{key,bytes,config},()=>{
        assert.deepEqual(config,{contentType:'image/png',upsert:false,cacheControl:'0'});
        const row=[...rows.values()].find(r=>r.object_key===key);
        if(!own(row)||row.status!=='pending')return err('42501');
        if(objects.has(key))return err('409');objects.set(key,bytes);return {data:{path:key},error:null};
      });},
      async remove(keys){return invoke('remove',keys,()=>{
        for(const key of keys){const row=[...rows.values()].find(r=>r.object_key===key);if(!own(row)||row.status!=='deleting')return err('42501');}
        for(const key of keys)objects.delete(key);return ok(keys.map(name=>({name})));});},
      async download(key){return invoke('download',key,()=>{
        const row=[...rows.values()].find(r=>r.object_key===key);
        return row?.active&&row.status==='ready'&&objects.has(key)?{data:objects.get(key),error:null}:err('42501');});},
    };}},
  };
  const created=[],revoked=[];
  const deps={client, getVerifiedContext:async()=>current, isCurrentContext:c=>!!current&&Object.keys(c).every(k=>c[k]===current[k]),
    randomUUID:()=>id(counter++), urlApi:{createObjectURL(blob){assert.ok(blob instanceof Blob);const u=`blob:test-${created.length}`;created.push(u);return u;},revokeObjectURL:url=>revoked.push(url)},
    decodeImage:async()=>({width:1,height:1}), ...options};
  const controller=createAvatarController(deps);
  const addReady=(n=50,owner=current.profileId)=>{const r=makeRow(n,{owner_id:owner,object_key:`${current.pairId}/${owner}/${id(n)}`,status:'ready',active:true,size_bytes:file().size,reserved_bytes:file().size});rows.set(r.id,r);objects.set(r.object_key,file());return r;};
  return {controller, client, deps, rows,objects,retired,calls,hooks,makeRow,addReady,created,revoked,
    setCurrent(c){current=c;},get current(){return current;}};
}
async function selected(f) {return f.controller.select(file(),{userSelected:true});}
async function succeeded(f) {await selected(f);return f.controller.retry();}

test('success: actual argument names, original bytes, private upload flags and authoritative readback',async()=>{
  const f=fixture(), selected=await f.controller.select(file(),{userSelected:true});
  assert.equal(selected.expectedActiveId,null);assert.equal(selected.fileRetained,true);
  const row=await f.controller.retry();assert.equal(row.status,'ready');assert.equal(row.active,true);
  assert.equal(f.controller.getState().fileRetained,false);
  assert.deepEqual(f.calls.filter(x=>x.name==='reserve_avatar')[0].args,{p_id:selected.id,p_mime_type:'image/png',p_expected_active_id:null});
  assert.equal(f.calls.filter(x=>x.name==='upload').length,1);
  assert.ok(f.calls.filter(x=>x.name==='read').length>=3);
});
test('replacement preserves original non-NULL expected active ID',async()=>{
  const f=fixture(), old=f.addReady();const s=await selected(f);assert.equal(s.expectedActiveId,old.id);
  await f.controller.retry();assert.equal(f.rows.get(old.id).status,'deleting');
});
test('reserve pending committed, response lost: same UUID and retained File are retried',async()=>{
  const f=fixture();let first=true;
  f.hooks.reserve_avatar=(args,actual)=>{const result=actual();if(first){first=false;return err('NETWORK');}return result;};
  const s=await selected(f);await rejects(f.controller.retry(),'AVATAR_REQUEST_FAILED','NETWORK');
  assert.equal(f.rows.size,1);assert.equal(f.controller.getState().fileRetained,true);
  await f.controller.retry();assert.deepEqual(f.calls.filter(x=>x.name==='reserve_avatar').map(x=>x.args.p_id),[s.id,s.id]);
});
test('reserve did not commit: retry still uses the original UUID',async()=>{
  const f=fixture();f.hooks.reserve_avatar=()=>err('NETWORK');const s=await selected(f);
  await rejects(f.controller.retry(),'AVATAR_REQUEST_FAILED');assert.equal(f.rows.size,0);delete f.hooks.reserve_avatar;
  assert.equal((await f.controller.retry()).id,s.id);
});
test('upload committed but response unknown: same-ID finalize reconciles without overwrite',async()=>{
  const f=fixture();f.hooks.upload=(args,actual)=>{actual();return err('NETWORK');};
  const row=await succeeded(f);assert.equal(row.active,true);assert.equal(f.calls.filter(x=>x.name==='upload').length,1);
});
test('upload unknown and missing: retain bytes and same ID for explicit retry',async()=>{
  const f=fixture();f.hooks.upload=()=>err('NETWORK');const s=await selected(f);
  await rejects(f.controller.retry(),'AVATAR_UPLOAD_UNCONFIRMED');assert.equal(f.controller.getState().fileRetained,true);
  delete f.hooks.upload;assert.equal((await f.controller.retry()).id,s.id);
});
test('upload conflict after earlier interrupted upload: finalize same key, never upsert',async()=>{
  const f=fixture();const s=await selected(f);const row=f.makeRow(0,{id:s.id,object_key:`${f.current.pairId}/${f.current.profileId}/${s.id}`});
  f.rows.set(s.id,row);f.objects.set(row.object_key,file());assert.equal((await f.controller.retry()).id,s.id);
});
test('finalize committed and response lost: retry recognizes ready same ID without uploading again',async()=>{
  const f=fixture();let first=true;f.hooks.finalize_avatar=(args,actual)=>{const r=actual();if(first){first=false;return err('NETWORK');}return r;};
  const s=await selected(f);await rejects(f.controller.retry(),'AVATAR_REQUEST_FAILED');assert.equal(f.rows.get(s.id).active,true);
  assert.equal((await f.controller.retry()).id,s.id);assert.equal(f.calls.filter(x=>x.name==='upload').length,1);
});
test('invalidated pending is cleanup-only even with NULL active again',async()=>{
  const f=fixture();const s=await selected(f);const row=f.makeRow(0,{id:s.id,object_key:`${f.current.pairId}/${f.current.profileId}/${s.id}`,publication_invalidated:true});f.rows.set(s.id,row);
  await rejects(f.controller.retry(),'AVATAR_PUBLICATION_INVALIDATED');assert.equal(f.controller.getState().fileRetained,true);
  assert.equal(f.controller.getState().expectedActiveId,null);assert.equal(f.controller.getState().recovery,'cleanup_only');
  await rejects(f.controller.retry(),'AVATAR_CLEANUP_REQUIRED');assert.equal(f.calls.filter(x=>x.name==='upload').length,0);
  await f.controller.cleanup(s.id);assert.equal(f.rows.size,0);assert.equal(f.controller.getState(),null);assert.ok(f.retired.has(s.id));
});
test('40001 is sticky cleanup-only, never fresh UUID/expected-ID rewrite',async()=>{
  const f=fixture();const s=await selected(f);f.addReady();await rejects(f.controller.retry(),'AVATAR_PUBLICATION_CONFLICT','40001');
  await rejects(f.controller.retry(),'AVATAR_CLEANUP_REQUIRED');await rejects(selected(f),'AVATAR_INTENT_EXISTS');
  assert.equal(f.controller.getState().id,s.id);assert.equal(f.controller.getState().expectedActiveId,null);
});
test('finalize 40001 keeps intent and bytes, blocks all future publication attempts',async()=>{
  const f=fixture();f.hooks.finalize_avatar=()=>err('40001');await selected(f);
  await rejects(f.controller.retry(),'AVATAR_PUBLICATION_CONFLICT','40001');assert.equal(f.controller.getState().fileRetained,true);
  const n=f.calls.length;await rejects(f.controller.retry(),'AVATAR_CLEANUP_REQUIRED');assert.equal(f.calls.length,n);
});
for(const [name,mutate] of [
  ['owner',r=>({...r,owner_id:id(999)})],['pair',r=>({...r,pair_id:id(999)})],
  ['key',r=>({...r,object_key:'other/key'})],['ID',r=>({...r,id:id(999)})],
  ['MIME',r=>({...r,mime_type:'image/jpeg'})],['expected',r=>({...r,expected_active_id:id(999)})],
  ['status',r=>({...r,status:'unknown'})],['active pending',r=>({...r,active:true})],
  ['missing invalidation field',r=>{const s={...r};delete s.publication_invalidated;return s;}],
]) test(`reject malformed reservation ${name} before upload`,async()=>{
  const f=fixture();f.hooks.reserve_avatar=(args,actual)=>{const r=actual();return ok(mutate(Array.isArray(r.data)?r.data[0]:r.data));};await selected(f);
  await assert.rejects(f.controller.retry(),e=>['AVATAR_ROW_INVALID','AVATAR_INTENT_MISMATCH'].includes(e.code));assert.equal(f.calls.filter(x=>x.name==='upload').length,0);
});
test('ready response alone cannot claim success without authoritative active target',async()=>{
  const f=fixture();f.hooks.finalize_avatar=(args,actual)=>{const r=actual();f.rows.get(args.p_id).active=false;return r;};await selected(f);
  await rejects(f.controller.retry(),'AVATAR_NOT_ACTIVE');assert.notEqual(f.controller.getState().state,'complete');
});
test('concurrent retry calls dedupe reserve/upload/finalize',async()=>{
  const f=fixture();await selected(f);await Promise.all([f.controller.retry(),f.controller.retry(),f.controller.retry()]);
  for(const name of ['reserve_avatar','upload','finalize_avatar'])assert.equal(f.calls.filter(x=>x.name===name).length,1);
});
test('mark first -> await own in-flight upload -> remove -> finish, no finalize after mark',async()=>{
  const f=fixture(), gate=deferred();let uploadStarted=false;
  f.hooks.upload=async(args)=>{uploadStarted=true;await gate.promise;f.objects.set(args.key,args.bytes);return ok({path:args.key});};
  const s=await selected(f);const publication=f.controller.retry();const observed=publication.catch(e=>e);
  await until(()=>uploadStarted);const removal=f.controller.cleanup(s.id);
  await until(()=>f.calls.some(x=>x.name==='mark_avatar_delete'));
  assert.equal(f.calls.some(x=>x.name==='remove'),false);assert.equal(f.rows.get(s.id).status,'deleting');
  gate.resolve();await removal;assert.equal((await observed).code,'AVATAR_CLEANUP_REQUIRED');
  const names=f.calls.map(x=>x.name);assert.ok(names.indexOf('mark_avatar_delete')<names.indexOf('remove'));
  assert.ok(names.indexOf('remove')<names.indexOf('finish_avatar_delete'));assert.equal(names.includes('finalize_avatar'),false);
  assert.equal(f.objects.size,0);assert.equal(f.rows.size,0);
});
test('remove error never calls finish; cleanup can explicitly resume deleting row',async()=>{
  const f=fixture();const row=await succeeded(f);f.hooks.remove=()=>err('NETWORK');
  await rejects(f.controller.cleanup(row.id),'AVATAR_REQUEST_FAILED','NETWORK');assert.equal(f.rows.get(row.id).status,'deleting');
  assert.equal(f.calls.some(x=>x.name==='finish_avatar_delete'),false);delete f.hooks.remove;
  await f.controller.cleanup(row.id);assert.equal(f.rows.size,0);
});
test('cleanup during unacknowledged reserve never drops intent or permits a late upload',async()=>{
  const f=fixture(),gate=deferred();f.hooks.reserve_avatar=async(args,actual)=>{await gate.promise;return actual();};
  const s=await selected(f);const publication=f.controller.retry().catch(e=>e);
  await until(()=>f.calls.some(x=>x.name==='reserve_avatar'));
  await rejects(f.controller.cleanup(s.id),'AVATAR_CLEANUP_RETRY_REQUIRED');
  assert.equal(f.controller.getState().fileRetained,true);gate.resolve();
  assert.equal((await publication).code,'AVATAR_CLEANUP_REQUIRED');assert.equal(f.calls.some(x=>x.name==='upload'),false);
  await f.controller.cleanup(s.id);assert.equal(f.controller.getState(),null);assert.equal(f.rows.size,0);
});
test('logout while mark awaits prevents remove/finish in a newer session',async()=>{
  const f=fixture(),gate=deferred();const row=await succeeded(f);
  f.hooks.mark_avatar_delete=async(args,actual)=>{const r=actual();await gate.promise;return r;};
  const cleanup=f.controller.cleanup(row.id).catch(e=>e);await until(()=>f.calls.some(x=>x.name==='mark_avatar_delete'));
  f.controller.clear();f.setCurrent({...context(),sessionGeneration:2});gate.resolve();
  assert.equal((await cleanup).code,'AVATAR_SESSION_CHANGED');assert.equal(f.calls.some(x=>x.name==='remove'||x.name==='finish_avatar_delete'),false);
});
test('throwing synchronous session guard fails closed with a coded error',async()=>{
  const f=fixture({isCurrentContext:()=>{throw Error('private');}});
  await rejects(selected(f),'AVATAR_SESSION_CHANGED');assert.equal(f.controller.getState(),null);assert.equal(f.calls.length,0);
});
test('finish error is retained and retryable only as cleanup',async()=>{
  const f=fixture();const row=await succeeded(f);f.hooks.finish_avatar_delete=()=>err('NETWORK');
  await rejects(f.controller.cleanup(row.id),'AVATAR_REQUEST_FAILED');assert.equal(f.objects.size,0);assert.equal(f.rows.size,1);
  delete f.hooks.finish_avatar_delete;await f.controller.cleanup(row.id);assert.equal(f.rows.size,0);
});
test('foreign row recovery/cleanup are rejected before destructive Storage calls',async()=>{
  const f=fixture(), row=f.makeRow(20,{owner_id:id(888)});f.rows.set(row.id,row);
  await rejects(f.controller.cleanup(row.id),'AVATAR_ROW_INVALID');await rejects(f.controller.recoverPending(row.id),'AVATAR_ROW_INVALID');
  assert.equal(f.calls.some(x=>x.name==='remove'||x.name==='mark_avatar_delete'),false);
});
test('reload pending with bytes can finalize; does not require or invent a File',async()=>{
  const f=fixture(), row=f.makeRow(20);f.rows.set(row.id,row);f.objects.set(row.object_key,file());
  assert.equal((await f.controller.recoverPending(row.id)).id,row.id);assert.equal(f.calls.some(x=>x.name==='upload'),false);
});
test('reload missing bytes requires discard and new selection, never metadata-only same-file attachment',async()=>{
  const f=fixture(), row=f.makeRow(20);f.rows.set(row.id,row);
  await rejects(f.controller.recoverPending(row.id),'AVATAR_RESELECTION_REQUIRED');
  assert.equal(f.controller.getState().fileRetained,false);assert.equal(f.controller.getState().recovery,'finalize_or_discard_reselect_new');
  await rejects(selected(f),'AVATAR_INTENT_EXISTS');assert.equal(f.calls.some(x=>x.name==='upload'),false);
  await f.controller.cleanup(row.id);await selected(f);assert.notEqual(f.controller.getState().id,row.id);
});
test('recovery list exposes only owned pending/deleting and explicit capabilities',async()=>{
  const f=fixture();f.addReady();for(const n of [20,21,22]){const r=f.makeRow(n,{status:n===22?'deleting':'pending',publication_invalidated:n===21});f.rows.set(r.id,r);}
  const list=await f.controller.listRecovery();assert.equal(list.length,3);assert.deepEqual(list.map(x=>x.recovery),['finalize_or_discard_reselect_new','cleanup_only','cleanup_only']);
});
test('explicit deleting recovery works without local intent',async()=>{
  const f=fixture(), row=f.makeRow(20,{status:'deleting'});f.rows.set(row.id,row);f.objects.set(row.object_key,file());
  await f.controller.cleanup(row.id);assert.equal(f.objects.size,0);assert.ok(f.retired.has(row.id));
});
test('logout during reserve: no upload/finalize and no retained File',async()=>{
  const f=fixture(),gate=deferred();f.hooks.reserve_avatar=async(args,actual)=>{const r=actual();await gate.promise;return r;};
  await selected(f);const pending=f.controller.retry();const result=pending.catch(e=>e);await until(()=>f.calls.some(x=>x.name==='reserve_avatar'));
  f.controller.clear();f.setCurrent(null);gate.resolve();assert.equal((await result).code,'AVATAR_SESSION_CHANGED');
  assert.equal(f.controller.getState(),null);assert.equal(f.calls.some(x=>x.name==='upload'),false);
});
test('logout during upload: old await cannot finalize or run under a new session',async()=>{
  const f=fixture(),gate=deferred();f.hooks.upload=async(args,actual)=>{const r=actual();await gate.promise;return r;};
  await selected(f);const pending=f.controller.retry();const result=pending.catch(e=>e);await until(()=>f.calls.some(x=>x.name==='upload'));
  f.controller.clear();f.setCurrent({...context(),sessionGeneration:2});gate.resolve();assert.equal((await result).code,'AVATAR_SESSION_CHANGED');
  assert.equal(f.calls.some(x=>x.name==='finalize_avatar'),false);assert.equal(f.controller.getState(),null);
});
test('fresh verification context change clears retained intent even without explicit clear',async()=>{
  const f=fixture();await selected(f);f.setCurrent({...context(),sessionGeneration:2});await rejects(f.controller.retry(),'AVATAR_SESSION_CHANGED');assert.equal(f.controller.getState(),null);
});
test('guard detects same-generation auth/profile/pair/partner identity drift',async()=>{
  for(const key of ['authUserId','profileId','pairId','partnerProfileId']){
    const f=fixture(),gate=deferred();f.hooks.reserve_avatar=async(args,actual)=>{const r=actual();await gate.promise;return r;};await selected(f);
    const pending=f.controller.retry().catch(e=>e);await until(()=>f.calls.some(x=>x.name==='reserve_avatar'));
    f.setCurrent({...f.current,[key]:id(999)});gate.resolve();assert.equal((await pending).code,'AVATAR_SESSION_CHANGED');assert.equal(f.controller.getState(),null);
  }
});
test('logout during selection decode cannot retain File or reserve under next session',async()=>{
  const gate=deferred(), f=fixture({decodeImage:async()=>{await gate.promise;return {width:1,height:1};}});
  const selecting=f.controller.select(file(),{userSelected:true}).catch(e=>e);await flush();f.controller.clear();f.setCurrent({...context(),sessionGeneration:2});gate.resolve();
  assert.equal((await selecting).code,'AVATAR_SESSION_CHANGED');assert.equal(f.controller.getState(),null);assert.equal(f.calls.length,0);
});
test('own/partner active downloads only; URLs revoked on replacement, release and clear',async()=>{
  const f=fixture();const own=f.addReady(),partner=f.addReady(51,f.current.partnerProfileId);
  const a=await f.controller.loadPhoto(own.owner_id);const b=await f.controller.loadPhoto(partner.owner_id);
  assert.equal(f.created.length,2);await f.controller.loadPhoto(own.owner_id);assert.ok(f.revoked.includes(a.url));
  f.controller.releasePhoto(partner.owner_id);assert.ok(f.revoked.includes(b.url));f.controller.clear();assert.deepEqual([...f.revoked].sort(),[...f.created].sort());
});
test('download await after logout cannot create any URL',async()=>{
  const f=fixture(), gate=deferred();f.addReady();f.hooks.download=async(args,actual)=>{const r=actual();await gate.promise;return r;};
  const loading=f.controller.loadPhoto(f.current.profileId).catch(e=>e);await until(()=>f.calls.some(x=>x.name==='download'));
  f.controller.clear();f.setCurrent(null);gate.resolve();assert.equal((await loading).code,'AVATAR_SESSION_CHANGED');assert.equal(f.created.length,0);
});
test('downloaded but no longer active does not become a URL',async()=>{
  const f=fixture(), row=f.addReady();f.hooks.download=(args,actual)=>{const r=actual();row.active=false;row.status='deleting';return r;};
  await rejects(f.controller.loadPhoto(f.current.profileId),'AVATAR_NOT_ACTIVE');assert.equal(f.created.length,0);
});
test('superseded concurrent download cannot replace newer photo URL',async()=>{
  const f=fixture(), gate=deferred();f.addReady();let first=true;f.hooks.download=async(args,actual)=>{const r=actual();if(first){first=false;await gate.promise;}return r;};
  const loading=f.controller.loadPhoto(f.current.profileId).catch(e=>e);await until(()=>f.calls.some(x=>x.name==='download'));
  const photo=await f.controller.loadPhoto(f.current.profileId);gate.resolve();assert.equal((await loading).code,'AVATAR_PHOTO_SUPERSEDED');assert.deepEqual(f.created,[photo.url]);
});
test('foreign owner photo request and pending own row never download',async()=>{
  const f=fixture(),row=f.makeRow(20);f.rows.set(row.id,row);await rejects(f.controller.loadPhoto(id(999)),'AVATAR_OWNER_INVALID');
  assert.equal(await f.controller.loadPhoto(f.current.profileId),null);assert.equal(f.calls.some(x=>x.name==='download'),false);
});
test('transient fresh context drop quarantines exact File/UUID/expected-active and resumes only explicitly',async()=>{
  let offline=false;
  const f=fixture({getVerifiedContext:async()=>{if(offline)throw {code:'NETWORK'};return context();},
    isCurrentContext:c=>!offline&&Object.keys(c).every(k=>c[k]===context()[k])});
  const old=f.addReady(), original=file();
  const s=await f.controller.select(original,{userSelected:true});
  f.hooks.reserve_avatar=(args,actual)=>{actual();return err('NETWORK');};
  await rejects(f.controller.retry(),'AVATAR_REQUEST_FAILED','NETWORK');
  const before=f.controller.getState(), count=f.calls.length;
  assert.equal(before.expectedActiveId,old.id);assert.equal(before.fileRetained,true);
  offline=true;
  await rejects(f.controller.retry(),'AVATAR_REQUEST_FAILED','NETWORK');
  assert.deepEqual(f.controller.getState(),before);assert.equal(f.calls.length,count);
  await rejects(f.controller.loadPhoto(old.owner_id),'AVATAR_REQUEST_FAILED','NETWORK');
  assert.equal(f.calls.length,count);assert.deepEqual(f.created,[]);
  assert.equal(f.controller.getState().fileRetained,true);
  offline=false;delete f.hooks.reserve_avatar;await flush();assert.equal(f.calls.length,count);
  const result=await f.controller.retry();assert.equal(result.id,s.id);
  assert.deepEqual(f.calls.filter(x=>x.name==='reserve_avatar').map(x=>x.args),[
    {p_id:s.id,p_mime_type:'image/png',p_expected_active_id:old.id},
    {p_id:s.id,p_mime_type:'image/png',p_expected_active_id:old.id},
  ]);
  assert.equal(f.calls.filter(x=>x.name==='upload').length,1);
  assert.equal(f.calls.find(x=>x.name==='upload').args.bytes,original);
  assert.equal(f.objects.get(result.object_key),original);
});
test('release while fresh verification is pending prevents download and URL creation',async()=>{
  const gate=deferred();let entered=false;
  const f=fixture({getVerifiedContext:async()=>{entered=true;await gate.promise;return context();}});f.addReady();
  const loading=f.controller.loadPhoto(context().profileId).catch(e=>e);
  await until(()=>entered);f.controller.releasePhoto(context().profileId);gate.resolve();
  assert.equal((await loading).code,'AVATAR_PHOTO_SUPERSEDED');
  assert.equal(f.calls.length,0);assert.deepEqual(f.created,[]);assert.deepEqual(f.revoked,[]);
});
test('older fresh verification returning after newer load never revokes or replaces newer URL',async()=>{
  const gate=deferred();let invocations=0;
  const f=fixture({getVerifiedContext:async()=>{if(++invocations===1)await gate.promise;return context();}});f.addReady();
  const older=f.controller.loadPhoto(context().profileId).catch(e=>e);
  const newer=await f.controller.loadPhoto(context().profileId), count=f.calls.length;
  gate.resolve();assert.equal((await older).code,'AVATAR_PHOTO_SUPERSEDED');
  assert.equal(f.calls.length,count);assert.deepEqual(f.created,[newer.url]);assert.deepEqual(f.revoked,[]);
  f.controller.releasePhoto(context().profileId);assert.deepEqual(f.revoked,[newer.url]);
});
test('explicit clear while fresh verification is pending destroys retained intent and blocks revival',async()=>{
  let gate=null,entered=false;
  const f=fixture({getVerifiedContext:async()=>{if(gate){entered=true;await gate.promise;}return context();}});
  await selected(f);gate=deferred();const pending=f.controller.retry().catch(e=>e);
  await until(()=>entered);const count=f.calls.length;f.controller.clear();gate.resolve();
  assert.equal((await pending).code,'AVATAR_SESSION_CHANGED');assert.equal(f.controller.getState(),null);
  assert.equal(f.calls.length,count);gate=null;await rejects(f.controller.retry(),'AVATAR_INTENT_MISSING');
});
test('confirmed identity or generation change destroys quarantined intent, not a resumable network drop',async()=>{
  for(const key of ['authUserId','profileId','pairId','partnerProfileId','sessionGeneration']){
    let offline=false,next=context();
    const f=fixture({getVerifiedContext:async()=>{if(offline)throw {code:'NETWORK'};return next;}});
    await selected(f);offline=true;await rejects(f.controller.retry(),'AVATAR_REQUEST_FAILED','NETWORK');
    assert.equal(f.controller.getState()?.fileRetained,true);
    offline=false;next={...context(),[key]:key==='sessionGeneration'?2:id(999)};f.setCurrent(next);
    await rejects(f.controller.retry(),'AVATAR_SESSION_CHANGED');assert.equal(f.controller.getState(),null);
  }
});
test('malformed context and explicit Auth denial still destroy retained state',async()=>{
  for(const invalid of [null,{...context(),profileId:'invalid'}, {code:'401'}, {code:'42501'},
    {code:'NETWORK',status:401},{code:'FETCH_ERROR',statusCode:'403'},{code:'UNKNOWN'},
    new AvatarError('AVATAR_CONTEXT_INVALID'),new AvatarError('AVATAR_SESSION_CHANGED')]){
    let deny=false;
    const f=fixture({getVerifiedContext:async()=>{if(!deny)return context();if(invalid?.code)throw invalid;return invalid;}});
    await selected(f);deny=true;const count=f.calls.length;
    await assert.rejects(f.controller.retry(),e=>e instanceof AvatarError);
    assert.equal(f.controller.getState(),null);assert.equal(f.calls.length,count);
  }
});
test('coded transport failures quarantine but do not bypass a false synchronous context guard',async()=>{
  for(const error of [{code:'FETCH_ERROR'},new AvatarError('AVATAR_REQUEST_FAILED',{stage:'context',serverCode:'NETWORK'}),
    {name:'AuthRetryableFetchError',status:0},{name:'AuthRetryableFetchError',status:503}]){
    let offline=false,ready=true;
    const f=fixture({getVerifiedContext:async()=>{if(offline)throw error;return context();},
      isCurrentContext:c=>ready&&Object.keys(c).every(k=>c[k]===context()[k])});
    await selected(f);offline=true;ready=false;const count=f.calls.length;
    await assert.rejects(f.controller.retry(),e=>e instanceof AvatarError);
    assert.equal(f.controller.getState()?.fileRetained,true);assert.equal(f.calls.length,count);
    offline=false;await rejects(f.controller.retry(),'AVATAR_SESSION_CHANGED');
    assert.equal(f.controller.getState(),null);assert.equal(f.calls.length,count);
  }
});
test('transient verification invalidates outstanding tickets without destroying quarantined bytes',async()=>{
  let offline=false;
  const f=fixture({getVerifiedContext:async()=>{if(offline)throw {code:'NETWORK'};return context();}}),gate=deferred();
  f.hooks.reserve_avatar=async(args,actual)=>{const result=actual();await gate.promise;return result;};
  const s=await selected(f), pending=f.controller.retry().catch(e=>e);
  await until(()=>f.calls.some(x=>x.name==='reserve_avatar'));offline=true;
  await rejects(f.controller.listRecovery(),'AVATAR_REQUEST_FAILED','NETWORK');
  assert.equal(f.controller.getState()?.fileRetained,true);gate.resolve();
  assert.equal((await pending).code,'AVATAR_SESSION_CHANGED');
  assert.equal(f.calls.some(x=>x.name==='upload'||x.name==='finalize_avatar'),false);
  offline=false;delete f.hooks.reserve_avatar;
  assert.equal((await f.controller.retry()).id,s.id);assert.equal(f.calls.filter(x=>x.name==='upload').length,1);
});

test('host unavailable invalidates held upload even after read-only verification; explicit same-ID retry works',async()=>{
  const f=fixture(),original=file(),s=await f.controller.select(original,{userSelected:true}),gate=deferred();
  f.hooks.upload=async(_args,actual)=>{await gate.promise;return actual();};
  const pending=f.controller.retry();await until(()=>f.calls.some(c=>c.name==='upload'));
  f.controller.setUnavailable();
  assert.equal(f.controller.getState().id,s.id);assert.equal(f.controller.getState().fileRetained,true);
  await f.controller.listRecovery();await f.controller.loadPhoto(f.current.profileId);
  gate.resolve();await rejects(pending,'AVATAR_SESSION_CHANGED');
  assert.equal(f.calls.filter(c=>c.name==='finalize_avatar').length,0,'read-only reverify revived publication');
  assert.equal(f.controller.getState().fileRetained,true);assert.equal(f.objects.get([...f.rows.values()][0].object_key),original);
  delete f.hooks.upload;assert.equal((await f.controller.retry()).id,s.id);
  assert.equal(f.calls.filter(c=>c.name==='finalize_avatar').length,1);
  assert.ok(f.calls.filter(c=>c.name==='reserve_avatar').every(c=>c.args.p_id===s.id));f.controller.clear();
});
test('host unavailable preserves upload-drain tracking and blocks obsolete cleanup; explicit cleanup resumes',async()=>{
  const f=fixture(),s=await selected(f),gate=deferred();
  f.hooks.upload=async(_args,actual)=>{await gate.promise;return actual();};
  const pending=f.controller.retry(),uploadResult=pending.catch(e=>e);
  await until(()=>f.calls.some(c=>c.name==='upload'));
  const cleanup=f.controller.cleanup(s.id),cleanupResult=cleanup.catch(e=>e);
  await until(()=>f.calls.some(c=>c.name==='mark_avatar_delete'));
  f.controller.setUnavailable();await f.controller.listRecovery();gate.resolve();
  assert.equal((await uploadResult).code,'AVATAR_SESSION_CHANGED');
  assert.equal((await cleanupResult).code,'AVATAR_SESSION_CHANGED');
  assert.equal(f.calls.filter(c=>c.name==='remove'||c.name==='finish_avatar_delete').length,0);
  assert.equal(f.controller.getState().id,s.id);assert.equal(f.controller.getState().fileRetained,true);
  delete f.hooks.upload;assert.deepEqual(await f.controller.cleanup(s.id),{id:s.id,state:'deleted'});
  assert.equal(f.controller.getState(),null);assert.equal(f.retired.has(s.id),true);f.controller.clear();
});
test('file validation rejects size/type/SVG/HEIC, and requires explicit selection',async()=>{
  const f=fixture();await rejects(f.controller.select(file()),'AVATAR_EXPLICIT_SELECTION_REQUIRED');
  for(const [blob,code] of [[new Blob([],{type:'image/png'}),'AVATAR_SIZE_INVALID'],[new Blob([new Uint8Array(AVATAR_MAX_BYTES+1)],{type:'image/png'}),'AVATAR_SIZE_INVALID'],[new Blob(['<svg/>'],{type:'image/svg+xml'}),'AVATAR_TYPE_UNSUPPORTED'],[new Blob(['heic'],{type:'image/heic'}),'AVATAR_HEIC_UNSUPPORTED']])await rejects(f.controller.select(blob,{userSelected:true}),code);
  assert.equal(f.calls.length,0);
});
test('declared MIME alone is not validation; signature and decoder failures are coded',async()=>{
  await rejects(validateAvatarImage(new Blob(['not an image'],{type:'image/png'}),{decode:async()=>({width:1,height:1})}),'AVATAR_SIGNATURE_MISMATCH');
  await rejects(validateAvatarImage(file(),{decode:async()=>{throw Error('private internal text');}}),'AVATAR_DECODE_FAILED');
  await rejects(validateAvatarImage(file(),{decode:async()=>({width:0,height:1})}),'AVATAR_DIMENSIONS_INVALID');
  await rejects(validateAvatarImage(file(),{decode:async()=>({width:16384,height:16384})}),'AVATAR_DIMENSIONS_INVALID');
});
test('original-only validation accurately reports metadata not removed',async()=>{
  const original=file();const result=await validateAvatarImage(original,{decode:async()=>({width:1,height:1})});
  assert.equal(result.file,original);assert.deepEqual(result.metadata,{originalBytes:true,reencoded:false,metadataRemoved:false,animationPreserved:true});
});
test('real pinned Supabase SDK executes controller on local-only intercepted HTTP transport',async()=>{
  const f=fixture(), requests=[];
  const fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);requests.push({url,init});
    assert.equal(url.origin,'https://avatar-offline.invalid');
    let result;
    if(url.pathname.includes('/rpc/')) result=await f.client.rpc(url.pathname.split('/').at(-1),JSON.parse(init.body));
    else if(url.pathname==='/rest/v1/profile_avatars') {
      const filters=[...url.searchParams].filter(([k])=>k!=='select');
      const rows=[...f.rows.values()].filter(r=>filters.every(([k,v])=>String(r[k])===v.slice(3)));
      result=ok(rows[0]??null);
    } else if(url.pathname.startsWith('/storage/v1/object/')) {
      assert.equal(init.method,'POST');assert.equal(new Headers(init.headers).get('x-upsert'),'false');
      assert.ok(init.body instanceof FormData);assert.equal(init.body.get('cacheControl'),'0');
      const bytes=init.body.get('');assert.equal(bytes.type,'image/png');
      const key=url.pathname.split('/').slice(5).join('/');f.objects.set(key,bytes);
      result=ok({Key:`${AVATAR_BUCKET}/${key}`,Id:id(100)});
    } else assert.fail(`unexpected HTTP path ${url.pathname}`);
    return new Response(JSON.stringify(result.error??result.data),{status:result.error?400:200,headers:{'content-type':'application/json'}});
  };
  const client=createClient('https://avatar-offline.invalid','offline-public-placeholder',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const controller=createAvatarController({...f.deps,client});await controller.select(file(),{userSelected:true});const row=await controller.retry();
  assert.equal(row.active,true);assert.equal(requests.filter(r=>r.url.pathname.includes('/rpc/reserve_avatar')).length,1);
  assert.equal(requests.filter(r=>r.url.pathname.includes('/rpc/finalize_avatar')).length,1);
});

test('isolated real Chromium decode: supported formats, corruption, MIME, cap and Image fallback',
  {skip:process.env.AVATAR_BROWSER_TEST!=='1'},()=>{
  const source=fileURLToPath(new URL('../src/avatar.js',import.meta.url));
  const python=String.raw`
import os, sys, json, tempfile
scratch = os.path.join(os.environ['LOCALAPPDATA'], 'hermes', 'profiles', 'krillin', 'cache', 'scratch')
os.makedirs(scratch, exist_ok=True)
for name in ('TMP', 'TEMP', 'TMPDIR'): os.environ[name] = scratch
tempfile.tempdir = scratch
from playwright.sync_api import sync_playwright
with open(sys.argv[1], encoding='utf-8') as f: source = f.read()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('AVATAR_CHROME', 'C:/Program Files/Google/Chrome/Application/chrome.exe'), headless=True, args=['--disable-background-networking', '--no-first-run'])
    try:
        context = browser.new_context()
        context.route('**/*', lambda route: route.abort())
        page = context.new_page()
        result = page.evaluate(r'''async source => {
          const moduleURL = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
          const m = await import(moduleURL); URL.revokeObjectURL(moduleURL);
          const results = [];
          const check = (name, condition) => { if (!condition) throw Error(name); results.push(name); };
          const reject = async (name, promise, code) => {
            try { await promise; throw Error('unexpected success '+name); }
            catch (e) { check(name, e.code===code); }
          };
          const canvas = document.createElement('canvas'); canvas.width=2;canvas.height=3;
          canvas.getContext('2d').fillRect(0,0,2,3);
          let png;
          for (const type of ['image/png','image/jpeg','image/webp']) {
            const blob = await new Promise(resolve=>canvas.toBlob(resolve,type));
            check(type+' encoder', blob.type===type);
            const image = await m.validateAvatarImage(blob);
            check(type+' decoded', image.width===2&&image.height===3&&image.file===blob&&!image.metadata.metadataRemoved);
            if (type==='image/png') png=blob;
          }
          const gif = new Blob([Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),c=>c.charCodeAt(0))],{type:'image/gif'});
          const decodedGIF = await m.validateAvatarImage(gif);
          check('GIF decoded',decodedGIF.width===1&&decodedGIF.height===1);
          await reject('corrupt PNG actual decode',m.validateAvatarImage(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'})),'AVATAR_DECODE_FAILED');
          await reject('MIME signature mismatch',m.validateAvatarImage(new Blob([png],{type:'image/jpeg'})),'AVATAR_SIGNATURE_MISMATCH');
          await reject('HEIC explicit unsupported',m.validateAvatarImage(new Blob(['heic'],{type:'image/heic'})),'AVATAR_HEIC_UNSUPPORTED');
          await reject('SVG unsupported',m.validateAvatarImage(new Blob(['<svg/>'],{type:'image/svg+xml'})),'AVATAR_TYPE_UNSUPPORTED');
          await reject('byte cap',m.validateAvatarImage(new Blob([new Uint8Array(m.AVATAR_MAX_BYTES+1)],{type:'image/png'})),'AVATAR_SIZE_INVALID');
          const nativeBitmap=globalThis.createImageBitmap;
          const nativeCreate=URL.createObjectURL, nativeRevoke=URL.revokeObjectURL;
          const created=[],revoked=[];
          globalThis.createImageBitmap=undefined;
          URL.createObjectURL=blob=>{const u=nativeCreate.call(URL,blob);created.push(u);return u;};
          URL.revokeObjectURL=u=>{revoked.push(u);nativeRevoke.call(URL,u);};
          try {
            const fallback=await m.validateAvatarImage(png);
            check('Image.decode fallback',fallback.width===2&&fallback.height===3);
            await reject('Image.decode corrupt',m.validateAvatarImage(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'})),'AVATAR_DECODE_FAILED');
            check('fallback URL revocation success and failure',created.length===2&&revoked.length===2&&created.every(u=>revoked.includes(u)));
          } finally {globalThis.createImageBitmap=nativeBitmap;URL.createObjectURL=nativeCreate;URL.revokeObjectURL=nativeRevoke;}
          return {checks:results.length,results,userAgent:navigator.userAgent};
        }''',source)
        print(json.dumps(result))
    finally: browser.close()
`;
  const output=execFileSync(process.env.AVATAR_PYTHON??'python',['-c',python,source],{encoding:'utf8',timeout:60000});
  const result=JSON.parse(output.trim());assert.equal(result.checks,15);assert.equal(result.results.length,result.checks);
  console.log('Chromium image assertions:',result.checks,result.userAgent);
});
