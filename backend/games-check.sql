-- LOCAL ONLY: behavioural check for 005 against a synthetic enrolled pair. Never run on production.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/games-check.sql (rolls back).
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
select pg_temp.as_user(:'oliver');
select (public.record_game_event('a0000000-0000-4000-8000-000000000001','truth_dare','truth','t01','Yes',null,null)).id is not null as o1 \gset
insert into results values('first turn by anyone',:'o1');
-- same id + same fields: safe retry returns the stored row
insert into results select 'idempotent retry',(public.record_game_event('a0000000-0000-4000-8000-000000000001','truth_dare','truth','t01','Yes',null,null)).id='a0000000-0000-4000-8000-000000000001';
do $$ begin perform public.record_game_event('a0000000-0000-4000-8000-000000000002','truth_dare','dare','d01',null,null,null); insert into results values('same player twice rejected',false);
exception when sqlstate 'PT409' then insert into results values('same player twice rejected',true); end $$;
select pg_temp.as_user(:'yasmine');
do $$ begin perform public.record_game_event('a0000000-0000-4000-8000-000000000003','truth_dare','truth','d02',null,null,null); insert into results values('card/kind mismatch rejected',false);
exception when check_violation then insert into results values('card/kind mismatch rejected',true); end $$;
insert into results select 'partner reads turn',count(*)=1 from public.game_events;
insert into results select 'partner takes turn',(public.record_game_event('a0000000-0000-4000-8000-000000000004','truth_dare','dare','d03',null,null,null)).id is not null;
insert into results select 'finish',(public.record_game_event('a0000000-0000-4000-8000-000000000005','truth_dare','finish',null,null,null,null)).id is not null;
do $$ begin perform public.record_game_event('a0000000-0000-4000-8000-000000000006','truth_dare','finish',null,null,null,null); insert into results values('empty finish rejected',false);
exception when sqlstate '22023' then insert into results values('empty finish rejected',true); end $$;
insert into results select 'hockey finish',(public.record_game_event('a0000000-0000-4000-8000-000000000007','hockey','finish',null,null,5::smallint,3::smallint)).id is not null;
do $$ begin insert into public.game_events(id,pair_id,profile_id,game,kind) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'hockey','finish'); insert into results values('no direct insert',false);
exception when insufficient_privilege then insert into results values('no direct insert',true); end $$;
insert into results select 'six flowers accepted',(public.plant_flower('b0000000-0000-4000-8000-000000000001','marigold')).flower_type='marigold';
reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
do $$ begin perform 1 from public.game_events; insert into results values('anon has no access',false);
exception when insufficient_privilege then insert into results values('anon has no access',true); end $$;
reset role;
select name,ok from results order by name;
select case when bool_and(ok) then 'ALL PASS' else 'FAILURES' end as verdict from results;
rollback;
