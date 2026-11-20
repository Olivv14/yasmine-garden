-- LOCAL ONLY: behavioural check for 011 (Pool). Never run on production. Everything rolls back.
-- Usage: psql -v oliver=<auth uuid> -f backend/pool-check.sql
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;
select pg_temp.as_user(:'oliver');
insert into results select 'pool saved',(public.record_game_event('d0000000-0000-4000-8000-000000000001','pool','finish',null,null,1::smallint,0::smallint)).game='pool';
insert into results select 'pool against the toad saved',(public.record_game_event('d0000000-0000-4000-8000-000000000002','pool_bot','finish',null,null,0::smallint,1::smallint)).game='pool_bot';
insert into results select 'retry returns the same row',(public.record_game_event('d0000000-0000-4000-8000-000000000001','pool','finish',null,null,1::smallint,0::smallint)).score_me=1;
insert into results select 'one winner per rack',pg_temp.fails($q$select public.record_game_event('d0000000-0000-4000-8000-000000000003','pool','finish',null,null,1::smallint,1::smallint)$q$,'23514');
insert into results select 'pool scores are 0 or 1',pg_temp.fails($q$select public.record_game_event('d0000000-0000-4000-8000-000000000004','pool','finish',null,null,5::smallint,0::smallint)$q$,'23514');
insert into results select 'a pool turn is not a thing',pg_temp.fails($q$select public.record_game_event('d0000000-0000-4000-8000-000000000006','pool','truth','t01',null,null,null)$q$,'23514');
insert into results select 'hockey still saves',(public.record_game_event('d0000000-0000-4000-8000-000000000005','hockey','finish',null,null,5::smallint,3::smallint)).game='hockey';
reset role;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, string_agg(name,', ') filter (where not ok) as failing from results;
rollback;
