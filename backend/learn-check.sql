-- LOCAL ONLY: behavioural check for 014 (Learn). Never run on production. Everything rolls back.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/learn-check.sql
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;
delete from public.learn_state; delete from public.learn_days;
delete from public.shop_purchases; delete from public.shop_choices; delete from public.play_answers; delete from public.play_rounds; delete from public.game_events;
select pg_temp.as_user(:'oliver');
insert into results select 'a first review saves the card',(public.learn_review('it.amore','{"due":"2026-11-20T10:10:00Z","stability":2.3,"difficulty":2.1,"elapsed_days":0,"scheduled_days":0,"learning_steps":1,"reps":1,"lapses":0,"state":1,"last_review":"2026-11-20T10:00:00Z"}')).reps=1;
insert into results select 'the same review again is a safe retry',(public.learn_review('it.amore','{"due":"2026-11-20T10:10:00Z","stability":2.3,"difficulty":2.1,"elapsed_days":0,"scheduled_days":0,"learning_steps":1,"reps":1,"lapses":0,"state":1,"last_review":"2026-11-20T10:00:00Z"}')).reps=1;
insert into results select 'skipping reviews is refused',pg_temp.fails($q$select public.learn_review('it.amore','{"due":"2026-11-22T10:10:00Z","stability":3,"difficulty":2,"elapsed_days":2,"scheduled_days":2,"reps":5,"lapses":0,"state":2,"last_review":"2026-11-20T10:10:00Z"}')$q$,'PT409');
insert into results select 'unknown decks are refused',pg_temp.fails($q$select public.learn_review('xx.word','{"due":"2026-11-22T10:10:00Z","stability":3,"difficulty":2,"elapsed_days":2,"scheduled_days":2,"reps":1,"lapses":0,"state":2}')$q$,'23514');
insert into results select 'a taught word must exist',pg_temp.fails($q$select public.learn_review('w:00000000-0000-4000-8000-000000000000','{"due":"2026-11-22T10:10:00Z","stability":3,"difficulty":2,"elapsed_days":2,"scheduled_days":2,"reps":1,"lapses":0,"state":2}')$q$,'22023');
-- teach a word with your voice
insert into results select 'teach a word',(public.send_message('ee000000-0000-4000-8000-000000000001','word',null,'{"word":"chévere","meaning":"cool, great","lang":"es-VE","teach":true}',null)).kind='word';
insert into results select 'with your voice',(public.reserve_message_media('ee000000-0000-4000-8000-000000000002','ee000000-0000-4000-8000-000000000001','word.m4a','audio/mp4')).status='pending';
-- nine more reviews today: ten in all, a point
do $$ declare i int; begin for i in 1..9 loop perform public.learn_review('it.c'||i,('{"due":"2026-11-21T10:00:00Z","stability":1,"difficulty":5,"elapsed_days":0,"scheduled_days":1,"reps":1,"lapses":0,"state":1}')::jsonb); end loop; end $$;
insert into results select 'ten reviews today',(select reviews from public.learn_days)=10;
insert into results select 'no direct writes',pg_temp.fails($q$update public.learn_days set reviews=1000$q$,'42501');
create temp table me_id as select app_private.my_id() as id; grant all on me_id to authenticated;
select pg_temp.as_user(:'yasmine');
insert into results select 'she reviews the word he taught',(public.learn_review('w:ee000000-0000-4000-8000-000000000001','{"due":"2026-11-21T10:00:00Z","stability":1,"difficulty":5,"elapsed_days":0,"scheduled_days":1,"reps":1,"lapses":0,"state":1}')).card_key like 'w:%';
insert into results select 'she sees his progress',(select count(*) from public.learn_state where profile_id=(select id from me_id))=10;
reset role;
insert into results select 'ten reviews are a point',app_private.points_earned((select id from me_id))=1;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, string_agg(name,', ') filter (where not ok) as failing from results;
rollback;
