-- LOCAL ONLY: behavioural check for 015 (discoveries). Never run on production. Everything rolls back.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/garden-check.sql
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;
delete from public.garden_discoveries;
select pg_temp.as_user(:'oliver');
insert into results select 'a discovery is saved',(public.discover('harissa')).spot='harissa';
insert into results select 'finding it again changes nothing',(public.discover('harissa')).found_at=(select found_at from public.garden_discoveries where spot='harissa');
insert into results select 'odd names are refused',pg_temp.fails($q$select public.discover('DROP TABLE')$q$,'23514');
insert into results select 'no direct writes',pg_temp.fails($q$insert into public.garden_discoveries(profile_id,pair_id,spot) values(app_private.my_id(),app_private.my_pair(),'x1')$q$,'42501');
select pg_temp.as_user(:'yasmine');
insert into results select 'she sees what he found',(select count(*) from public.garden_discoveries)=1;
insert into results select 'her own discoveries are hers',(public.discover('angel')).spot='angel';
insert into results select 'both are kept',(select count(*) from public.garden_discoveries)=2;
reset role;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, string_agg(name,', ') filter (where not ok) as failing from results;
rollback;
