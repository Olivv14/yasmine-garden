-- LOCAL ONLY: behavioural check for 008 (Talk) and 009 (push for bell rows). Never run on production.
-- Usage: apply 008 and 009 first (or prepend them in the same session), then
--   psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/talk-check.sql   (everything rolls back)
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon, service_role;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;

-- a push device for Yasmine, so new bell rows capture a delivery (as the owner, like register_my_push would)
insert into app_private.push_subscriptions(id,owner_id,pair_id,endpoint,p256dh,auth_secret,enabled,preview)
select 'd0000000-0000-4000-8000-0000000000aa',p.id,m.pair_id,'https://web.push.apple.com/check-endpoint',repeat('A',87),repeat('B',22),true,true
from public.users_profiles p join public.pair_members m on m.profile_id=p.id where p.auth_user_id=:'yasmine';

select pg_temp.as_user(:'oliver');
insert into results select 'text sent',(public.send_message('e0000000-0000-4000-8000-000000000001','text','Hola mi amor',null,null)).kind='text';
insert into results select 'retry returns the same message',(public.send_message('e0000000-0000-4000-8000-000000000001','text','Hola mi amor',null,null)).body='Hola mi amor';
insert into results select 'changed retry conflicts',pg_temp.fails($q$select public.send_message('e0000000-0000-4000-8000-000000000001','song',null,'{"title":"x"}',null)$q$,'23505');
insert into results select 'empty text rejected',pg_temp.fails($q$select public.send_message('e0000000-0000-4000-8000-000000000009','text','   ',null,null)$q$,'23514');
insert into results select 'over 4000 characters rejected',pg_temp.fails(format($q$select public.send_message('e0000000-0000-4000-8000-000000000008','text',%L,null,null)$q$,repeat('a',4001)),'23514');
insert into results select 'reply to an unknown message rejected',pg_temp.fails($q$select public.send_message('e0000000-0000-4000-8000-000000000007','text','x',null,'e0000000-0000-4000-8000-0000000000ff')$q$,'42501');
insert into results select 'song needs its details',pg_temp.fails($q$select public.send_message('e0000000-0000-4000-8000-000000000006','song',null,null,null)$q$,'23514');
insert into results select 'song sent as a reply',(public.send_message('e0000000-0000-4000-8000-000000000002','song',null,'{"title":"Despacito","artist":"Luis Fonsi"}','e0000000-0000-4000-8000-000000000001')).reply_to='e0000000-0000-4000-8000-000000000001';
insert into results select 'photo message sent',(public.send_message('e0000000-0000-4000-8000-000000000003','photo',null,null,null)).kind='photo';
insert into results select 'photo upload reserved',(public.reserve_message_media('f0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000003','a.jpg','image/jpeg')).message_id='e0000000-0000-4000-8000-000000000003';
insert into results select 'one upload per message',pg_temp.fails($q$select public.reserve_message_media('f0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003','b.jpg','image/jpeg')$q$,'54000');
insert into results select 'audio is not a photo',pg_temp.fails($q$select public.reserve_message_media('f0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000002','c.m4a','audio/mp4')$q$,'22023');
insert into results select 'sender sees no message bell rows',count(*)=0 from public.notifications;
insert into results select 'his pending upload is readable to him',app_private.can_media((select object_key from public.media_files where id='f0000000-0000-4000-8000-000000000001'),'read');

-- the push dispatch as the Edge Function would run it: service role, with the verified sender
reset role;
select set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
set local role service_role;
insert into results select 'only the sender can dispatch',pg_temp.fails(format($q$select public.push_claim_notification('e0000000-0000-4000-8000-000000000001',%L)$q$,:'yasmine'),'42501');
create temp table claimed on commit drop as select public.push_claim_notification('e0000000-0000-4000-8000-000000000001',:'oliver') as t;
insert into results select 'one device claimed, with the words as preview',(select jsonb_array_length(t)=1 and t->0->>'text'='Hola mi amor' and t->0->>'kind'='message' and t->0->>'sender' is not null from claimed);
insert into results select 'delivery completed',public.push_complete_notification('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000aa',(select (t->0->>'lease_token')::uuid from claimed),'accepted');
insert into results select 'status counts the accepted push',(public.push_status_notification('e0000000-0000-4000-8000-000000000001')->>'provider_accepted')::int=1;
insert into results select 'a photo has no words to preview',(select (public.push_claim_notification('e0000000-0000-4000-8000-000000000003',:'oliver'))->0->>'text' is null);
reset role;

