-- LOCAL ONLY: behavioural check for 010 (Play). Never run on production.
-- Usage: apply 010 first (or prepend it in the same session), then
--   psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/play-check.sql   (everything rolls back)
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;

-- Oliver starts a word duel and a know-me round
select pg_temp.as_user(:'oliver');
insert into results select 'duel started',(public.play_start('a0000000-0000-4000-8000-000000000001','word_duel','it',array['it.amore','it.cuore','it.bacio','it.mare','it.sole'],array[1,1,0,-1,1]::smallint[],30000)).game='word_duel';
insert into results select 'his duel score is counted here',(select score=3 and role='player' and ms=30000 from public.play_answers where round_id='a0000000-0000-4000-8000-000000000001');
insert into results select 'retry returns the same round',(public.play_start('a0000000-0000-4000-8000-000000000001','word_duel','it',array['it.amore','it.cuore','it.bacio','it.mare','it.sole'],array[1,1,0,-1,1]::smallint[],30000)).id='a0000000-0000-4000-8000-000000000001';
insert into results select 'changed retry conflicts',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000001','word_duel','it',array['it.amore','it.cuore','it.bacio','it.mare','it.luna'],array[1,1,0,-1,1]::smallint[],30000)$q$,'23505');
insert into results select 'a duel pick is right, wrong or late',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','word_duel','it',array['it.a1','it.a2','it.a3'],array[1,2,0]::smallint[],1000)$q$,'22023');
insert into results select 'at least three items',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','word_duel','it',array['it.a1','it.a2'],array[1,0]::smallint[],1000)$q$,'22023');
insert into results select 'no repeated items',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','word_duel','it',array['it.a1','it.a1','it.a2'],array[1,0,1]::smallint[],1000)$q$,'22023');
insert into results select 'item ids are plain',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','word_duel','it',array['It A1','it.a2','it.a3'],array[1,0,1]::smallint[],1000)$q$,'22023');
insert into results select 'one pick per item',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','word_duel','it',array['it.a1','it.a2','it.a3'],array[1,0]::smallint[],1000)$q$,'22023');
insert into results select 'a duel needs a deck',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','word_duel',null,array['it.a1','it.a2','it.a3'],array[1,0,1]::smallint[],1000)$q$,'23514');
insert into results select 'unknown games refused',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000009','chess',null,array['x1','x2','x3'],array[1,0,1]::smallint[],1000)$q$,'22023');
insert into results select 'know me started',(public.play_start('a0000000-0000-4000-8000-000000000002','know_me',null,array['km01','km02','km03','km04','km05'],array[0,1,2,3,0]::smallint[],null)).game='know_me';
insert into results select 'answers about yourself have no score',(select score is null and role='self' from public.play_answers where round_id='a0000000-0000-4000-8000-000000000002');
insert into results select 'know-me picks are one of four',pg_temp.fails($q$select public.play_start('a0000000-0000-4000-8000-000000000008','know_me',null,array['km01','km02','km03'],array[0,4,1]::smallint[],null)$q$,'22023');
insert into results select 'he cannot answer his own round',pg_temp.fails($q$select public.play_answer('b0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000001',array[1,1,1,1,1]::smallint[],1000)$q$,'42501');
insert into results select 'bot hockey saved',(public.record_game_event('c0000000-0000-4000-8000-000000000001','hockey_bot','finish',null,null,5::smallint,3::smallint)).game='hockey_bot';
insert into results select 'bot hockey needs scores',pg_temp.fails($q$select public.record_game_event('c0000000-0000-4000-8000-000000000002','hockey_bot','finish',null,null,null,null)$q$,'23514');
insert into results select 'spicy cards fit the card check',(public.record_game_event('c0000000-0000-4000-8000-000000000003','truth_dare','truth','t27',null,null,null)).card_id='t27';

-- Yasmine: her turn arrives in the bell; she plays both rounds
select pg_temp.as_user(:'yasmine');
insert into results select 'two turns in her bell',(select count(*)=2 from public.notifications where kind='game_turn' and read_at is null);
insert into results select 'she sees both rounds',(select count(*)=2 from public.play_rounds);
insert into results select 'she sees his duel score before playing',(select count(*)=1 from public.play_answers where role='player');
insert into results select 'his answers about himself stay hidden until she guesses',(select count(*)=0 from public.play_answers where role='self');
insert into results select 'she plays the duel',(public.play_answer('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',array[1,1,1,1,0]::smallint[],25000)).score=4;
insert into results select 'her retry returns the same answer',(public.play_answer('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',array[1,1,1,1,0]::smallint[],25000)).id='b0000000-0000-4000-8000-000000000001';
insert into results select 'she cannot play it twice',pg_temp.fails($q$select public.play_answer('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',array[1,1,1,1,1]::smallint[],1000)$q$,'PT409');
insert into results select 'a guess has one pick per question',pg_temp.fails($q$select public.play_answer('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002',array[0,1]::smallint[],null)$q$,'22023');
insert into results select 'her guess is scored against his answers',(public.play_answer('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',array[0,1,0,3,1]::smallint[],null)).score=3;
insert into results select 'after guessing she sees his answers',(select count(*)=1 from public.play_answers where role='self');
insert into results select 'unknown rounds refused',pg_temp.fails($q$select public.play_answer('b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-0000000000ff',array[1,1,1]::smallint[],1000)$q$,'42501');
insert into results select 'no direct writes',pg_temp.fails($q$insert into public.play_rounds(id,pair_id,game,started_by,items) values(gen_random_uuid(),gen_random_uuid(),'know_me',gen_random_uuid(),array['a','b','c'])$q$,'42501');

-- Oliver: both results arrive in his bell
select pg_temp.as_user(:'oliver');
insert into results select 'two results in his bell',(select count(*)=2 from public.notifications where kind='game_result');
insert into results select 'he sees her guesses',(select count(*)=1 from public.play_answers where role='guess' and score=3);

reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
insert into results select 'anon has no access',pg_temp.fails($q$select count(*) from public.play_rounds$q$,'42501');
reset role;
select name,ok from results order by ok,name;
select case when bool_and(ok) then 'ALL PASS' else 'FAILURES' end as summary,count(*) from results;
rollback;
