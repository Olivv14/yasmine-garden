-- LOCAL ONLY: behavioural check for 007 against a synthetic enrolled pair. Never run on production.
-- Usage: apply 007 first (or include it in the same session), then
--   psql -v oliver=<auth uuid> -v yasmine=<auth uuid> -f backend/music-check.sql   (everything rolls back)
begin;
create temp table results(name text,ok boolean) on commit drop;
grant all on results to authenticated, anon;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true); perform set_config('role','authenticated',true); end $$;
create or replace function pg_temp.fails(p_sql text,p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate=p_state; end $$;

-- Oliver: the dedicated playlist, a private one, songs.
select pg_temp.as_user(:'oliver');
insert into results select 'dedicated playlist created',(public.ensure_dedicated_playlist('a0000000-0000-4000-8000-000000000001')).kind='dedicated';
insert into results select 'dedicated has no stored title',(select title is null from public.playlists where id='a0000000-0000-4000-8000-000000000001');
insert into results select 'private playlist created',(public.save_playlist('a0000000-0000-4000-8000-000000000002',0,'Just mine','private')).visibility='private';
insert into results select 'stale version conflicts',pg_temp.fails($q$select public.save_playlist('a0000000-0000-4000-8000-000000000002',0,'x','private')$q$,'40001');
insert into results select 'rename with version',(public.save_playlist('a0000000-0000-4000-8000-000000000002',1,'Mine','private')).version=2;
insert into results select 'empty title rejected',pg_temp.fails($q$select public.save_playlist('a0000000-0000-4000-8000-000000000009',0,'  ','shared')$q$,'22023');
insert into results select 'dedication added',(public.add_playlist_item('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','spotify','spotify:track:4uLU6hMCjMI75M1A2tKUQC','Never Gonna Give You Up','Rick Astley','https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02ef0d4234e1a645740f77d59c',213573,'For you, always')).position=1024;
insert into results select 'retry returns the same song',(public.add_playlist_item('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','spotify','spotify:track:4uLU6hMCjMI75M1A2tKUQC','Never Gonna Give You Up','Rick Astley',null,null,null)).note='For you, always';
insert into results select 'changed retry conflicts',pg_temp.fails($q$select public.add_playlist_item('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','spotify','spotify:track:0000000000000000000000','x',null,null,null,null)$q$,'23505');
insert into results select 'bad spotify ref rejected',pg_temp.fails($q$select public.add_playlist_item('b0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000001','spotify','https://evil.example/track','x',null,null,null,null)$q$,'23514');
insert into results select 'foreign cover host rejected',pg_temp.fails($q$select public.add_playlist_item('b0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000001','spotify','spotify:track:4uLU6hMCjMI75M1A2tKUQC','x',null,'https://evil.example/a.png',null,null)$q$,'23514');
insert into results select 'unknown upload rejected',pg_temp.fails($q$select public.add_playlist_item('b0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000001','upload','e0000000-0000-4000-8000-000000000001','x',null,null,null,null)$q$,'42501');
insert into results select 'second song appended',(public.add_playlist_item('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','link','https://open.spotify.com/track/abc','Another one',null,null,null,null)).position=2048;
insert into results select 'third song appended',(public.add_playlist_item('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','spotify','spotify:track:7GhIk7Il098yCjg4BQjzvb','Third',null,null,null,null)).position=3072;
insert into results select 'private song added',(public.add_playlist_item('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002','spotify','spotify:track:7GhIk7Il098yCjg4BQjzvb','Secret',null,null,null,null)).id is not null;
-- BETWEEN would evaluate the call twice; materialize it once
insert into results with m as materialized (select (public.move_playlist_item('b0000000-0000-4000-8000-000000000003',1,null)).position p) select 'move to the top',p>=1 and p<=1023 from m;
insert into results select 'order after move',(select array_agg(title order by position) from public.playlist_items where playlist_id='a0000000-0000-4000-8000-000000000001' and deleted_at is null)=array['Third','Never Gonna Give You Up','Another one'];
insert into results select 'move after a song',(public.move_playlist_item('b0000000-0000-4000-8000-000000000003',2,'b0000000-0000-4000-8000-000000000002')).position>2048;
insert into results select 'cannot move after itself',pg_temp.fails($q$select public.move_playlist_item('b0000000-0000-4000-8000-000000000003',3,'b0000000-0000-4000-8000-000000000003')$q$,'22023');
insert into results select 'sender sees no notifications',count(*)=0 from public.notifications;

-- Yasmine: sees shared, not private; gets the dedication; same dedicated playlist; cannot remove his dedication.
select pg_temp.as_user(:'yasmine');
insert into results select 'partner sees the shared playlist only',(select array_agg(id::text order by id) from public.playlists)=array['a0000000-0000-4000-8000-000000000001'];
insert into results select 'partner does not see the private song',count(*)=0 from public.playlist_items where id='b0000000-0000-4000-8000-000000000004';
insert into results select 'partner sees three shared songs',count(*)=3 from public.playlist_items where deleted_at is null;
insert into results select 'dedication notification',(select kind from public.notifications where id='b0000000-0000-4000-8000-000000000001')='dedication';
insert into results select 'song_added notification',(select kind from public.notifications where id='b0000000-0000-4000-8000-000000000002')='song_added';
insert into results select 'one dedicated playlist for both',(public.ensure_dedicated_playlist('a0000000-0000-4000-8000-000000000005')).id='a0000000-0000-4000-8000-000000000001';
insert into results select 'partner cannot touch the private playlist',pg_temp.fails($q$select public.add_playlist_item('b0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000002','spotify','spotify:track:7GhIk7Il098yCjg4BQjzvb','x',null,null,null,null)$q$,'42501');
insert into results select 'partner cannot remove his dedication',pg_temp.fails($q$select public.remove_playlist_item('b0000000-0000-4000-8000-000000000001',1)$q$,'42501');
insert into results select 'partner cannot edit his note',pg_temp.fails($q$select public.update_playlist_item('b0000000-0000-4000-8000-000000000001',1,'mine now')$q$,'42501');
insert into results select 'partner can reorder a shared playlist',(public.move_playlist_item('b0000000-0000-4000-8000-000000000001',1,null)).position<(select min(position) from public.playlist_items where playlist_id='a0000000-0000-4000-8000-000000000001' and id<>'b0000000-0000-4000-8000-000000000001' and deleted_at is null);
insert into results select 'partner adds her own song',(public.add_playlist_item('b0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','spotify','spotify:track:3n3Ppam7vgaVa1iaRUc9Lp','Hers',null,null,null,'')).note is null;
insert into results select 'no direct writes',pg_temp.fails($q$update public.playlist_items set title='x'$q$,'42501');
insert into results select 'lyrics cache is not readable from the app',pg_temp.fails($q$select count(*) from public.music_lyrics$q$,'42501');

-- Oliver again: remove his dedication, delete his private playlist.
select pg_temp.as_user(:'oliver');
insert into results with r as materialized (select public.remove_playlist_item('b0000000-0000-4000-8000-000000000001',2)::text v) select 'he removes his dedication',count(*)=1 from r;
insert into results with r as materialized (select public.remove_playlist_item('b0000000-0000-4000-8000-000000000001',2)::text v) select 'removal is idempotent',count(*)=1 from r;
insert into results select 'removed note is cleared',(select note is null and deleted_at is not null from public.playlist_items where id='b0000000-0000-4000-8000-000000000001');
insert into results select 'he cannot remove her song from the dedicated list',pg_temp.fails($q$select public.remove_playlist_item('b0000000-0000-4000-8000-000000000010',1)$q$,'42501');
insert into results select 'dedicated playlist cannot be deleted',pg_temp.fails($q$select public.delete_playlist('a0000000-0000-4000-8000-000000000001',1)$q$,'42501');
insert into results with r as materialized (select public.delete_playlist('a0000000-0000-4000-8000-000000000002',2)::text v) select 'private playlist deleted',count(*)=1 from r;
insert into results select 'its songs are tombstoned',(select bool_and(deleted_at is not null) from public.playlist_items where playlist_id='a0000000-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
insert into results select 'anon has no access',pg_temp.fails($q$select count(*) from public.playlists$q$,'42501');
reset role;
select name,ok from results order by ok,name;
select case when bool_and(ok) then 'ALL PASS' else 'FAILURES' end as summary,count(*) from results;
rollback;