select pg_temp.as_user(:'yasmine');
insert into results select 'she reads the three messages',count(*)=3 from public.messages;
insert into results select 'she has three message bell rows',count(*)=3 from public.notifications where kind='message' and read_at is null;
insert into results select 'his pending photo is not readable to her yet',not app_private.can_media((select object_key from public.media_files where id='f0000000-0000-4000-8000-000000000001'),'read');
insert into results select 'she reacts',public.react_message('e0000000-0000-4000-8000-000000000001','❤️')=1;
insert into results select 'reaction changed',public.react_message('e0000000-0000-4000-8000-000000000001','😂')=1;
-- a statement sees the data as it was when it started: count in the next one
insert into results select 'changing the reaction keeps one',(select count(*)=1 and min(emoji)='😂' from public.message_reactions);
insert into results select 'unknown emoji rejected',pg_temp.fails($q$select public.react_message('e0000000-0000-4000-8000-000000000001','💩')$q$,'23514');
insert into results select 'she cannot edit his message',pg_temp.fails($q$select public.edit_message('e0000000-0000-4000-8000-000000000001','mine now')$q$,'42501');
insert into results select 'she cannot delete his message',pg_temp.fails($q$select public.delete_message('e0000000-0000-4000-8000-000000000001')$q$,'42501');
insert into results with r as materialized (select public.mark_chat_read(clock_timestamp()) v) select 'read mark saved',count(*)=1 from r;
insert into results select 'reading clears her message bell rows',count(*)=0 from public.notifications where kind='message' and read_at is null;
insert into results select 'she can reply',(public.send_message('e0000000-0000-4000-8000-000000000004','text','Te extraño',null,'e0000000-0000-4000-8000-000000000001')).reply_to is not null;
insert into results select 'no direct writes',pg_temp.fails($q$update public.messages set body='x'$q$,'42501');

select pg_temp.as_user(:'oliver');
insert into results select 'he sees her read mark',(select count(*)=1 from public.chat_reads where profile_id<>app_private.my_id());
insert into results select 'he edits his words',(public.edit_message('e0000000-0000-4000-8000-000000000001','Hola, mi amor')).edited_at is not null;
insert into results select 'photo caption can be added',(public.edit_message('e0000000-0000-4000-8000-000000000003','Look at this')).body='Look at this';
insert into results select 'a song has no words to edit',pg_temp.fails($q$select public.edit_message('e0000000-0000-4000-8000-000000000002','x')$q$,'22023');
insert into results select 'he deletes the photo message',(public.delete_message('e0000000-0000-4000-8000-000000000003')).deleted_at is not null;
insert into results select 'its upload is marked for removal',(select status='deleting' from public.media_files where id='f0000000-0000-4000-8000-000000000001');
insert into results select 'the tombstone keeps no words',(select body is null and payload is null from public.messages where id='e0000000-0000-4000-8000-000000000003');
insert into results select 'deleting twice is fine',(public.delete_message('e0000000-0000-4000-8000-000000000003')).id is not null;
insert into results select 'no reactions on a deleted message',pg_temp.fails($q$select public.react_message('e0000000-0000-4000-8000-000000000003','❤️')$q$,'42501');
reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
insert into results select 'anon has no access',pg_temp.fails($q$select count(*) from public.messages$q$,'42501');
reset role;
select name,ok from results order by ok,name;
select case when bool_and(ok) then 'ALL PASS' else 'FAILURES' end as summary,count(*) from results;
rollback;
