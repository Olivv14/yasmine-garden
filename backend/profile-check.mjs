// Real offline PostgreSQL execution, NOT Supabase HTTP/Auth/Storage/Realtime.
// Reuses the existing harness's explicit local ABI fixture; does not run/edit it.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const baseVerify = read('./verify.sql');
const originalAllowlist = "policyname not in('connection_storage_read','connection_storage_insert','connection_storage_delete')";
assert.equal(baseVerify.split(originalAllowlist).length, 2, 'base verifier ABI changed; review extension verifier');
// In-memory EXTENDED catalog verifier only; original verify.sql remains untouched.
const extendedBase = baseVerify.replace(originalAllowlist,
  "policyname not in('connection_storage_read','connection_storage_insert','connection_storage_delete','profile_storage_read','profile_storage_insert','profile_storage_delete')");
const extensionCatalog = `
begin transaction read only;
do $$ declare t text; r text; p text; f record; begin
 foreach t in array array['profile_details','profile_preferences','profile_avatars','thought_events'] loop
   if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relrowsecurity) then raise exception 'Missing extension table RLS: %',t; end if;
   if (select count(*) from pg_policies where schemaname='public' and tablename=t)<>1
     or not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='profile_read' and cmd='SELECT' and roles=array['authenticated']::name[]) then raise exception 'Unexpected extension table policy: %',t; end if;
   if not has_table_privilege('authenticated','public.'||t,'SELECT') then raise exception 'Missing authenticated SELECT: %',t; end if;
   foreach r in array array['anon','authenticated','service_role'] loop
     foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
       if not(r='authenticated' and p='SELECT') and has_table_privilege(r,'public.'||t,p) then raise exception 'Unsafe extension table grant: % % %',r,t,p; end if;
     end loop;
   end loop;
 end loop;
 if not exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid='public.profile_avatars'::regclass and a.attname='publication_invalidated'
   and not a.attisdropped and a.atttypid='boolean'::regtype and a.attnotnull
   and pg_get_expr(d.adbin,d.adrelid)='false') then raise exception 'Missing/unsafe avatar publication invalidation flag'; end if;
 foreach t in array array['retired_avatar_ids','avatar_limits','thought_limits'] loop
   if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname=t and c.relrowsecurity)
     or exists(select 1 from pg_policies where schemaname='app_private' and tablename=t) then raise exception 'Unsafe internal extension RLS: %',t; end if;
   foreach r in array array['anon','authenticated','service_role'] loop
     foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
       if has_table_privilege(r,'app_private.'||t,p) then raise exception 'Unsafe internal grant: % % %',r,t,p; end if;
     end loop;
   end loop;
 end loop;
 for f in select p.oid,p.oid::regprocedure signature,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('save_my_profile','save_my_preferences','reserve_avatar','finalize_avatar','mark_avatar_delete','finish_avatar_delete','send_thought','mark_thought_read'))
 or (n.nspname='app_private' and p.proname='can_avatar') loop
   if not f.prosecdef or not ('search_path=""'=any(coalesce(f.proconfig,array[]::text[]))) then raise exception 'Unsafe extension definer: %',f.signature; end if;
   if not has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('service_role',f.oid,'EXECUTE')
      or exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=f.oid and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'Unsafe extension execute: %',f.signature; end if;
 end loop;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_my_profile','save_my_preferences','reserve_avatar','finalize_avatar','mark_avatar_delete','finish_avatar_delete','send_thought','mark_thought_read'))<>8 then raise exception 'Missing/overloaded extension RPC'; end if;
 if not exists(select 1 from storage.buckets where id='connection-avatars' and name=id and not public and file_size_limit=1048576 and allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif']) then raise exception 'Unsafe avatar bucket'; end if;
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects')<>6 then raise exception 'Storage policies must be exact base + avatar six'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_storage_read' and cmd='SELECT' and roles=array['authenticated']::name[] and qual like '%connection-avatars%' and qual like '%can_avatar%' and qual like '%allow_any_operation%')
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_storage_insert' and cmd='INSERT' and roles=array['authenticated']::name[] and with_check like '%connection-avatars%' and with_check like '%can_avatar%' and with_check like '%allow_only_operation%')
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_storage_delete' and cmd='DELETE' and roles=array['authenticated']::name[] and qual like '%connection-avatars%' and qual like '%can_avatar%' and qual like '%allow_any_operation%') then raise exception 'Unsafe avatar Storage gates'; end if;
end $$;
select 'extended profile catalog checks passed; live tests still required' result;
commit;
`;
const catalogSQL = extendedBase + '\n' + extensionCatalog;
if (process.argv.includes('--catalog-sql')) {
  console.log('-- READ ONLY, privileged dedicated project only. Base + extension verifier.');
  console.log(catalogSQL);
} else {
  await run();
}
async function run() {
  const require = createRequire(process.env.CONNECTION_TEST_PACKAGE_JSON || import.meta.url);
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  let checks = 0;
  const pass = label => { checks++; console.log('PASS ' + label); };
  async function ok(sql, label) {
    const result = (await db.query(sql)).rows;
    assert.equal(result[0]?.ok, true, label + ': ' + JSON.stringify(result)); pass(label);
  }
  async function fails(sql, code, label) {
    await db.exec('SAVEPOINT negative_test');
    try { await db.exec(sql); }
    catch(e) {
      await db.exec('ROLLBACK TO SAVEPOINT negative_test; RELEASE SAVEPOINT negative_test');
      assert.equal(e.code, code, label + ': ' + e.message); pass(label); return;
    }
    await db.exec('ROLLBACK TO SAVEPOINT negative_test; RELEASE SAVEPOINT negative_test');
    throw new Error(label + ': unexpectedly succeeded');
  }
  async function user(id, role='authenticated') {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id}',false); SELECT set_config('request.jwt.claim.role','${role}',false); SELECT set_config('test.storage_operation','object.get_authenticated',false); SET ROLE ${role};`);
  }
  const operation = op => db.query("SELECT set_config('test.storage_operation',$1,false)",[op]);
  const rpc = async (sql, args=[]) => (await db.query('SELECT * FROM public.' + sql,args)).rows[0];
  const a=randomUUID(), b=randomUUID(), outsider=randomUUID(), anonymous=randomUUID();
  const thought=randomUUID(), avatar=randomUUID(), oldMedia=randomUUID(), journal=randomUUID();
  const base=read('./001_shared_app.sql'), extension=read('./002_profile_thoughts.sql');
  try {
    const fixture = read('./local-check.mjs').match(/const fixtureSQL=`([\s\S]*?)`;/)?.[1];
    assert.ok(fixture, 'existing local ABI fixture not found');
    await db.exec(fixture);
    await db.exec(base); pass('001 executes on local ABI fixture');
    await db.query('INSERT INTO auth.users(id,is_anonymous) VALUES($1,false),($2,false),($3,false),($4,true)',[a,b,outsider,anonymous]);
    await db.query("SELECT public.admin_enroll_pair($1,'Synthetic A',$2,'Synthetic B')",[a,b]);
    const profiles=(await db.query('SELECT id,auth_user_id FROM public.users_profiles')).rows;
    const pa=profiles.find(p=>p.auth_user_id===a).id, pb=profiles.find(p=>p.auth_user_id===b).id;
    const signals = async () => { await db.exec('RESET ROLE'); return (await db.query('SELECT profile_id,revision FROM public.sync_signals ORDER BY profile_id')).rows; };
    await user(a);
    await rpc('save_content($1,0,$2)',[journal,{item_type:'journal',body:'synthetic base retained'}]);
    await rpc("reserve_media($1,$2,'synthetic.png','image/png')",[oldMedia,journal]);
    await rpc('mark_media_delete($1)',[oldMedia]); await rpc('finish_media_delete($1)',[oldMedia]);
    await db.exec('RESET ROLE');
    await db.exec(base); pass('001 reapplies over enrolled content and retired media without wipe');
    await db.exec(baseVerify); pass('unchanged base verify.sql before extension');
    await db.exec(extension); pass('002 executes after populated base');
    await db.exec(catalogSQL); pass('extended catalog verifies base + extension, exact six Storage policies');
    await db.exec('BEGIN');
    await fails(baseVerify.replace('begin transaction read only;','').replace(/commit;\s*$/,''),'P0001','unchanged base verifier intentionally refuses extension policies (documented order)');
    await user(a);
    await fails('SELECT * FROM app_private.avatar_limits','42501','internal avatar quota state private');
    await fails('SELECT * FROM app_private.thought_limits','42501','internal thought rate state private');
    await fails('SELECT * FROM app_private.retired_avatar_ids','42501','retired avatar IDs private');
    for(const table of ['profile_details','profile_preferences','profile_avatars','thought_events']) {
      await fails(`DELETE FROM public.${table}`,'42501',table+' direct writes denied');
    }
    const initialSignals=await signals(); await user(a);
    const details=await rpc("save_my_profile(0,'Synthetic renamed','Self-chosen bounded bio','hug')");
    assert.equal(details.profile_id,pa); assert.equal(details.version,1);
    await ok(`SELECT display_name='Synthetic renamed' ok FROM public.users_profiles WHERE id='${pa}'`,'own name edit uses Auth-to-profile UUID');
    const profileSignals=await signals();
    assert.ok(profileSignals.every((s,i)=>s.revision===initialSignals[i].revision+1)); pass('name/presentation edit invalidates both');
    await user(b);
    await ok(`SELECT bio='Self-chosen bounded bio' AND mood_animal='hug' ok FROM public.profile_details WHERE profile_id='${pa}'`,'partner can read deliberate profile presentation');
    await rpc("save_my_profile(0,'Synthetic B renamed','','none')");
    await ok(`SELECT display_name='Synthetic renamed' ok FROM public.users_profiles WHERE id='${pa}'`,'partner profile RPC cannot rename actor A');
    await user(a);
    await fails("SELECT public.save_my_profile(0,'Stale','','none')",'40001','profile stale version rejected');
    await fails("SELECT public.save_my_profile(1,' A ','','none')",'22023','untrimmed name rejected');
    await fails("SELECT public.save_my_profile(1,'','','none')",'22023','empty name rejected');
    await fails("SELECT public.save_my_profile(1,repeat('A',81),'','none')",'22023','name length cap enforced');
    await fails("SELECT public.save_my_profile(1,'Valid',repeat('x',281),'none')",'23514','profile bio bounded at 280');
    await fails("SELECT public.save_my_profile(1,'Valid','','fox')",'23514','mood animal presentation allowlist enforced');
    await ok('SELECT count(*)=0 ok FROM public.moods','presentation animal never infers or writes mood state');
    const beforePrefs=await signals(); await user(a);
    await rpc("save_my_preferences(0,'dark','en','Private nickname')");
    const afterPrefs=await signals();
    assert.equal(afterPrefs.find(s=>s.profile_id===pb).revision,beforePrefs.find(s=>s.profile_id===pb).revision);
    assert.equal(afterPrefs.find(s=>s.profile_id===pa).revision,beforePrefs.find(s=>s.profile_id===pa).revision+1); pass('private preferences only invalidate actor');
    await user(b);
    await ok(`SELECT count(*)=0 ok FROM public.profile_preferences WHERE profile_id='${pa}'`,'peer cannot read themes/locales/private partner nickname');
    await rpc("save_my_preferences(0,'rose','fr',null)");
    await user(a);
    await ok(`SELECT partner_nickname='Private nickname' ok FROM public.profile_preferences WHERE profile_id='${pa}'`,'partner preference save cannot change own private nickname');
    await fails("SELECT public.save_my_preferences(0,'dark','en',null)",'40001','preferences stale version rejected');
    await fails("SELECT public.save_my_preferences(1,'unknown','en',null)",'23514','theme allowlist rejects unknown');
    await fails("SELECT public.save_my_preferences(1,'dark','ar',null)",'23514','locale allowlist rejects MSA substitution');
    await fails("SELECT public.save_my_preferences(1,'dark','en',repeat('n',81))",'23514','private nickname bounded');
    const themes=['dark','light','pastel','barcelona','tunisia','italy','lavender','ocean','forest','rose'];
    let prefsVersion=1;
    for(const theme of themes) for(const locale of ['en','fr','aeb-TN']) {
      const row=await rpc('save_my_preferences($1,$2,$3,null)',[prefsVersion++,theme,locale]);
      assert.equal(row.theme,theme); assert.equal(row.locale,locale);
    }
    pass('all exact 10 themes x 3 locales round-trip as own preferences');
    await fails("SELECT public.reserve_avatar(gen_random_uuid(),'image/svg+xml',null)",'23514','SVG avatar reservation denied');
    await fails("SELECT public.reserve_avatar(gen_random_uuid(),'audio/mpeg',null)",'23514','audio avatar reservation denied');
    const first=await rpc("reserve_avatar($1,'image/png',null)",[avatar]);
    assert.equal(Number(first.reserved_bytes),1048576); assert.equal(first.owner_id,pa);
    assert.ok(first.object_key.endsWith('/'+pa+'/'+avatar)); pass('avatar key uses stable profile UUID; full 1 MiB reserved');
    assert.deepEqual(await rpc("reserve_avatar($1,'image/png',null)",[avatar]),first); pass('avatar reservation same-ID retry stable');
    await fails(`SELECT public.reserve_avatar('${avatar}','image/jpeg',null)`,'23505','avatar retry payload conflict denied');
    await fails(`SELECT public.finalize_avatar('${avatar}')`,'22023','avatar cannot finalize absent real metadata');
    const insert = `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-avatars','${first.object_key}','{"size":1024,"mimetype":"image/png"}')`;
    for(const op of ['object.sign_upload_url','object.upload_signed','object.copy','storage.s3.upload','storage.tus.upload.create','storage.tus.upload.part','object.upload_update','object.move','']) {
      await operation(op); await fails(insert,'42501','avatar upload gate denies '+op);
    }
    await operation('object.upload');
    await fails("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-avatars','arbitrary/key','{}')",'42501','unreserved avatar object denied');
    await db.exec(insert);
    await db.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1",[first.object_key]);
    await operation('object.get_authenticated');
    await ok(`SELECT metadata->>'size'='1024' ok FROM storage.objects WHERE name='${first.object_key}'`,'avatar overwrite denied by no UPDATE policy');
    await operation('object.delete');
    await db.query('DELETE FROM storage.objects WHERE name=$1',[first.object_key]);
    await operation('object.get_authenticated');
    await ok(`SELECT count(*)=1 ok FROM storage.objects WHERE name='${first.object_key}'`,'unmarked avatar delete denied');
    await user(b);
    await ok(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${first.object_key}'`,'peer cannot read pending avatar bytes');
    await fails(`SELECT public.finalize_avatar('${avatar}')`,'42501','peer cannot finalize own avatar of another user');
    await fails(`SELECT public.mark_avatar_delete('${avatar}')`,'42501','peer cannot mark avatar deletion');
    await fails(`SELECT public.reserve_avatar('${avatar}','image/png',null)`,'23505','peer cannot steal avatar operation UUID');
    await user(a);
    // Deliberately malformed synthetic metadata inserted as local superuser only.
    for(const metadata of [{size:1048577,mimetype:'image/png'},{size:0,mimetype:'image/png'},{size:1024,mimetype:'image/jpeg'},{size:'bad',mimetype:'image/png'}]) {
      await db.exec('RESET ROLE'); await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2',[metadata,first.object_key]);
      await user(a); await fails(`SELECT public.finalize_avatar('${avatar}')`,'22023','avatar rejects metadata '+JSON.stringify(metadata));
    }
    await db.exec('RESET ROLE'); await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2',[{size:1024,mimetype:'image/png'},first.object_key]);
    const beforeFinalize=await signals(); await user(a);
    const ready=await rpc('finalize_avatar($1)',[avatar]);
    assert.equal(ready.status,'ready'); assert.equal(ready.active,true); assert.equal(Number(ready.reserved_bytes),1024); pass('avatar real metadata finalize activates and releases excess reservation');
    assert.deepEqual(await rpc('finalize_avatar($1)',[avatar]),ready); pass('avatar finalize retry stable');
    const afterFinalize=await signals(); assert.ok(afterFinalize.every((s,i)=>s.revision===beforeFinalize[i].revision+1)); pass('activation invalidates both once, retry no duplicate invalidation');
    await user(b);
    await ok(`SELECT count(*)=1 ok FROM public.profile_avatars WHERE id='${avatar}'`,'peer sees only ready active avatar metadata');
    await ok(`SELECT count(*)=1 ok FROM storage.objects WHERE name='${first.object_key}'`,'peer authenticated read ready active avatar allowed');
    for(const op of ['object.sign','object.sign_many','object.get_signed','object.list','object.list_v2','object.copy','storage.s3.object.get','storage.tus.upload.get','object.get_public','render.image_authenticated','']) {
      await operation(op); await ok(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${first.object_key}'`,'avatar read gate denies '+op);
    }
    await operation('object.delete_many'); await db.query('DELETE FROM storage.objects WHERE name=$1',[first.object_key]);
    await operation('object.get_authenticated');
    await ok(`SELECT count(*)=1 ok FROM storage.objects WHERE name='${first.object_key}'`,'peer cannot delete ready avatar bytes');
    await user(a);
    await fails("SELECT public.reserve_avatar(gen_random_uuid(),'image/png',null)",'40001','avatar replacement requires exact current active ID');
    const next=await rpc("reserve_avatar(gen_random_uuid(),'image/png',$1)",[avatar]);
    const stale=await rpc("reserve_avatar(gen_random_uuid(),'image/png',$1)",[avatar]);
    await fails(`SELECT public.reserve_avatar(gen_random_uuid(),'image/png','${avatar}')`,'54000','avatar cap counts active + two pending (3 retained / <=3 MiB)');
    await operation('object.upload');
    for(const row of [next,stale]) await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-avatars',$1,'{\"size\":2048,\"mimetype\":\"image/png\"}')",[row.object_key]);
    await operation('object.get_authenticated');
    await rpc('finalize_avatar($1)',[next.id]);
    await fails(`SELECT public.finalize_avatar('${stale.id}')`,'40001','competing pending avatar cannot overwrite newer active CAS');
    await user(b);
    await ok(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${first.object_key}'`,'replacement immediately revokes old avatar partner read');
    await ok(`SELECT count(*)=1 ok FROM storage.objects WHERE name='${next.object_key}'`,'replacement publishes exactly current avatar');
    await user(a);
    await fails(`SELECT public.finish_avatar_delete('${avatar}')`,'22023','avatar quota not released before actual object absence');
    await operation('object.delete_many'); await db.query('DELETE FROM storage.objects WHERE name=$1',[first.object_key]); await operation('object.get_authenticated');
    // Injection proves retirement and charged row removal share one transaction.
    await db.exec(`RESET ROLE; CREATE FUNCTION public.test_avatar_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure' USING errcode='P0001'; END $$;
      CREATE TRIGGER test_avatar_failure BEFORE DELETE ON public.profile_avatars FOR EACH ROW EXECUTE FUNCTION public.test_avatar_failure();`);
    await user(a); await fails(`SELECT public.finish_avatar_delete('${avatar}')`,'P0001','avatar retirement rolls back when metadata removal fails');
    await db.exec('RESET ROLE');
    await ok(`SELECT NOT EXISTS(SELECT 1 FROM app_private.retired_avatar_ids WHERE id='${avatar}') AND EXISTS(SELECT 1 FROM public.profile_avatars WHERE id='${avatar}') ok`,'failed avatar finish retains charge and no false retirement');
    await db.exec('DROP TRIGGER test_avatar_failure ON public.profile_avatars; DROP FUNCTION public.test_avatar_failure()');
    await user(a); await rpc('finish_avatar_delete($1)',[avatar]); await rpc('finish_avatar_delete($1)',[avatar]);
    await fails(`SELECT public.reserve_avatar('${avatar}','image/png','${next.id}')`,'23505','finished avatar operation permanently retired');
    await fails(`SELECT public.mark_avatar_delete('${avatar}')`,'42501','stale cleanup cannot delete new active avatar');
    await ok(`SELECT active ok FROM public.profile_avatars WHERE id='${next.id}'`,'new active avatar survives stale old-ID cleanup');
    await rpc('mark_avatar_delete($1)',[stale.id]);
    await operation('object.delete_many'); await db.query('DELETE FROM storage.objects WHERE name=$1',[stale.object_key]); await operation('object.get_authenticated');
    await rpc('finish_avatar_delete($1)',[stale.id]);
    // Retained count alone is not enough: test a fresh profile's daily/lifetime caps.
    await db.exec(`RESET ROLE; INSERT INTO app_private.avatar_limits(profile_id,day_at,reservations) VALUES('${pb}',(clock_timestamp() at time zone 'UTC')::date,10) ON CONFLICT(profile_id) DO UPDATE SET reservations=10,day_at=excluded.day_at;`);
    await user(b); await fails("SELECT public.reserve_avatar(gen_random_uuid(),'image/png',null)",'54000','avatar daily new-reservation cap prevents endless upload/discard churn');
    await db.exec(`RESET ROLE; DELETE FROM app_private.avatar_limits WHERE profile_id='${pb}'; INSERT INTO app_private.retired_avatar_ids(id,owner_id) SELECT gen_random_uuid(),'${pb}'::uuid FROM generate_series(1,10000);`);
    await user(b); await fails("SELECT public.reserve_avatar(gen_random_uuid(),'image/png',null)",'54000','avatar durable operation ledger lifetime bounded');
    await db.exec(`RESET ROLE; DELETE FROM app_private.retired_avatar_ids WHERE owner_id='${pb}'`);
    await user(a);
    const beforeThought=await signals(); await user(a);
    const event=await rpc('send_thought($1)',[thought]);
    assert.equal(event.sender_id,pa); assert.equal(event.recipient_id,pb); assert.equal(event.phrase_key,'affection.phrase01'); pass('thought derives exact actor/partner and compatible catalog key');
    await ok(`SELECT count(*)=0 ok FROM public.thought_events WHERE id='${thought}'`,'sender cannot query recipient inbox');
    assert.deepEqual(await rpc('send_thought($1)',[thought]),event); pass('same retired operation retry preserves phrase/time/sequence; no duplicate');
    const afterThought=await signals(); assert.ok(afterThought.every((s,i)=>s.revision===beforeThought[i].revision+1)); pass('one persisted thought invalidates both; retry does not');
    await user(a);
    await fails("SELECT public.send_thought(gen_random_uuid())",'P0001','new thought blocked by server cooldown, not tap trust');
    await fails(`SELECT public.mark_thought_read('${thought}')`,'42501','sender cannot mark recipient inbox read');
    await user(b);
    await ok(`SELECT phrase_key='affection.phrase01' AND read_at IS NULL ok FROM public.thought_events WHERE id='${thought}'`,'recipient own inbox sees persisted event');
    await fails(`SELECT public.send_thought('${thought}')`,'23505','cross-user operation reuse denied');
    const beforeRead=await signals(); await user(b);
    const readEvent=await rpc('mark_thought_read($1)',[thought]); assert.ok(readEvent.read_at);
    assert.deepEqual(await rpc('mark_thought_read($1)',[thought]),readEvent); pass('recipient mark-read stable retry');
    const afterRead=await signals();
    assert.equal(afterRead.find(s=>s.profile_id===pa).revision,beforeRead.find(s=>s.profile_id===pa).revision);
    assert.equal(afterRead.find(s=>s.profile_id===pb).revision,beforeRead.find(s=>s.profile_id===pb).revision+1); pass('read state only invalidates recipient');
    for(let seq=2;seq<=11;seq++) {
      await db.exec(`RESET ROLE; UPDATE app_private.thought_limits SET last_sent_at=clock_timestamp()-interval '31 seconds' WHERE profile_id='${pa}'`);
      await user(a); const row=await rpc('send_thought($1)',[randomUUID()]);
      assert.equal(row.phrase_key,'affection.phrase'+String((seq-1)%10+1).padStart(2,'0'));
    }
    pass('ten exact affection phrase keys rotate deterministically and wrap');
    await db.exec(`RESET ROLE; UPDATE app_private.thought_limits SET last_sent_at=clock_timestamp()-interval '31 seconds',daily_count=50 WHERE profile_id='${pa}'`);
    await user(a); await fails('SELECT public.send_thought(gen_random_uuid())','54000','thought daily cap enforced');
    const retryAfterRead=await rpc('send_thought($1)',[thought]); assert.deepEqual(retryAfterRead,event); pass('original operation stable despite later sends, reads and exhausted daily quota; private read timestamp not leaked');
    await db.exec(`RESET ROLE; UPDATE app_private.thought_limits SET daily_count=1,total_count=10000 WHERE profile_id='${pa}'`);
    await user(a); await fails('SELECT public.send_thought(gen_random_uuid())','54000','thought lifetime cap bounds event/idempotency ledger');
    await db.exec(`RESET ROLE; UPDATE app_private.write_limits SET requests=120,minute_at=date_trunc('minute',clock_timestamp()) WHERE profile_id='${pa}'`);
    await user(a); await fails(`SELECT public.send_thought('${thought}')`,'P0001','base successful-RPC write cap also gates retries');
    for(const account of [outsider,anonymous]) {
      await user(account);
      for(const table of ['profile_details','profile_preferences','profile_avatars','thought_events']) await ok(`SELECT count(*)=0 ok FROM public.${table}`,'unpaired/anonymous-Auth identity cannot read '+table);
      await fails('SELECT public.send_thought(gen_random_uuid())','42501','unpaired/anonymous-Auth identity cannot send');
      await fails("SELECT public.save_my_profile(0,'No impersonation','','none')",'42501','unpaired/anonymous-Auth identity cannot edit profile');
    }
    await user('', 'anon');
    await fails('SELECT * FROM public.thought_events','42501','signed-out inbox denied');
    await fails('SELECT public.send_thought(gen_random_uuid())','42501','signed-out RPC denied');
    await db.exec('RESET ROLE; COMMIT');
    const snapshot = async () => {
      const tables=['public.users_profiles','public.profile_details','public.profile_preferences','public.profile_avatars','public.thought_events','public.content_items','public.media_files','public.sync_signals','app_private.retired_media_ids','app_private.retired_avatar_ids','app_private.avatar_limits','app_private.thought_limits'];
      const result={};
      for(const table of tables) result[table]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) state FROM ${table} t`)).rows[0].state;
      return result;
    };
    const before=await snapshot();
    assert.ok(before['public.thought_events'].length>=11); assert.equal(before['public.profile_avatars'].length,1);
    await db.exec(extension); pass('002 exact second application over populated profiles/preferences/active avatar/events/retirement');
    assert.deepEqual(await snapshot(),before); pass('002 rerun preserves all populated payloads, quota/operation markers, timestamps, versions and signals');
    await db.exec(catalogSQL); pass('extended catalog still correct after populated rerun');
    await db.exec(base); await db.exec(extension);
    assert.deepEqual(await snapshot(),before); pass('full 001 then 002 chain rerun preserves populated state and restores extension helper grants');
    await db.exec(catalogSQL); pass('extended catalog verifies after full-chain rerun');
    // Catalog negative: exact six-policy allowlist fails closed on an extra policy.
    await db.exec('BEGIN; CREATE POLICY unexpected_avatar_bypass ON storage.objects FOR SELECT TO authenticated USING(true)');
    await fails(extensionCatalog.replace('begin transaction read only;','').replace(/commit;\s*$/,''),'P0001','extended verifier rejects extra permissive Storage policy');
    await db.exec('ROLLBACK');
    await db.exec(`UPDATE app_private.write_limits SET requests=0; UPDATE app_private.thought_limits SET daily_count=1,total_count=11,last_sent_at=clock_timestamp()-interval '31 seconds' WHERE profile_id='${pa}'`);
    await user(a);
    const preserved=await rpc('send_thought($1)',[thought]); assert.equal(preserved.phrase_key,'affection.phrase01'); pass('thought retry remains same event after migration reapply');
    await db.exec('BEGIN');
    await fails(`SELECT public.reserve_avatar('${avatar}','image/png','${next.id}')`,'23505','retired avatar UUID still cannot replay after full-chain reapply');
    const fresh=await rpc("reserve_avatar(gen_random_uuid(),'image/webp',$1)",[next.id]);
    assert.ok(fresh.id!==avatar && fresh.id!==stale.id); assert.equal(fresh.status,'pending'); pass('fresh avatar UUID and allowed WebP reservation work after reapply');
    await rpc('finish_avatar_delete($1)',[avatar]);
    await ok(`SELECT active ok FROM public.profile_avatars WHERE id='${next.id}'`,'stale retired finish remains harmless after full-chain reapply');
    await db.exec('RESET ROLE; ROLLBACK; RESET ROLE');
    await ok(`SELECT count(*)=1 ok FROM app_private.retired_media_ids WHERE id='${oldMedia}'`,'base retirement data preserved through extension');
    await ok(`SELECT body='synthetic base retained' ok FROM public.content_items WHERE id='${journal}'`,'base content retained; no fake journal avatar rows');
    await db.exec(catalogSQL);
    // Committed sequential ABA regression: no browser cancellation or timing assumptions.
    // B has no active avatar; these are normal actor RPCs and Storage ABI operations.
    await db.exec('RESET ROLE; UPDATE app_private.write_limits SET requests=0');
    await user(b);
    const uploadAvatar = async row => {
      await operation('object.upload');
      await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-avatars',$1,'{\"size\":1024,\"mimetype\":\"image/png\"}')",[row.object_key]);
      await operation('object.get_authenticated');
    };
    const removeAvatar = async row => {
      await rpc('mark_avatar_delete($1)',[row.id]);
      await operation('object.delete_many');
      await db.query('DELETE FROM storage.objects WHERE name=$1',[row.object_key]);
      await operation('object.get_authenticated');
      await rpc('finish_avatar_delete($1)',[row.id]);
    };
    const staleAvatar = async (row,label) => {
      await db.exec('BEGIN');
      await fails(`SELECT public.finalize_avatar('${row.id}')`,'40001',label);
      await db.exec('COMMIT');
    };
    const oldNull=await rpc("reserve_avatar(gen_random_uuid(),'image/png',null)");
    const newNull=await rpc("reserve_avatar(gen_random_uuid(),'image/png',null)");
    await uploadAvatar(oldNull); await uploadAvatar(newNull);
    await rpc('finalize_avatar($1)',[newNull.id]);
    await staleAvatar(oldNull,'old NULL reservation conflicts while winner active');
    await removeAvatar(newNull);
    await staleAvatar(oldNull,'old NULL reservation stays stale after winner cleared and finished (ABA)');
    await user(a);
    await ok(`SELECT count(*)=0 ok FROM public.profile_avatars WHERE id='${oldNull.id}'`,'ABA loser remains partner-invisible after active clear');
    await ok(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${oldNull.object_key}'`,'ABA loser bytes remain partner-invisible after active clear');
    await user(b);
    await ok(`SELECT status='pending' AND NOT active AND reserved_bytes=1048576 ok FROM public.profile_avatars WHERE id='${oldNull.id}'`,'invalidated pending retains full charge and owner cleanup visibility');
    const invalidatedRetry=await rpc("reserve_avatar($1,'image/png',null)",[oldNull.id]);
    assert.equal(invalidatedRetry.publication_invalidated,true);
    pass('same-ID reservation retry reports invalidation without reviving publication authority');
    await db.exec('RESET ROLE'); await db.exec(extension); await db.exec(catalogSQL);
    await user(b);
    await staleAvatar(oldNull,'old NULL reservation stays stale after exact migration reapply');
    const freshNull=await rpc("reserve_avatar(gen_random_uuid(),'image/png',null)");
    await uploadAvatar(freshNull);
    const freshReady=await rpc('finalize_avatar($1)',[freshNull.id]);
    assert.equal(freshReady.active,true); assert.equal(Number(freshReady.reserved_bytes),1024);
    pass('fresh NULL intent still publishes normally after ABA clear and reapply');
    await removeAvatar(oldNull);
    await db.exec('BEGIN');
    await fails(`SELECT public.reserve_avatar('${oldNull.id}','image/png','${freshNull.id}')`,'23505','invalidated pending cleanup permanently retires its UUID');
    await db.exec('COMMIT');
    const oldPointer=await rpc("reserve_avatar(gen_random_uuid(),'image/png',$1)",[freshNull.id]);
    const newPointer=await rpc("reserve_avatar(gen_random_uuid(),'image/png',$1)",[freshNull.id]);
    await uploadAvatar(oldPointer); await uploadAvatar(newPointer);
    // Failure after the invalidation statement must roll back winner, loser and charges together.
    await db.exec(`RESET ROLE; CREATE FUNCTION public.test_publish_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='ready' THEN RAISE EXCEPTION 'synthetic publish failure' USING errcode='P0001'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_publish_failure BEFORE UPDATE ON public.profile_avatars FOR EACH ROW EXECUTE FUNCTION public.test_publish_failure();`);
    await user(b); await db.exec('BEGIN');
    await fails(`SELECT public.finalize_avatar('${newPointer.id}')`,'P0001','failed publication rolls back competing pending invalidation');
    await db.exec('COMMIT');
    await ok(`SELECT active AND status='ready' ok FROM public.profile_avatars WHERE id='${freshNull.id}'`,'failed publication preserves original active avatar');
    await ok(`SELECT count(*)=2 ok FROM public.profile_avatars WHERE id IN ('${oldPointer.id}','${newPointer.id}') AND status='pending' AND reserved_bytes=1048576`,'failed publication preserves both pending reservations and byte charges');
    await ok(`SELECT count(*)=2 ok FROM public.profile_avatars WHERE id IN ('${oldPointer.id}','${newPointer.id}') AND NOT publication_invalidated`,'failed publication rolls back invalidation bits on both fresh pending operations');
    await db.exec('RESET ROLE; DROP TRIGGER test_publish_failure ON public.profile_avatars; DROP FUNCTION public.test_publish_failure()');
    await user(b);
    await rpc('finalize_avatar($1)',[newPointer.id]);
    await staleAvatar(oldPointer,'old non-NULL expected pointer cannot overwrite replacement winner');
    await removeAvatar(freshNull); await removeAvatar(newPointer);
    await staleAvatar(oldPointer,'old non-NULL expected pointer remains stale after later delete and finish');
    await removeAvatar(oldPointer);
    const freshAfterCycles=await rpc("reserve_avatar(gen_random_uuid(),'image/png',null)");
    await uploadAvatar(freshAfterCycles);
    assert.equal((await rpc('finalize_avatar($1)',[freshAfterCycles.id])).active,true);
    pass('fresh intent publishes after NULL and non-NULL cycles with normal quota accounting');
    await removeAvatar(freshAfterCycles);
    await db.exec('RESET ROLE');
    await ok(`SELECT count(*)=6 ok FROM app_private.retired_avatar_ids WHERE owner_id='${pb}'`,'all six ABA regression operation UUIDs permanently retired after cleanup');
    await ok(`SELECT count(*)=0 ok FROM public.profile_avatars WHERE owner_id='${pb}'`,'ABA regression cleanup releases retained operation charges only after object removal');
    await ok(`SELECT reservations=6 ok FROM app_private.avatar_limits WHERE profile_id='${pb}'`,'ABA retries failures and cleanup do not inflate or reset daily reservation quota');
    await db.exec(catalogSQL);
    // Model the pre-fix table shape, preserving populated ready/quota/retirement state.
    // The frozen actual old migration is separately exercised by the parent regression.
    await user(b);
    const legacyPending=await rpc("reserve_avatar(gen_random_uuid(),'image/png',null)");
    await uploadAvatar(legacyPending);
    await db.exec('RESET ROLE; ALTER TABLE public.profile_avatars DROP COLUMN publication_invalidated');
    await db.exec(extension); await db.exec(catalogSQL); await user(b);
    await staleAvatar(legacyPending,'first upgrade conservatively invalidates pre-fix pending publication history');
    await ok(`SELECT publication_invalidated AND reserved_bytes=1048576 AND status='pending' ok FROM public.profile_avatars WHERE id='${legacyPending.id}'`,'first upgrade retains legacy pending cleanup and full quota charge');
    await user(a);
    await ok(`SELECT active AND status='ready' AND NOT publication_invalidated ok FROM public.profile_avatars WHERE id='${next.id}'`,'first upgrade preserves populated ready active avatar authority');
    await user(b);
    const afterUpgrade=await rpc("reserve_avatar(gen_random_uuid(),'image/png',null)");
    await uploadAvatar(afterUpgrade);
    await db.exec('RESET ROLE'); await db.exec(extension); await user(b);
    await ok(`SELECT NOT publication_invalidated ok FROM public.profile_avatars WHERE id='${afterUpgrade.id}'`,'exact reapply does not invalidate a fresh unsuperseded pending intent');
    await rpc('finalize_avatar($1)',[afterUpgrade.id]);
    await staleAvatar(legacyPending,'legacy pending remains stale after fresh winner and repeated migration');
    await removeAvatar(legacyPending); await removeAvatar(afterUpgrade);
    await db.exec('RESET ROLE'); await db.exec(catalogSQL);
    console.log(`RESULT ${checks} offline PostgreSQL checks passed. Supabase HTTP/Auth/Storage bytes/Realtime, actual parallel sessions and native Web Push NOT tested.`);
  } catch(e) {
    console.error('FAIL',e.code||'',e.message,'where',e.where||'','internalQuery',e.internalQuery||'');
    process.exitCode=1;
  } finally { await db.close(); }
}
