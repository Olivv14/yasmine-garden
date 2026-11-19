-- LOCAL ONLY: behavioural check for 006 against a synthetic enrolled pair. Never run on production.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/inbox-check.sql (rolls back).
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
-- notify_partner is internal: run it as the owner with Oliver's identity, as a feature RPC would.
select set_config('request.jwt.claims',json_build_object('sub',:'oliver','role','authenticated')::text,true);
insert into results select 'notify creates row for partner',(app_private.notify_partner('c0000000-0000-4000-8000-000000000001','dedication','d0000000-0000-4000-8000-000000000001')).kind='dedication';
insert into results select 'notify retry is idempotent',(app_private.notify_partner('c0000000-0000-4000-8000-000000000001','dedication','d0000000-0000-4000-8000-000000000001')).id='c0000000-0000-4000-8000-000000000001';
do $$ begin perform app_private.notify_partner('c0000000-0000-4000-8000-000000000001','message',null); insert into results values('changed retry conflicts',false);
exception when unique_violation then insert into results values('changed retry conflicts',true); end $$;
do $$ begin perform app_private.notify_partner('c0000000-0000-4000-8000-000000000002','unknown',null); insert into results values('unknown kind rejected',false);
exception when check_violation then insert into results values('unknown kind rejected',true); end $$;
select app_private.notify_partner('c0000000-0000-4000-8000-000000000003','message',null) is not null as made \gset
select pg_temp.as_user(:'oliver');
insert into results select 'sender cannot read partner inbox',count(*)=0 from public.notifications;
do $$ begin perform app_private.notify_partner('c0000000-0000-4000-8000-000000000009','message',null); insert into results values('browser cannot call notify',false);
exception when insufficient_privilege then insert into results values('browser cannot call notify',true); end $$;
do $$ begin insert into public.notifications(id,pair_id,sender_id,recipient_id,kind) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'message'); insert into results values('no direct insert',false);
exception when insufficient_privilege then insert into results values('no direct insert',true); end $$;
insert into results select 'sender cannot mark partner rows',public.mark_notifications_read(array[]::uuid[])=0;
select pg_temp.as_user(:'yasmine');
insert into results select 'recipient reads inbox',count(*)=2 from public.notifications;
insert into results select 'mark one read',public.mark_notifications_read(array['c0000000-0000-4000-8000-000000000001']::uuid[])=1;
insert into results select 'mark again is a no-op',public.mark_notifications_read(array['c0000000-0000-4000-8000-000000000001']::uuid[])=0;
insert into results select 'mark all read',public.mark_notifications_read(array[]::uuid[])=1;
insert into results select 'all read',count(*)=0 from public.notifications where read_at is null;
do $$ begin update public.notifications set read_at=null; insert into results values('no direct update',false);
exception when insufficient_privilege then insert into results values('no direct update',true); end $$;
reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
do $$ begin perform 1 from public.notifications; insert into results values('anon has no access',false);
exception when insufficient_privilege then insert into results values('anon has no access',true); end $$;
reset role;
select name,ok from results order by ok,name;
select case when bool_and(ok) then 'ALL PASS' else 'FAILURES' end as summary,count(*) from results;
rollback;
