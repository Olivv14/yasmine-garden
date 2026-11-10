// Actual PostgreSQL execution offline; provider HTTP is NOT exercised here.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID,createECDH,randomBytes} from 'node:crypto';
const require=createRequire(process.env.CONNECTION_TEST_PACKAGE_JSON||import.meta.url);
const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function fails(sql,args,code,label){await db.exec('SAVEPOINT negative');try{await q(sql,args);}catch(e){await db.exec('ROLLBACK TO SAVEPOINT negative');check(e.code===code,label+' ['+e.code+']');return;}throw new Error(label+' unexpectedly passed');}
async function as(id='',role='authenticated'){await db.exec('RESET ROLE');await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);await db.exec('SET ROLE '+role);}
const migration=readFileSync(new URL('./003_web_push.sql',import.meta.url),'utf8');
const sub=()=>{const e=createECDH('prime256v1');e.generateKeys();return{id:randomUUID(),endpoint:'https://web.push.apple.com/'+randomUUID(),p:e.getPublicKey().toString('base64url'),a:randomBytes(16).toString('base64url')};};
const register=async(s,preview=false)=>(await q('select public.register_my_push($1,$2,$3,$4,$5) r',[s.id,s.endpoint,s.p,s.a,preview]))[0].r;
const claim=async(id)=>(await q('select public.push_claim($1) r',[id]))[0].r;
const complete=async(id,t,outcome)=>(await q('select public.push_complete($1,$2,$3,$4) r',[id,t.subscription_id,t.lease_token,outcome]))[0].r;
try{
 const source=readFileSync(new URL('./local-check.mjs',import.meta.url),'utf8');const fixture=source.match(/const fixtureSQL=`([\s\S]*?)`;/)?.[1];if(!fixture)throw new Error('Explicit ABI fixture missing');
 await db.exec(fixture);await db.exec(readFileSync(new URL('./001_shared_app.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('./002_profile_thoughts.sql',import.meta.url),'utf8'));
 const a=randomUUID(),b=randomUUID(),other=randomUUID();await q('insert into auth.users(id) values($1),($2),($3)',[a,b,other]);await q("select public.admin_enroll_pair($1,'Synthetic A',$2,'Synthetic B')",[a,b]);
 const profileA=(await q('select id from public.users_profiles where auth_user_id=$1',[a]))[0].id;
 const legacyMigration=process.env.CONNECTION_PUSH_UPGRADE_SQL?readFileSync(process.env.CONNECTION_PUSH_UPGRADE_SQL,'utf8'):null;
 await db.exec('BEGIN');await as(a);const old=randomUUID();await q('select public.send_thought($1)',[old]);await db.exec('COMMIT; RESET ROLE');await db.exec(legacyMigration||migration);await db.exec('BEGIN');
 const s=sub();await as(b);const receipt=await register(s);check(!('endpoint' in receipt)&&receipt.enabled,'registration returns sanitized receipt');
 check((await q('select public.list_my_push() r'))[0].r.length===1,'own sanitized list');
 await fails('select * from app_private.push_subscriptions',[],'42501','own raw endpoint registry denied');
 await fails('select public.push_claim($1)',[old],'42501','browser service claim denied');
 await fails('select public.push_complete($1,$2,$3,$4)',[old,s.id,randomUUID(),'accepted'],'42501','browser completion denied');
 await as(a);check((await q('select public.list_my_push() r'))[0].r.length===0,'partner sanitized list empty');await fails('select public.disable_my_push($1)',[s.id],'42501','partner cannot disable device');
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[s.id,s.endpoint,s.p,s.a],'23505','partner cannot adopt endpoint or UUID');
 for(const endpoint of ['https://127.0.0.1/a','https://evil.invalid/a','http://web.push.apple.com/a','https://web.push.apple.com.evil.invalid/a','https://web.push.apple.com:444/a','https://u@web.push.apple.com/a','https://web.push.apple.com/a?x=1','https://web.push.apple.com/a/../b']) await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),endpoint,s.p,s.a],'22023','SSRF endpoint denied');
 for(const [p,auth]of[['x',s.a],[s.p,'x'],[s.p+'=',s.a],['A'+s.p.slice(1),s.a]])await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),sub().endpoint,p,auth],'22023','malformed key denied');
 await as('', 'service_role');await fails('select * from app_private.push_subscriptions',[],'42501','service client raw registry denied');check((await claim(old)).length===0,'pre-migration event never replayed');
 await as(a);await db.exec('RESET ROLE');await db.exec("update app_private.thought_limits set last_sent_at=clock_timestamp()-interval '1 minute'");await as(a);const event=randomUUID();await q('select public.send_thought($1)',[event]);await q('select public.send_thought($1)',[event]);
 await as('', 'service_role');await fails('select public.push_claim($1)',[event],'22023','recipient locale required, no fallback');
 await as(b);await q("select public.save_my_preferences(0,'dark','fr',null)");
 await as('', 'service_role');const targets=await claim(event);check(targets.length===1&&targets[0].locale==='fr'&&targets[0].sender==='Synthetic A','service derives target recipient locale and sender');check((await claim(event)).length===0,'in-flight lease excludes duplicate claim');
 check(!await complete(event,{...targets[0],lease_token:randomUUID()},'accepted'),'wrong lease cannot complete');check(await complete(event,targets[0],'accepted'),'provider acceptance committed');check((await claim(event)).length===0,'accepted target never claimed again');
 await as(a);await q('select public.send_thought($1)',[event]);await db.exec('RESET ROLE');check((await q('select count(*) n from public.thought_events where id=$1',[event]))[0].n===1,'same sender UUID creates exactly one event');check((await q('select count(*) n from app_private.push_deliveries where event_id=$1',[event]))[0].n===1,'same event subscription dedupe immutable');
 await as(b);await fails('select public.send_thought($1)',[event],'23505','recipient cannot impersonate sender retry');
 const late=sub();await register(late);await as('', 'service_role');check((await claim(event)).length===0,'new subscription does not replay old accepted event');
 await as(b);await q('select public.disable_my_push($1)',[s.id]);await register(s,true);await as('', 'service_role');check((await claim(event)).length===0,'disable reenable does not resurrect accepted delivery');
 // New event, two devices: transient errors, lease expiry, old-token fencing, cap.
 await db.exec('RESET ROLE');await db.exec("update app_private.thought_limits set last_sent_at=clock_timestamp()-interval '1 minute'");await as(a);const retryEvent=randomUUID();await q('select public.send_thought($1)',[retryEvent]);await as('', 'service_role');const t1=await claim(retryEvent);check(t1.length===2,'new event snapshots both enabled devices');
 await complete(retryEvent,t1[0],'retry');await complete(retryEvent,t1[1],'gone');check((await claim(retryEvent)).length===0,'backoff prevents immediate resend');
 await db.exec('RESET ROLE');await db.exec("update app_private.push_deliveries set next_attempt_at=clock_timestamp()-interval '1 minute' where status='retry'");await as('', 'service_role');const t2=await claim(retryEvent);check(t2.length===1&&t2[0].attempt===2,'retry increments bounded attempt');
 await db.exec('RESET ROLE');await db.exec("update app_private.push_deliveries set lease_until=clock_timestamp()-interval '1 second' where status='leased'");await as('', 'service_role');const t3=await claim(retryEvent);check(t3.length===1&&t3[0].attempt===3,'expired lease can retry to final attempt');check(!await complete(retryEvent,t2[0],'accepted'),'stale lease token fenced after reclaim');await complete(retryEvent,t3[0],'retry');check((await claim(retryEvent)).length===0,'attempt cap stops repeated unknown failures');
 await as(b);check((await q('select public.list_my_push() r'))[0].r.some(r=>r.id===t1[1].subscription_id&&!r.enabled),'410 gone disables subscription');
 if(legacyMigration){
  await db.exec('RESET ROLE');
  // Populate additional old-schema states without changing existing evidence.
  await q("insert into app_private.push_deliveries(event_id,subscription_id,status,attempts,lease_token,lease_until) values($1,$2,'pending',0,null,null),($1,$3,'leased',1,$4,clock_timestamp()+interval '90 seconds'),($5,$3,'cancelled',0,null,null)",[old,s.id,late.id,randomUUID(),event]);
  const upgradeSnapshot=async()=>JSON.stringify((await q("select (select jsonb_agg(s order by id) from app_private.push_subscriptions s) subscriptions,(select jsonb_agg(d order by event_id,subscription_id) from app_private.push_deliveries d) deliveries"))[0]);
  check((await q("select count(distinct status) n from app_private.push_deliveries"))[0].n===6,'old 003 upgrade fixture contains accepted/gone/exhausted/pending/leased/cancelled');
  const prior=await upgradeSnapshot();await db.exec('COMMIT');await db.exec(migration);
  check(await upgradeSnapshot()===prior,'exact old-003 upgrade preserves all populated subscriptions, payloads, timestamps and delivery evidence');
  await db.exec('BEGIN');await as(b);
 }
 for(let i=0;i<3;i++)await register(sub());
 await db.exec('SAVEPOINT active_cap');const fifth=sub();await register(fifth);
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),sub().endpoint,s.p,s.a],'54000','five concurrently enabled devices quota excludes disabled');
 check((await register(fifth)).enabled,'enabled identical retry succeeds at active cap');
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[t1[1].subscription_id,t1[1].subscription_id===s.id?s.endpoint:late.endpoint,t1[1].subscription_id===s.id?s.p:late.p,t1[1].subscription_id===s.id?s.a:late.a],'54000','reenable cannot exceed five enabled');
 await db.exec('ROLLBACK TO SAVEPOINT active_cap;RELEASE SAVEPOINT active_cap');
 await as(other);await fails('select public.list_my_push()',[],'42501','unenrolled user denied');await as('', 'anon');await fails('select public.list_my_push()',[],'42501','anon denied');
 await db.exec('RESET ROLE');
 // Preserve populated leased/cancelled states too, not only terminal receipts.
 await db.exec("update app_private.thought_limits set last_sent_at=clock_timestamp()-interval '1 minute'");await as(a);const leasedEvent=randomUUID();await q('select public.send_thought($1)',[leasedEvent]);
 await as(b);const list=(await q('select public.list_my_push() r'))[0].r;const goneId=t1[1].subscription_id;
 const goneSub=goneId===s.id?s:late;await register(goneSub);
 await db.exec('RESET ROLE');check((await q('select count(*) n from app_private.push_deliveries where event_id=$1 and subscription_id=$2',[leasedEvent,goneId]))[0].n===0,'reenabling previously disabled device does not backfill pending event');
 const enabledId=list.find(r=>r.enabled).id;await as(b);await q('select public.disable_my_push($1)',[enabledId]);await as('', 'service_role');const leases=await claim(leasedEvent);check(leases.length===3,'disabled pending delivery cancelled, other devices leased');
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),s.endpoint,s.p,s.a],'42501','service role cannot call browser registration');
 await fails('select * from app_private.push_deliveries',[],'42501','service client cannot read raw delivery ledger');
 await db.exec('RESET ROLE');
 const acl=(await q("select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE')) ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('push_claim','push_complete','push_status')"))[0];check(acl.ok,'all service-only RPC execute ACLs exact');
 // Controlled Auth ABI delay, not concurrent sessions or a simulated lock race.
 // All timing assertions use the in-DB auth-call-end timestamp, never client time.
 await db.exec('SAVEPOINT clock_regression');await as(a);await q("select public.save_my_preferences(0,'dark','en',null)");
 const clockDevice=sub();await register(clockDevice);await db.exec('RESET ROLE');
 await db.exec("update app_private.thought_limits set last_sent_at=clock_timestamp()-interval '1 minute'");
 await as(b);const clockEvent=randomUUID();await q('select public.send_thought($1)',[clockEvent]);await db.exec('RESET ROLE');
 await db.exec(`create or replace function auth.role() returns text language plpgsql volatile as $$
 begin
   perform pg_sleep(0.3);
   perform set_config('test.push_auth_call_end',clock_timestamp()::text,false);
   return current_setting('request.jwt.claim.role',true);
 end $$`);
 await as('', 'service_role');const clockFirst=await claim(clockEvent);await db.exec('RESET ROLE');
 const leaseFloor=async()=> (await q("select extract(epoch from lease_until-current_setting('test.push_auth_call_end')::timestamptz)::float8 seconds,lease_until>=current_setting('test.push_auth_call_end')::timestamptz+interval '90 seconds' ok from app_private.push_deliveries where event_id=$1 and subscription_id=$2",[clockEvent,clockDevice.id]))[0];
 const firstFloor=await leaseFloor();console.log('CLOCK pending lease seconds after in-DB auth-call-end: '+firstFloor.seconds);
 check(clockFirst.length===1&&firstFloor.ok,'delayed Auth ABI leaves at least 90 seconds from auth-call-end on pending claim');
 await as('', 'service_role');const clockCompleted=await complete(clockEvent,clockFirst[0],'retry');await db.exec('RESET ROLE');
 check(clockCompleted&&(await q("select next_attempt_at>=current_setting('test.push_auth_call_end')::timestamptz+interval '30 seconds' ok from app_private.push_deliveries where event_id=$1 and subscription_id=$2",[clockEvent,clockDevice.id]))[0].ok,'completion retry timestamp is sampled after delayed authorization and pair lock');
 await q("update app_private.push_deliveries set next_attempt_at=clock_timestamp()+interval '150 milliseconds' where event_id=$1",[clockEvent]);
 await as('', 'service_role');const clockRetry=await claim(clockEvent);await db.exec('RESET ROLE');
 check(clockRetry.length===1&&clockRetry[0].attempt===2&&(await leaseFloor()).ok,'retry becoming eligible during Auth ABI delay is claimed with a full lease');
 await q("update app_private.push_deliveries set lease_until=clock_timestamp()+interval '150 milliseconds' where event_id=$1",[clockEvent]);
 await as('', 'service_role');const clockExpired=await claim(clockEvent);await db.exec('RESET ROLE');
 check(clockExpired.length===1&&clockExpired[0].attempt===3&&(await leaseFloor()).ok,'lease expiring during Auth ABI delay is reclaimed with a full final lease');
 await q("update app_private.push_deliveries set lease_until=clock_timestamp()+interval '150 milliseconds' where event_id=$1",[clockEvent]);
 await as('', 'service_role');const clockExhausted=await claim(clockEvent);await db.exec('RESET ROLE');
 check(clockExhausted.length===0&&(await q("select status='exhausted' and lease_token is null and lease_until is null ok from app_private.push_deliveries where event_id=$1 and subscription_id=$2",[clockEvent,clockDevice.id]))[0].ok,'final lease expiring during Auth ABI delay becomes exhausted immediately');
 await db.exec('ROLLBACK TO SAVEPOINT clock_regression;RELEASE SAVEPOINT clock_regression');
 // Lifecycle/quota fixtures are rolled back; all production evidence stays intact.
 await db.exec('SAVEPOINT lifecycle');await as(a);await q("select public.save_my_preferences(0,'dark','en',null)");
 const cycles=[];let cycleEvent;
 for(let i=0;i<6;i++){
  const device=sub();cycles.push(device);check((await register(device)).enabled,`logout cycle ${i+1} registers a fresh identity`);
  if(i===0){
   await as(b);cycleEvent=randomUUID();await q('select public.send_thought($1)',[cycleEvent]);
   await as('', 'service_role');const target=(await claim(cycleEvent))[0];check(await complete(cycleEvent,target,'accepted'),'lifecycle original provider acceptance committed');await as(a);
  }
  await q('select public.disable_my_push($1)',[device.id]);
 }
 check((await q('select public.list_my_push() r'))[0].r.filter(r=>r.enabled).length===0,'six logout cycles retain history with zero enabled');
 await register(cycles[0]);await as('', 'service_role');check((await claim(cycleEvent)).length===0,'accepted delivery never replayed after six logout cycles and reenable');await as(a);await q('select public.disable_my_push($1)',[cycles[0].id]);
 for(let i=0;i<4;i++){const device=sub();await register(device);await q('select public.disable_my_push($1)',[device.id]);}
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),sub().endpoint,s.p,s.a],'54000','ten new UTC-day identities includes disabled history');
 const originalCreated=(await register(cycles[0])).created_at;await register(cycles[0],true);await q('select public.disable_my_push($1)',[cycles[0].id]);await register(cycles[0]);
 check(originalCreated===(await register(cycles[0])).created_at,'idempotent retry and reenable preserve created_at at daily limit');
 check((await q('select public.list_my_push() r'))[0].r.length===10,'daily-limit retries consume no new identity slots');
 await db.exec('RESET ROLE');
 // Non-UTC session around DST: only UTC midnight starts a new creation budget.
 await db.exec("SET TIME ZONE 'America/Los_Angeles'");
 await q("update app_private.push_subscriptions set created_at=date_trunc('day',clock_timestamp(),'UTC')-interval '1 microsecond' where owner_id=$1",[profileA]);
 await as(a);const boundary=sub();await register(boundary);await db.exec('RESET ROLE');
 check((await q("select count(*) n from app_private.push_subscriptions where owner_id=$1 and created_at>=date_trunc('day',clock_timestamp(),'UTC')",[profileA]))[0].n===1,'UTC boundary excludes prior-day disabled rows in non-UTC session');
 await db.exec("SET TIME ZONE 'UTC'");
 await db.exec('ROLLBACK TO SAVEPOINT lifecycle;RELEASE SAVEPOINT lifecycle');
 await db.exec('SAVEPOINT rotation');await as(a);const original=sub();await register(original);
 const rotated={...sub(),endpoint:original.endpoint};
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[rotated.id,rotated.endpoint,rotated.p,rotated.a],'23505','same-owner active endpoint cannot rotate yet');
 await q('select public.disable_my_push($1)',[original.id]);
 await as(b);await fails('select public.register_my_push($1,$2,$3,$4,false)',[rotated.id,rotated.endpoint,rotated.p,rotated.a],'23505','cross-owner disabled endpoint adoption denied');
 await as(a);check((await register(rotated)).enabled,'same-owner disabled endpoint rotates with new UUID and keys');
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[original.id,original.endpoint,original.p,original.a],'23505','old identity cannot reenable while fresh row owns active endpoint');
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[original.id,original.endpoint,rotated.p,rotated.a],'23505','old UUID keys remain immutable');
 await db.exec('RESET ROLE');
 check((await q("select count(*) n from pg_indexes where schemaname='app_private' and indexname='push_subscriptions_active_endpoint' and indexdef like 'CREATE UNIQUE INDEX%WHERE enabled'"))[0].n===1,'explicit partial unique index enforces active endpoint uniqueness');
 await fails('update app_private.push_subscriptions set enabled=true where id=$1',[original.id],'23505','unique index independently blocks conflicting old-ID reenable');
 await as(a);await q('select public.disable_my_push($1)',[rotated.id]);check((await register(original)).enabled,'old identity may reenable once all endpoint peers disabled');
 await q('select public.disable_my_push($1)',[original.id]);await as(b);
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),original.endpoint,s.p,s.a],'23505','all-disabled endpoint history still pins original owner');
 await as(a);await register(rotated);await db.exec('RESET ROLE');await db.exec('RELEASE SAVEPOINT rotation');
 await db.exec('SAVEPOINT lifetime');await as(a);const retained=sub();await register(retained);await db.exec('RESET ROLE');
 // Privileged synthetic bulk fixture, never a production deletion/reset path.
 await q("insert into app_private.push_subscriptions(id,owner_id,pair_id,endpoint,p256dh,auth_secret,enabled,created_at) select gen_random_uuid(),$1,(select pair_id from public.pair_members where profile_id=$1),'https://web.push.apple.com/lifetime-'||n,$2,$3,false,date_trunc('day',clock_timestamp(),'UTC')-interval '24 hours' from generate_series(1,9996) n",[profileA,s.p,s.a]);
 await as(a);const last=sub();check((await register(last)).enabled,'10000th lifetime identity succeeds with older disabled history');await q('select public.disable_my_push($1)',[last.id]);
 await fails('select public.register_my_push($1,$2,$3,$4,false)',[randomUUID(),sub().endpoint,s.p,s.a],'54000','10001st lifetime identity denied including disabled rows');
 check((await register(retained)).enabled&&(await register(last)).enabled,'existing enabled retry and disabled reenable work at lifetime cap');
 check((await q('select public.list_my_push() r'))[0].r.length===10000,'lifetime retries consume no new slots or history deletion');
 await db.exec('RESET ROLE');await db.exec('ROLLBACK TO SAVEPOINT lifetime;RELEASE SAVEPOINT lifetime');
 const snap=async()=>JSON.stringify((await q("select (select jsonb_agg(s order by id) from app_private.push_subscriptions s) subscriptions,(select jsonb_agg(d order by event_id,subscription_id) from app_private.push_deliveries d) deliveries"))[0]);const before=await snap();await db.exec('COMMIT');await db.exec(migration);check(await snap()===before,'003 exact reapply preserves populated delivery states, keys, leases and timestamps');
 await db.exec(readFileSync(new URL('./001_shared_app.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('./002_profile_thoughts.sql',import.meta.url),'utf8'));await db.exec(migration);check(await snap()===before,'001 -> 002 -> 003 preserves populated push state');
 const funcs=(await q("select proname,prosecdef,proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('register_my_push','disable_my_push','list_my_push','push_claim','push_complete','push_status')"));check(funcs.length===6&&funcs.every(x=>x.prosecdef&&x.proconfig?.includes('search_path=""')),'all six public helpers definer with empty search path');
 await db.exec('BEGIN');await as('', 'service_role');check((await claim(event)).length===0,'full-chain reapply restores claim grant without accepted replay');await db.exec('ROLLBACK');
 console.log(`PASS ${checks} PostgreSQL checks; real Supabase HTTP/live concurrency/provider/device NOT RUN`);
}catch(e){console.error('FAIL',e.code||'',e.message);process.exitCode=1;}finally{await db.close();}
