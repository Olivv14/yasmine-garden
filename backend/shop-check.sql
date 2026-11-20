-- LOCAL ONLY: behavioural check for 012 (the shop). Never run on production. Everything rolls back.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/shop-check.sql
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;
-- start from a clean slate for this pair (rolled back at the end)
delete from public.shop_purchases; delete from public.shop_choices;
delete from public.play_answers; delete from public.play_rounds; delete from public.game_events;
select pg_temp.as_user(:'oliver');
create temp table me_id as select app_private.my_id() as id; grant all on me_id to authenticated;
insert into results select 'no points, nothing to buy',pg_temp.fails($q$select public.shop_buy('e0000000-0000-4000-8000-000000000001','heart.flower')$q$,'PT402');
-- earn: a Champion win 6, a Dreamer win 1, a Coach pool win 3, a truth turn 1, a pool win 3 -> 14 points
select public.record_game_event('e1000000-0000-4000-8000-000000000001','hockey_bot','finish','lv3',null,5::smallint,2::smallint);
select public.record_game_event('e1000000-0000-4000-8000-000000000002','hockey_bot','finish','lv1',null,5::smallint,1::smallint);
select public.record_game_event('e1000000-0000-4000-8000-000000000003','pool_bot','finish','lv2',null,1::smallint,0::smallint);
select public.record_game_event('e1000000-0000-4000-8000-000000000004','truth_dare','truth','t01',null,null,null);
select public.record_game_event('e1000000-0000-4000-8000-000000000005','pool','finish',null,null,1::smallint,0::smallint);
reset role;
insert into results select 'points counted like the app (6+1+3+1+3=14)',app_private.points_earned((select id from me_id))=14;
insert into results select 'the partner earned 1 from the pool game',app_private.points_earned((select profile_id from public.pair_members where profile_id<>(select id from me_id) limit 1))=1;
select pg_temp.as_user(:'oliver');
insert into results select 'still not enough for a flower (50)',pg_temp.fails($q$select public.shop_buy('e0000000-0000-4000-8000-000000000001','heart.flower')$q$,'PT402');
insert into results select 'Djerba unlocks after beating the Champion',(public.shop_buy('e0000000-0000-4000-8000-000000000002','theme.djerba')).cost=0;
insert into results select 'buying again returns the same purchase',(public.shop_buy('e0000000-0000-4000-8000-000000000002','theme.djerba')).item='theme.djerba';
insert into results select 'free things are already yours',pg_temp.fails($q$select public.shop_buy('e0000000-0000-4000-8000-000000000003','mascot.emmy')$q$,'22023');
insert into results select 'unknown items are not for sale',pg_temp.fails($q$select public.shop_buy('e0000000-0000-4000-8000-000000000004','heart.dragon')$q$,'22023');
insert into results select 'a level must be one of three',pg_temp.fails($q$select public.record_game_event('e1000000-0000-4000-8000-000000000009','hockey_bot','finish','lv9',null,5::smallint,1::smallint)$q$,'23514');
insert into results select 'live hockey has no level',pg_temp.fails($q$select public.record_game_event('e1000000-0000-4000-8000-000000000010','hockey','finish','lv3',null,5::smallint,1::smallint)$q$,'23514');
insert into results select 'choose what you own',(public.shop_choose('heart.classic','theme.djerba',array['mascot.emmy'])).theme='theme.djerba';
insert into results select 'cannot choose what you do not own',pg_temp.fails($q$select public.shop_choose('heart.kiss','theme.dusk',array['mascot.emmy'])$q$,'PT403');
insert into results select 'two mascots at most',pg_temp.fails($q$select public.shop_choose('heart.classic','theme.dusk',array['mascot.emmy','mascot.emmy','mascot.emmy'])$q$,'22023');
insert into results select 'no direct writes',pg_temp.fails($q$insert into public.shop_purchases(id,pair_id,profile_id,item,cost) values(gen_random_uuid(),app_private.my_pair(),app_private.my_id(),'heart.kiss',0)$q$,'42501');
-- the partner sees the choice but cannot buy with his points
select pg_temp.as_user(:'yasmine');
insert into results select 'the partner sees your choice',(select count(*) from public.shop_choices)=1;
insert into results select 'the partner sees your purchases',(select count(*) from public.shop_purchases)=1;
insert into results select 'the partner has not beaten the Champion',pg_temp.fails($q$select public.shop_buy('e0000000-0000-4000-8000-000000000005','theme.djerba')$q$,'PT403');
reset role;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, string_agg(name,', ') filter (where not ok) as failing from results;
rollback;
