-- 007: music. Playlists you share (or keep), the ready-made "Our dedicated songs", the songs in them,
-- and a lyrics cache that only the music helper function writes.
-- Apply AFTER 006 (it uses app_private.notify_partner), as postgres, in this one transaction.
-- Additive: nothing existing is dropped or changed. Re-runnable.
-- Songs are references only: a Spotify track, one of your own uploaded tracks, or a link. No audio is copied.
begin;

-- 1. Playlists. The dedicated one has no stored title: each phone shows it in its own language.
create table if not exists public.playlists (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  owner_id uuid not null references public.users_profiles(id),
  kind text not null default 'custom' check (kind in ('custom','dedicated')),
  title text check (title is null or char_length(btrim(title)) between 1 and 80),
  visibility text not null default 'shared' check (visibility in ('shared','private')),
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id),
  check ((kind='dedicated' and title is null and visibility='shared') or (kind='custom' and (title is not null or deleted_at is not null)))
);
create unique index if not exists playlists_one_dedicated on public.playlists(pair_id) where kind='dedicated' and deleted_at is null;
create index if not exists playlists_pair on public.playlists(pair_id,created_at);

-- 2. Songs in a playlist, in order. position has gaps so a move rarely renumbers.
create table if not exists public.playlist_items (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  playlist_id uuid not null references public.playlists(id),
  added_by uuid not null references public.users_profiles(id),
  source text not null check (source in ('spotify','upload','link')),
  ref text not null check (char_length(ref) between 1 and 2048),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  artist text check (artist is null or char_length(artist)<=200),
  cover_url text check (cover_url is null or cover_url ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$'),
  duration_ms integer check (duration_ms is null or duration_ms between 1 and 7200000),
  note text check (note is null or char_length(note) between 1 and 500),
  position bigint not null,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  foreign key (pair_id,added_by) references public.pair_members(pair_id,profile_id),
  constraint playlist_items_ref_shape check (
    (source='spotify' and ref ~ '^spotify:track:[A-Za-z0-9]{22}$')
    or (source='upload' and ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (source='link' and ref ~ '^https://[^[:space:]@]+$'))
);
create index if not exists playlist_items_order on public.playlist_items(playlist_id,position) where deleted_at is null;
create index if not exists playlist_items_pair on public.playlist_items(pair_id);

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
revoke all on public.playlists,public.playlist_items from public,anon,authenticated,service_role;
grant select on public.playlists,public.playlist_items to authenticated;
drop policy if exists playlists_read on public.playlists;
create policy playlists_read on public.playlists for select to authenticated
  using (pair_id=app_private.my_pair() and (visibility='shared' or owner_id=app_private.my_id()));
drop policy if exists playlist_items_read on public.playlist_items;
create policy playlist_items_read on public.playlist_items for select to authenticated
  using (pair_id=app_private.my_pair() and exists(select 1 from public.playlists p where p.id=playlist_id
    and (p.visibility='shared' or p.owner_id=app_private.my_id())));

-- Internal: the playlist a write may touch (visible to me, not deleted).
create or replace function app_private.my_playlist(p_id uuid) returns public.playlists
language plpgsql security definer set search_path='' as $$
declare v public.playlists;
begin
 select * into v from public.playlists where id=p_id and pair_id=app_private.my_pair()
   and deleted_at is null and (visibility='shared' or owner_id=app_private.my_id());
 if not found then raise exception 'Playlist unavailable' using errcode='42501'; end if;
 return v;
end $$;
revoke all on function app_private.my_playlist(uuid) from public,anon,authenticated,service_role;

-- 3. The pair's "Our dedicated songs". Same call from both phones returns the same playlist.
create or replace function public.ensure_dedicated_playlist(p_id uuid) returns public.playlists
language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v public.playlists;
begin
 if p_id is null then raise exception 'Playlist UUID required' using errcode='22023'; end if;
 select * into v from public.playlists where pair_id=v_pair and kind='dedicated' and deleted_at is null;
 if found then return v; end if;
 if exists(select 1 from public.playlists where id=p_id) then raise exception 'Playlist ID conflict' using errcode='23505'; end if;
 insert into public.playlists(id,pair_id,owner_id,kind,title,visibility) values(p_id,v_pair,v_me,'dedicated',null,'shared')
 on conflict do nothing returning * into v;
 -- the other phone may have created it a moment ago
 if v.id is null then select * into v from public.playlists where pair_id=v_pair and kind='dedicated' and deleted_at is null; end if;
 perform app_private.signal(true);
 return v;
end $$;

-- 4. Create, rename or change who sees one of your playlists.
create or replace function public.save_playlist(p_id uuid,p_expected_version bigint,p_title text,p_visibility text)
returns public.playlists language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_old public.playlists; v public.playlists;
begin
 if p_id is null or p_expected_version is null or p_expected_version<0 or p_visibility not in ('shared','private')
   or p_title is null or char_length(btrim(p_title)) not between 1 and 80 then
   raise exception 'Invalid playlist arguments' using errcode='22023'; end if;
 select * into v_old from public.playlists where id=p_id;
 if found then
   if v_old.owner_id<>v_me or v_old.pair_id<>v_pair or v_old.deleted_at is not null or v_old.kind<>'custom' then
     raise exception 'Playlist unavailable' using errcode='42501'; end if;
   if v_old.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
   update public.playlists set title=btrim(p_title),visibility=p_visibility,version=version+1,updated_at=clock_timestamp()
   where id=p_id returning * into v;
 else
   if p_expected_version<>0 then raise exception 'Version conflict' using errcode='40001'; end if;
   if (select count(*) from public.playlists where pair_id=v_pair)>=200 then
     raise exception 'Playlist quota: 200 per pair' using errcode='54000'; end if;
   insert into public.playlists(id,pair_id,owner_id,kind,title,visibility) values(p_id,v_pair,v_me,'custom',btrim(p_title),p_visibility)
   returning * into v;
 end if;
 perform app_private.signal(v.visibility='shared' or coalesce(v_old.visibility='shared',false));
 return v;
end $$;

create or replace function public.delete_playlist(p_id uuid,p_expected_version bigint) returns void
language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_old public.playlists;
begin
 select * into v_old from public.playlists where id=p_id and owner_id=v_me and pair_id=app_private.my_pair();
 if not found or v_old.kind<>'custom' then raise exception 'Playlist unavailable' using errcode='42501'; end if;
 if v_old.deleted_at is not null then return; end if;
 if v_old.version is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 update public.playlist_items set deleted_at=clock_timestamp(),note=null,version=version+1,updated_at=clock_timestamp()
 where playlist_id=p_id and deleted_at is null;
 update public.playlists set deleted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=p_id;
 perform app_private.signal(v_old.visibility='shared');
end $$;

-- 5. Add a song at the end. Same id + same song returns the stored row (safe retry).
-- Adding to a shared playlist tells your partner: a dedication when it carries a note in
-- "Our dedicated songs", otherwise "added a song".
create or replace function public.add_playlist_item(p_id uuid,p_playlist_id uuid,p_source text,p_ref text,p_title text,
  p_artist text,p_cover_url text,p_duration_ms integer,p_note text)
returns public.playlist_items language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_list public.playlists; v public.playlist_items; v_pos bigint;
begin
 if p_id is null or p_playlist_id is null then raise exception 'Song UUID required' using errcode='22023'; end if;
 select * into v from public.playlist_items where id=p_id;
 if found then
   if v.added_by<>v_me or v.pair_id<>v_pair or v.playlist_id<>p_playlist_id or v.source is distinct from p_source or v.ref is distinct from p_ref then
     raise exception 'Song ID conflict' using errcode='23505'; end if;
   return v;
 end if;
 v_list:=app_private.my_playlist(p_playlist_id);
 if p_source='upload' and not exists(select 1 from public.content_items c where c.id::text=p_ref and c.pair_id=v_pair
     and c.item_type='track' and c.deleted_at is null and (c.visibility='shared' or c.owner_id=v_me)) then
   raise exception 'Track unavailable' using errcode='42501'; end if;
 if (select count(*) from public.playlist_items where playlist_id=p_playlist_id and deleted_at is null)>=2000 then
   raise exception 'Playlist quota: 2000 songs' using errcode='54000'; end if;
 if (select count(*) from public.playlist_items where pair_id=v_pair)>=20000 then
   raise exception 'Song quota: 20000 per pair' using errcode='54000'; end if;
 select coalesce(max(position),0)+1024 into v_pos from public.playlist_items where playlist_id=p_playlist_id;
 insert into public.playlist_items(id,pair_id,playlist_id,added_by,source,ref,title,artist,cover_url,duration_ms,note,position)
 values(p_id,v_pair,p_playlist_id,v_me,p_source,p_ref,btrim(p_title),nullif(btrim(p_artist),''),p_cover_url,p_duration_ms,nullif(btrim(p_note),''),v_pos)
 returning * into v;
 if v_list.visibility='shared' then
   begin
     perform app_private.notify_partner(p_id,case when v_list.kind='dedicated' and v.note is not null then 'dedication' else 'song_added' end,p_id);
   exception when sqlstate '54000' then null; -- over the daily notification quota: the song is still added
   end;
 end if;
 perform app_private.signal(v_list.visibility='shared');
 return v;
end $$;

-- 6. Change the note on a song you added.
create or replace function public.update_playlist_item(p_id uuid,p_expected_version bigint,p_note text)
returns public.playlist_items language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_old public.playlist_items; v public.playlist_items; v_list public.playlists;
begin
 select * into v_old from public.playlist_items where id=p_id and pair_id=app_private.my_pair();
 if not found or v_old.added_by<>v_me or v_old.deleted_at is not null then raise exception 'Song unavailable' using errcode='42501'; end if;
 v_list:=app_private.my_playlist(v_old.playlist_id);
 if v_old.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 update public.playlist_items set note=nullif(btrim(p_note),''),version=version+1,updated_at=clock_timestamp() where id=p_id returning * into v;
 perform app_private.signal(v_list.visibility='shared');
 return v;
end $$;

-- 7. Move a song after another one (null: to the top). Both of you can reorder a shared playlist.
create or replace function public.move_playlist_item(p_id uuid,p_expected_version bigint,p_after_id uuid)
returns public.playlist_items language plpgsql security definer set search_path='' as $$
declare v_old public.playlist_items; v public.playlist_items; v_list public.playlists; v_lo bigint; v_hi bigint; v_pos bigint;
begin
 perform app_private.begin_write();
 select * into v_old from public.playlist_items where id=p_id and pair_id=app_private.my_pair() and deleted_at is null;
 if not found then raise exception 'Song unavailable' using errcode='42501'; end if;
 v_list:=app_private.my_playlist(v_old.playlist_id);
 if v_old.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if p_after_id=p_id then raise exception 'Cannot move after itself' using errcode='22023'; end if;
 for attempt in 1..2 loop
   if p_after_id is null then v_lo:=0;
   else select position into v_lo from public.playlist_items where id=p_after_id and playlist_id=v_old.playlist_id and deleted_at is null;
     if not found then raise exception 'Song unavailable' using errcode='42501'; end if; end if;
   select min(position) into v_hi from public.playlist_items where playlist_id=v_old.playlist_id and deleted_at is null and position>v_lo and id<>p_id;
   v_pos:=case when v_hi is null then v_lo+1024 else v_lo+(v_hi-v_lo)/2 end;
   exit when v_pos>v_lo and (v_hi is null or v_pos<v_hi);
   -- no room left between the two: spread the whole playlist out again, then retry once
   update public.playlist_items i set position=r.n*1024 from (select id,row_number() over(order by position,id) n from public.playlist_items
     where playlist_id=v_old.playlist_id) r where i.id=r.id;
 end loop;
 update public.playlist_items set position=v_pos,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into v;
 perform app_private.signal(v_list.visibility='shared');
 return v;
end $$;

-- 8. Take a song out: whoever added it, or the owner of a custom playlist.
create or replace function public.remove_playlist_item(p_id uuid,p_expected_version bigint) returns void
language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_old public.playlist_items; v_list public.playlists;
begin
 select * into v_old from public.playlist_items where id=p_id and pair_id=app_private.my_pair();
 if not found then raise exception 'Song unavailable' using errcode='42501'; end if;
 if v_old.deleted_at is not null then return; end if;
 v_list:=app_private.my_playlist(v_old.playlist_id);
 -- in "Our dedicated songs" only the person who dedicated a song can take it out
 if v_old.added_by<>v_me and not (v_list.kind='custom' and v_list.owner_id=v_me) then raise exception 'Song unavailable' using errcode='42501'; end if;
 if v_old.version is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 update public.playlist_items set deleted_at=clock_timestamp(),note=null,version=version+1,updated_at=clock_timestamp() where id=p_id;
 perform app_private.signal(v_list.visibility='shared');
end $$;

do $grants$
declare f text;
begin
 foreach f in array array['public.ensure_dedicated_playlist(uuid)','public.save_playlist(uuid,bigint,text,text)','public.delete_playlist(uuid,bigint)',
   'public.add_playlist_item(uuid,uuid,text,text,text,text,text,integer,text)','public.update_playlist_item(uuid,bigint,text)',
   'public.move_playlist_item(uuid,bigint,uuid)','public.remove_playlist_item(uuid,bigint)'] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $grants$;

-- 9. Lyrics cache, written only by the music helper function (service role), read through it.
-- One row per song signature; translations are stored once per language so each song is translated once.
create table if not exists public.music_lyrics (
  signature text primary key check (char_length(signature) between 3 and 600),
  track_name text not null,
  artist_name text not null,
  duration_s integer,
  synced text,
  plain text,
  instrumental boolean not null default false,
  source text not null check (source in ('lrclib','none')),
  fetched_at timestamptz not null default clock_timestamp()
);
create table if not exists public.music_lyric_translations (
  signature text not null references public.music_lyrics(signature) on delete cascade,
  lang text not null check (lang in ('en','es','fr','it')),
  lines jsonb not null check (jsonb_typeof(lines)='array'),
  provider text not null check (provider in ('deepl')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (signature,lang)
);
alter table public.music_lyrics enable row level security;
alter table public.music_lyric_translations enable row level security;
revoke all on public.music_lyrics,public.music_lyric_translations from public,anon,authenticated;
grant select,insert,update on public.music_lyrics,public.music_lyric_translations to service_role;

notify pgrst,'reload schema';

-- 10. Verification (read-only; any failure rolls everything back).
do $verify$
begin
 if to_regprocedure('app_private.notify_partner(uuid,text,uuid)') is null then raise exception '007: apply 006 first'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('playlists','playlist_items','music_lyrics','music_lyric_translations') and not c.relrowsecurity) then
   raise exception '007: RLS disabled'; end if;
 if has_table_privilege('anon','public.playlists','SELECT') or has_table_privilege('authenticated','public.playlists','INSERT')
    or has_table_privilege('authenticated','public.playlist_items','UPDATE') or has_table_privilege('authenticated','public.playlist_items','DELETE')
    or has_table_privilege('authenticated','public.music_lyrics','SELECT') or has_table_privilege('anon','public.music_lyric_translations','SELECT') then
   raise exception '007: unsafe table grant'; end if;
 if has_function_privilege('anon','public.add_playlist_item(uuid,uuid,text,text,text,text,text,integer,text)','EXECUTE')
    or has_function_privilege('authenticated','app_private.my_playlist(uuid)','EXECUTE') then
   raise exception '007: unsafe function grant'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where ((n.nspname='public' and p.proname in ('ensure_dedicated_playlist','save_playlist','delete_playlist','add_playlist_item','update_playlist_item','move_playlist_item','remove_playlist_item'))
       or (n.nspname='app_private' and p.proname='my_playlist'))
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception '007: functions need security definer with empty search_path'; end if;
end $verify$;
commit;
