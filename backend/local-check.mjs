// Offline PostgreSQL execution, NOT a Supabase integration test.
// Dependency is intentionally outside the app: see CONTRACT.md.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.CONNECTION_TEST_PACKAGE_JSON || import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
async function assert(sql, message) {
  const { rows } = await db.query(sql);
  if (rows[0]?.ok !== true) throw new Error(message + ': ' + JSON.stringify(rows));
  checks++; console.log('PASS ' + message);
}
async function fails(sql, code, message) {
  await db.exec('SAVEPOINT negative_test');
  try {
    await db.exec(sql);
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT negative_test');
    if (e.code !== code) throw new Error(message + ': expected ' + code + ', got ' + e.code + ' ' + e.message);
    checks++; console.log('PASS ' + message); return;
  }
  throw new Error(message + ': unexpectedly succeeded');
}
async function asUser(id, role='authenticated') {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id}',false); SELECT set_config('request.jwt.claim.role','${role}',false); SELECT set_config('test.storage_operation','object.get_authenticated',false); SET ROLE ${role};`);
}
try {
  // Minimal local auth/storage ABI fixtures only. No HTTP/Auth/Storage server exists.
  const fixtureSQL=`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid primary key,is_anonymous boolean default false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    GRANT USAGE ON SCHEMA auth,public,storage TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    -- Local models of the officially documented managed Storage operation ABI.
    CREATE FUNCTION storage.allow_only_operation(op text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT coalesce(regexp_replace(current_setting('test.storage_operation',true),'^storage[.]','')=regexp_replace(op,'^storage[.]',''),false) $$;
    CREATE FUNCTION storage.allow_any_operation(ops text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM unnest(ops) op WHERE storage.allow_only_operation(op)) $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
  `;
  await db.exec(fixtureSQL);
  const migration=readFileSync(new URL('./001_shared_app.sql',import.meta.url),'utf8');
  await db.exec(migration);
  console.log('PASS migration executed in embedded PostgreSQL'); checks++;
  await db.exec(migration);
  console.log('PASS exact migration reapplied'); checks++;
  await db.exec(readFileSync(new URL('./verify.sql',import.meta.url),'utf8'));
  console.log('PASS read-only catalog verification'); checks++;
  // Random identities only; no emails/passwords or real app data.
  const ids=(await db.query('SELECT gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() outsider,gen_random_uuid() journal,gen_random_uuid() round,gen_random_uuid() flower,gen_random_uuid() media')).rows[0];
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[ids.a,ids.b,ids.outsider]);
  await db.query("SELECT public.admin_enroll_pair($1,'Synthetic A',$2,'Synthetic B')",[ids.a,ids.b]);
  await db.query("SELECT public.admin_enroll_pair($1,'Synthetic A',$2,'Synthetic B')",[ids.a,ids.b]);
  await db.exec('BEGIN');
  await asUser(ids.a);
  await assert("SELECT count(*)=2 ok FROM public.users_profiles",'enrolled profiles readable');
  await assert("SELECT count(*)=1 ok FROM public.sync_signals",'invalidation rows recipient scoped');
  await db.query("SELECT public.save_content($1,0,'{\"item_type\":\"journal\",\"body\":\"private A\"}')",[ids.journal]);
  await db.query("SELECT public.start_round($1,'q1')",[ids.round]);
  await db.query("SELECT public.submit_round_answer($1,'blind A')",[ids.round]);
  await asUser(ids.b);
  await assert(`SELECT count(*)=0 ok FROM public.content_items WHERE id='${ids.journal}'`,'B cannot read A private journal');
  await assert(`SELECT count(*)=0 ok FROM public.round_answers WHERE round_id='${ids.round}'`,'raw answers hidden before both submit');
  await fails(`SELECT public.save_content('${ids.journal}',1,'{"item_type":"journal","body":"stolen"}')`,'42501','cross-owner write rejected');
  await fails("INSERT INTO public.content_items(id) VALUES(gen_random_uuid())",'42501','direct table insert denied');
  await fails(`SELECT public.admin_enroll_pair('${ids.a}','A','${ids.b}','B')`,'42501','browser cannot enroll');
  await fails(`SELECT app_private.begin_write()`,'42501','private mutation helper not executable');
  await db.query("SELECT public.submit_round_answer($1,'blind B')",[ids.round]);
  await assert(`SELECT count(*)=2 ok FROM public.round_answers WHERE round_id='${ids.round}'`,'both answers visible after second submission');
  await assert(`SELECT revealed_at IS NOT NULL ok FROM public.question_rounds WHERE id='${ids.round}'`,'reveal timestamp server persisted');
  await fails(`SELECT public.submit_round_answer('${ids.round}','changed')`,'23505','submitted answers immutable');
  await db.query("SELECT public.submit_round_answer($1,'blind B')",[ids.round]);
  await assert(`SELECT count(*)=2 ok FROM public.round_answers WHERE round_id='${ids.round}'`,'answer retry idempotent');
  await asUser(ids.a);
  await db.query("SELECT public.save_content($1,1,'{\"item_type\":\"journal\",\"visibility\":\"shared\",\"body\":\"shared A\"}')",[ids.journal]);
  await fails(`SELECT public.save_content('${ids.journal}',1,'{"item_type":"journal"}')`,'40001','stale version rejected');
  await fails(`SELECT public.save_content(gen_random_uuid(),0,'{"item_type":"journal","visibility":"public"}')`,'23514','visibility enum enforced');
  await fails(`SELECT public.save_content(gen_random_uuid(),0,'{"item_type":"dedication","url":"https://user:secret@example.invalid"}')`,'23514','URL credentials rejected');
  await db.query("SELECT public.plant_flower($1,'jasmine')",[ids.flower]);
  await db.query("SELECT public.reserve_media($1,$2,'synthetic.png','image/png')",[ids.media,ids.journal]);
  await assert(`SELECT reserved_bytes=26214400 ok FROM public.media_files WHERE id='${ids.media}'`,'pending upload reserves maximum object bytes');
  const key=(await db.query('SELECT object_key FROM public.media_files WHERE id=$1',[ids.media])).rows[0].object_key;
  await db.exec("SELECT set_config('test.storage_operation','object.sign_upload_url',false)");
  await fails(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-private','${key}','{}')`,'42501','signed-upload authorization denied even for valid pending key');
  await db.exec("SELECT set_config('test.storage_operation','object.upload',false)");
  await fails("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-private','unreserved/key','{}')",'42501','unreserved Storage upload denied');
  await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('connection-private',$1,'{\"size\":1024,\"mimetype\":\"image/png\"}')",[key]);
  await db.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING id",[key]);
  await db.exec("SELECT set_config('test.storage_operation','object.get_authenticated',false)");
  // UPDATE with no matching RLS policy correctly affects zero rows, not an SQL error.
  await assert(`SELECT (metadata->>'size')='1024' ok FROM storage.objects WHERE name='${key}'`,'Storage overwrite denied by RLS');
  await asUser(ids.b);
  await assert(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${key}'`,'peer cannot read pending object even for shared entry');
  await asUser(ids.a);
  await db.query('SELECT public.finalize_media($1)',[ids.media]);
  await assert(`SELECT reserved_bytes=1024 AND size_bytes=1024 AND status='ready' ok FROM public.media_files WHERE id='${ids.media}'`,'finalization verifies actual metadata and releases excess reservation');
  await asUser(ids.b);
  await assert(`SELECT count(*)=1 ok FROM public.content_items WHERE id='${ids.journal}'`,'shared journal visible to partner');
  await assert(`SELECT count(*)=1 ok FROM storage.objects WHERE name='${key}'`,'ready shared media readable');
  await db.exec("SELECT set_config('test.storage_operation','object.sign',false)");
  await assert(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${key}'`,'signed download URL authorization denied for partner');
  await db.exec("SELECT set_config('test.storage_operation','object.get_authenticated',false)");
  await db.query("SELECT public.change_flower($1,1,'water')",[ids.flower]);
  await assert(`SELECT water=1 AND version=2 ok FROM public.flowers WHERE id='${ids.flower}'`,'partner can water shared garden');
  await fails(`SELECT public.change_flower('${ids.flower}',2,'delete')`,'42501','partner cannot delete another planter flower');
  await asUser(ids.a);
  await db.query("SELECT public.save_content($1,2,'{\"item_type\":\"journal\",\"visibility\":\"private\",\"body\":\"unshared\"}')",[ids.journal]);
  await asUser(ids.b);
  await assert(`SELECT count(*)=0 ok FROM storage.objects WHERE name='${key}'`,'unsharing immediately gates new authenticated object reads');
  await asUser(ids.a);
  await db.query('SELECT public.mark_media_delete($1)',[ids.media]);
  await fails(`SELECT public.finish_media_delete('${ids.media}')`,'22023','metadata not deleted before bytes removed');
  // Local metadata row stands in for Storage API only; NEVER do this on Supabase.
  await db.exec("SELECT set_config('test.storage_operation','object.delete_many',false)");
  await db.query('DELETE FROM storage.objects WHERE name=$1',[key]);
  await db.exec("SELECT set_config('test.storage_operation','object.get_authenticated',false)");
  // Force a failure AFTER retirement insertion, proving both SQL changes roll back.
  await db.exec(`RESET ROLE;
    CREATE FUNCTION public.test_reject_media_removal() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic delete failure' USING errcode='P0001'; END $$;
    CREATE TRIGGER test_reject_media_removal BEFORE DELETE ON public.media_files
      FOR EACH ROW EXECUTE FUNCTION public.test_reject_media_removal();`);
  await asUser(ids.a);
  await fails(`SELECT public.finish_media_delete('${ids.media}')`,'P0001','finish failure after retirement insertion rolls back');
  await db.exec('RESET ROLE');
  await assert(`SELECT NOT EXISTS(SELECT 1 FROM app_private.retired_media_ids WHERE id='${ids.media}')
    AND EXISTS(SELECT 1 FROM public.media_files WHERE id='${ids.media}' AND status='deleting' AND reserved_bytes=1024) ok`,
    'failed finish keeps charged metadata and leaves no retirement marker');
  await db.exec('DROP TRIGGER test_reject_media_removal ON public.media_files; DROP FUNCTION public.test_reject_media_removal()');
  await asUser(ids.a);
  await db.query('SELECT public.finish_media_delete($1)',[ids.media]);
  await assert(`SELECT count(*)=0 ok FROM public.media_files WHERE id='${ids.media}'`,'delete lifecycle releases metadata and quota after object removal');
  await fails(`SELECT public.reserve_media('${ids.media}','${ids.journal}','synthetic.png','image/png')`,'23505','retired media ID cannot replay reservation for same parent');
  const otherParent=(await db.query("SELECT * FROM public.save_content(gen_random_uuid(),0,'{\"item_type\":\"journal\",\"body\":\"retirement regression\"}')")).rows[0].id;
  await fails(`SELECT public.reserve_media('${ids.media}','${otherParent}','synthetic.png','image/png')`,'23505','retired media ID cannot be reassigned to changed parent');
  await fails('SELECT * FROM app_private.retired_media_ids','42501','client cannot read retired media IDs');
  await fails(`INSERT INTO app_private.retired_media_ids(id) VALUES(gen_random_uuid())`,'42501','client cannot write retired media IDs');
  await fails(`DELETE FROM app_private.retired_media_ids WHERE id='${ids.media}'`,'42501','client cannot erase retired media IDs');
  await db.query('SELECT public.finish_media_delete($1)',[ids.media]);
  await db.exec('RESET ROLE');
  await assert(`SELECT (SELECT count(*) FROM app_private.retired_media_ids WHERE id='${ids.media}')=1
    AND (SELECT coalesce(sum(reserved_bytes),0) FROM public.media_files)=0 ok`,
    'repeat finish retains one durable marker without charging bytes');
  await asUser(ids.a);
  await db.exec('RESET ROLE');
  const enrolled=(await db.query('SELECT id FROM public.users_profiles WHERE auth_user_id=$1',[ids.a])).rows[0].id;
  await fails(`INSERT INTO public.pair_members(pair_id,slot,profile_id) SELECT pair_id,3,profile_id FROM public.pair_members LIMIT 1`,'23514','third membership slot forbidden by constraint');
  await asUser(ids.a);
  await db.query("SELECT public.save_mood(0,'calm','synthetic private','private')");
  await asUser(ids.b);
  await assert(`SELECT count(*)=0 ok FROM public.moods WHERE profile_id='${enrolled}'`,'private mood hidden from partner');
  await asUser(ids.a);
  await db.query("SELECT public.save_mood(1,'hopeful','synthetic shared','shared')");
  await asUser(ids.b);
  await assert(`SELECT mood='hopeful' AND version=2 ok FROM public.moods WHERE profile_id='${enrolled}'`,'shared mood persisted and readable');
  await asUser(ids.a);
  for (const type of ['question_note','dedication','track']) {
    const data={item_type:type,visibility:'shared',title:'Synthetic '+type};
    if(type==='question_note') {data.question_id='q2';data.body='async note';}
    if(type==='dedication') data.url='https://example.invalid/song';
    await db.query('SELECT public.save_content(gen_random_uuid(),0,$1::jsonb)',[JSON.stringify(data)]);
  }
  await assert("SELECT count(*)=3 ok FROM public.content_items WHERE item_type IN ('question_note','dedication','track')",'asynchronous notes dedications and playlists persisted');
  const privateSignal=(await db.query('SELECT revision FROM public.sync_signals')).rows[0].revision;
  await asUser(ids.b);
  const partnerSignal=(await db.query('SELECT revision FROM public.sync_signals')).rows[0].revision;
  await asUser(ids.a);
  const extra=(await db.query("SELECT (public.save_content(gen_random_uuid(),0,'{\"item_type\":\"journal\",\"body\":\"only A\"}')).id")).rows[0].id;
  await asUser(ids.b);
  await assert(`SELECT revision=${partnerSignal} ok FROM public.sync_signals`,'private mutation does not notify partner');
  await asUser(ids.a);
  await db.query('SELECT public.delete_content($1,1)',[extra]);
  await assert(`SELECT count(*)=0 ok FROM public.content_items WHERE id='${extra}'`,'deleted content absent from ordinary reads');
  const quotaIDs=[];
  for(let i=0;i<4;i++) {
    const row=(await db.query("SELECT (public.reserve_media(gen_random_uuid(),$1,'quota.png','image/png')).id",[ids.journal])).rows[0];
    quotaIDs.push(row.id);
  }
  await fails(`SELECT public.reserve_media(gen_random_uuid(),'${ids.journal}','over.png','image/png')`,'54000','pending reservations cannot exceed 100 MiB');
  for (let i=0;i<23;i++) await db.query("SELECT public.plant_flower(gen_random_uuid(),'orchid')");
  await fails("SELECT public.plant_flower(gen_random_uuid(),'orchid')",'54000','garden limited to 24 active flowers per planter');
  const openRound=(await db.query("SELECT (public.start_round(gen_random_uuid(),'q2')).id")).rows[0].id;
  await fails("SELECT public.start_round(gen_random_uuid(),'q3')",'23505','only one open shared round allowed');
  await fails(`SELECT public.submit_round_answer('${openRound}','')`,'23514','empty submitted answer rejected');
  await db.exec('RESET ROLE');
  await db.query("UPDATE app_private.write_limits SET minute_at=date_trunc('minute',clock_timestamp()),requests=120 WHERE profile_id=$1",[enrolled]);
  await asUser(ids.a);
  await fails("SELECT public.save_mood(2,'calm','','private')",'P0001','successful mutation rate cap enforced');
  await asUser(ids.outsider);
  await assert('SELECT count(*)=0 ok FROM public.content_items','unenrolled authenticated user reads no content');
  await assert('SELECT count(*)=0 ok FROM public.question_bank','unenrolled user cannot read question bank');
  await fails(`SELECT public.start_round(gen_random_uuid(),'q1')`,'42501','unenrolled user cannot mutate');
  await asUser('', 'anon');
  await fails('SELECT * FROM public.content_items','42501','anonymous table reads denied');
  await fails(`SELECT public.start_round(gen_random_uuid(),'q1')`,'42501','anonymous RPC denied');
  await db.exec('RESET ROLE; ROLLBACK');
  // Independent database: populated retirement state must survive exact reapply.
  // Do not commit the main suite's rollback-only fixtures by reapplying there.
  const rerunDb=new PGlite();
  try {
    await rerunDb.exec(fixtureSQL);
    await rerunDb.exec(migration);
    await rerunDb.query('INSERT INTO auth.users(id) VALUES($1),($2)',[ids.a,ids.b]);
    await rerunDb.query("SELECT public.admin_enroll_pair($1,'Synthetic A',$2,'Synthetic B')",[ids.a,ids.b]);
    const ownerSQL=`SELECT set_config('request.jwt.claim.sub','${ids.a}',false);
      SELECT set_config('request.jwt.claim.role','authenticated',false); SET ROLE authenticated;`;
    await rerunDb.exec(ownerSQL);
    await rerunDb.query("SELECT public.save_content($1,0,'{\"item_type\":\"journal\"}')",[ids.journal]);
    await rerunDb.query("SELECT public.reserve_media($1,$2,'retired.png','image/png')",[ids.media,ids.journal]);
    await rerunDb.query('SELECT public.mark_media_delete($1)',[ids.media]);
    await rerunDb.query('SELECT public.finish_media_delete($1)',[ids.media]);
    await rerunDb.exec('RESET ROLE');
    const snapshotSQL=`SELECT jsonb_build_object(
      'retired',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app_private.retired_media_ids r),
      'content',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.content_items c),
      'media',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]'::jsonb) FROM public.media_files m)
    ) state`;
    const before=(await rerunDb.query(snapshotSQL)).rows[0].state;
    if(before.retired?.length!==1 || before.retired[0].id!==ids.media || before.media.length!==0)
      throw new Error('independent retirement fixture was not populated correctly');
    await rerunDb.exec(migration);
    const after=(await rerunDb.query(snapshotSQL)).rows[0].state;
    if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error('populated retirement state changed on exact reapply');
    checks++; console.log('PASS independent populated retirement marker and timestamp survive exact migration reapply');
    await rerunDb.exec(readFileSync(new URL('./verify.sql',import.meta.url),'utf8'));
    checks++; console.log('PASS independent populated rerun catalog retains private retirement RLS/grants');
    await rerunDb.exec(ownerSQL);
    for(const parent of [ids.journal,(await rerunDb.query("SELECT * FROM public.save_content(gen_random_uuid(),0,'{\"item_type\":\"journal\"}')")).rows[0].id]) {
      try {
        await rerunDb.query("SELECT public.reserve_media($1,$2,'retired.png','image/png')",[ids.media,parent]);
        throw new Error('retired UUID unexpectedly reusable after migration reapply');
      } catch(e) { if(e.code!=='23505') throw e; }
    }
    checks++; console.log('PASS independent reapplied retirement denies same-parent and changed-parent reservation');
    const fresh=(await rerunDb.query("SELECT * FROM public.reserve_media(gen_random_uuid(),$1,'fresh.png','image/png')",[ids.journal])).rows[0];
    try {
      await rerunDb.query('SELECT public.mark_media_delete($1)',[ids.media]);
      throw new Error('stale mark unexpectedly found retired UUID');
    } catch(e) { if(e.code!=='42501') throw e; }
    await rerunDb.query('SELECT public.finish_media_delete($1)',[ids.media]);
    const current=(await rerunDb.query('SELECT * FROM public.media_files WHERE id=$1',[fresh.id])).rows[0];
    if(current.status!=='pending' || Number(current.reserved_bytes)!==26214400 || fresh.id===ids.media
      || fresh.object_key.endsWith('/'+ids.media)) throw new Error('stale old-ID operations affected fresh upload');
    checks++; console.log('PASS fresh UUID upload works and stale old-ID mark/finish cannot target it');
  } finally { await rerunDb.close(); }
  console.log(`RESULT ${checks} offline PostgreSQL checks passed. Supabase HTTP/Auth/Storage/Realtime and true multi-session concurrency NOT tested.`);
} catch(e) {
  console.error('FAIL',e.code || '',e.message, 'position',e.position,'internalPosition',e.internalPosition,'internalQuery',e.internalQuery,'where',e.where);
  if(e.position && e.query) console.error(e.query.slice(Math.max(0,Number(e.position)-250),Number(e.position)+250));
  process.exitCode=1;
} finally { await db.close(); }
