-- LOCAL ONLY: behavioural check for 017 (videos, stickers, view once). Never run on production. Everything rolls back.
-- Usage: psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/talk-media-check.sql
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;
select pg_temp.as_user(:'oliver');
insert into results select 'a video message',(public.send_message('cc000000-0000-4000-8000-000000000001','video',null,'{"view":"twice","start":1.5,"end":9}',null)).kind='video';
insert into results select 'it takes a video file',(public.reserve_message_media('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','v.mp4','video/mp4')).status='pending';
insert into results select 'a photo to see once',(public.send_message('cc000000-0000-4000-8000-000000000002','photo',null,'{"view":"once"}',null)).kind='photo';
insert into results select 'the sender opening it does not count',public.view_media('cc000000-0000-4000-8000-000000000002')=0;
insert into results select 'a sticker of your own',(public.save_sticker('ce000000-0000-4000-8000-000000000001','data:image/png;base64,iVBORw0KGgo=')).owner_id is not null;
insert into results select 'a sticker message',(public.send_message('cc000000-0000-4000-8000-000000000003','sticker',null,'{"sticker":"ce000000-0000-4000-8000-000000000001"}',null)).kind='sticker';
insert into results select 'not just any text as an image',pg_temp.fails($q$select public.save_sticker('ce000000-0000-4000-8000-000000000002','javascript:alert(1)')$q$,'23514');
select pg_temp.as_user(:'yasmine');
insert into results select 'she opens it once',public.view_media('cc000000-0000-4000-8000-000000000002')=1;
insert into results select 'not a second time',pg_temp.fails($q$select public.view_media('cc000000-0000-4000-8000-000000000002')$q$,'PT403');
insert into results select 'twice means twice',public.view_media('cc000000-0000-4000-8000-000000000001')=1 and public.view_media('cc000000-0000-4000-8000-000000000001')=2;
insert into results select 'she sees his sticker',(select count(*) from public.stickers)>=1;
insert into results select 'she cannot delete his sticker',pg_temp.fails($q$select public.delete_sticker('ce000000-0000-4000-8000-000000000001')$q$,'42501');
reset role;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, string_agg(name,', ') filter (where not ok) as failing from results;
rollback;
