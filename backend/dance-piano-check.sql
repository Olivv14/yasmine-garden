-- LOCAL ONLY: behavioural check for 013 (dance and piano tiles). Never run on production. Everything rolls back.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/dance-piano-check.sql
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;
delete from public.shop_purchases; delete from public.shop_choices;
delete from public.play_answers; delete from public.play_rounds; delete from public.game_events;
delete from public.dance_ratings; delete from public.pair_story; delete from public.media_files where message_id in (select id from public.messages where kind in ('dance','letter')); delete from public.messages where kind in ('dance','letter');
-- Oliver films a step
select pg_temp.as_user(:'oliver');
insert into results select 'a step is a dance message',(public.send_message('da000000-0000-4000-8000-000000000001','dance',null,'{"role":"step","style":"bachata"}',null)).kind='dance';
insert into results select 'a dance needs a role',pg_temp.fails($q$select public.send_message('da000000-0000-4000-8000-000000000009','dance',null,'{"style":"bachata"}',null)$q$,'23514');
insert into results select 'a copy needs its step',pg_temp.fails($q$select public.send_message('da000000-0000-4000-8000-000000000008','dance',null,'{"role":"copy"}',null)$q$,'23514');
insert into results select 'the step takes a video',(public.reserve_message_media('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','step.mp4','video/mp4')).status='pending';
insert into results select 'not a photo on a dance',pg_temp.fails($q$select public.reserve_message_media('db000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000001','x.jpg','image/jpeg')$q$,'23505')
  or pg_temp.fails($q$select public.reserve_message_media('db000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000001','x.jpg','image/jpeg')$q$,'22023');
insert into results select 'one video per step',pg_temp.fails($q$select public.reserve_message_media('db000000-0000-4000-8000-000000000003','da000000-0000-4000-8000-000000000001','b.mp4','video/mp4')$q$,'54000');
insert into results select 'photos still work',pg_temp.fails($q$select public.reserve_message_media('db000000-0000-4000-8000-000000000004','da000000-0000-4000-8000-000000000001','b.mov','video/x-flv')$q$,'22023');
insert into results select 'a letter for later keeps its day',(public.send_message('da000000-0000-4000-8000-000000000005','letter','Para tu cumpleaños','{"opens_at":"2027-03-14"}',null)).payload->>'opens_at'='2027-03-14';
insert into results select 'a letter needs a day',pg_temp.fails($q$select public.send_message('da000000-0000-4000-8000-000000000006','letter','x','{}',null)$q$,'23514');
-- piano: score and stars
insert into results select 'a piano result saves',(public.record_game_event('e2000000-0000-4000-8000-000000000001','piano','finish',null,'Our song',1840::smallint,3::smallint)).game='piano';
insert into results select 'four stars do not exist',pg_temp.fails($q$select public.record_game_event('e2000000-0000-4000-8000-000000000002','piano','finish',null,'x',10::smallint,4::smallint)$q$,'23514');
-- Yasmine copies it
select pg_temp.as_user(:'yasmine');
insert into results select 'the copy points to the step',(public.send_message('da000000-0000-4000-8000-000000000002','dance',null,'{"role":"copy","style":"bachata","of":"da000000-0000-4000-8000-000000000001"}',null)).payload->>'of'='da000000-0000-4000-8000-000000000001';
insert into results select 'you do not rate your own copy',pg_temp.fails($q$select public.rate_dance('da000000-0000-4000-8000-000000000002',3::smallint)$q$,'42501');
select pg_temp.as_user(:'oliver');
insert into results select 'the one who filmed the step rates',(public.rate_dance('da000000-0000-4000-8000-000000000002',2::smallint)).hearts=2;
insert into results select 'and can change his mind',(public.rate_dance('da000000-0000-4000-8000-000000000002',3::smallint)).hearts=3;
insert into results select 'four hearts do not exist',pg_temp.fails($q$select public.rate_dance('da000000-0000-4000-8000-000000000002',4::smallint)$q$,'22023');
insert into results select 'a step is not rated',pg_temp.fails($q$select public.rate_dance('da000000-0000-4000-8000-000000000001',2::smallint)$q$,'42501');
insert into results select 'no direct writes',pg_temp.fails($q$insert into public.dance_ratings(copy_id,pair_id,rater_id,hearts) values('da000000-0000-4000-8000-000000000002',app_private.my_pair(),app_private.my_id(),1)$q$,'42501');
insert into results select 'the day you got together',(public.set_together_since('2026-04-20')).together_since='2026-04-20';
insert into results select 'not a day from the future',pg_temp.fails($q$select public.set_together_since(current_date+30)$q$,'22023');
create temp table me_id as select app_private.my_id() as id; grant all on me_id to authenticated;
reset role;
insert into results select 'piano stars count as points',app_private.points_earned((select id from me_id))=3;
select pg_temp.as_user(:'yasmine');
insert into results select 'the partner sees the hearts',(select hearts from public.dance_ratings)=3;
insert into results select 'the partner sees the day',(select together_since from public.pair_story)='2026-04-20';
reset role;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, string_agg(name,', ') filter (where not ok) as failing from results;
rollback;
