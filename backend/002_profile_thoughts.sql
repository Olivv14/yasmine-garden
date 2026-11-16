-- Additive dedicated-project extension. Apply AFTER 001 and its base verify.sql.
-- Re-runnable exact schema, not arbitrary schema-drift repair. No identities/secrets.
begin;

create table if not exists public.profile_details (
  profile_id uuid primary key references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  bio text not null default '' check (length(bio)<=280),
  mood_animal text not null default 'none' check (mood_animal in ('none','calm','hopeful','nostalgic','hug','difficult')),
  version bigint not null default 1 check (version>0),
  updated_at timestamptz not null default now(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create index if not exists profile_details_pair on public.profile_details(pair_id);
create table if not exists public.profile_preferences (
  profile_id uuid primary key references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  theme text not null check (theme in ('dark','light','pastel','barcelona','tunisia','italy','lavender','ocean','forest','rose')),
  locale text not null check (locale in ('en','fr','aeb-TN')),
  partner_nickname text check (partner_nickname is null or (partner_nickname=btrim(partner_nickname) and length(partner_nickname) between 1 and 80)),
  version bigint not null default 1 check (version>0),
  updated_at timestamptz not null default now(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create index if not exists profile_preferences_pair on public.profile_preferences(pair_id);
create table if not exists public.profile_avatars (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  owner_id uuid not null references public.users_profiles(id),
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  status text not null default 'pending' check (status in ('pending','ready','deleting')),
  active boolean not null default false,
  expected_active_id uuid,
  reserved_bytes bigint not null default 1048576 check (reserved_bytes between 1 and 1048576),
  size_bytes bigint check (size_bytes between 1 and 1048576),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id),
  check (not active or status='ready'),
  check ((status='ready' and size_bytes is not null and reserved_bytes=size_bytes) or status<>'ready')
);
-- Append to the composite return shape (including upgrades from the old 002).
-- On first upgrade, pre-fix pending history cannot establish publication authority:
-- conservatively revoke only those existing pending operations, retaining cleanup/charge.
do $$ begin
 if not exists(select 1 from pg_attribute where attrelid='public.profile_avatars'::regclass
   and attname='publication_invalidated' and not attisdropped) then
   alter table public.profile_avatars add column publication_invalidated boolean not null default false;
   update public.profile_avatars set publication_invalidated=true where status='pending';
 end if;
end $$;
create unique index if not exists profile_avatar_one_active on public.profile_avatars(owner_id) where active;
create index if not exists profile_avatars_pair on public.profile_avatars(pair_id);
create table if not exists app_private.retired_avatar_ids (
  id uuid primary key,
  owner_id uuid not null,
  retired_at timestamptz not null default clock_timestamp()
);
create index if not exists retired_avatar_owner on app_private.retired_avatar_ids(owner_id);
create table if not exists app_private.avatar_limits (
  profile_id uuid primary key references public.users_profiles(id),
  day_at date not null,
  reservations integer not null check (reservations between 1 and 10)
);
create table if not exists public.thought_events (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  sender_id uuid not null references public.users_profiles(id),
  recipient_id uuid not null references public.users_profiles(id),
  phrase_key text not null check (phrase_key ~ '^affection\.phrase(0[1-9]|10)$'),
  sequence bigint not null check (sequence between 1 and 10000),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  foreign key (pair_id,sender_id) references public.pair_members(pair_id,profile_id),
  foreign key (pair_id,recipient_id) references public.pair_members(pair_id,profile_id),
  check (sender_id<>recipient_id),
  unique (sender_id,sequence)
);
create index if not exists thought_inbox on public.thought_events(recipient_id,created_at desc,id);
create index if not exists thought_pair on public.thought_events(pair_id);
create table if not exists app_private.thought_limits (
  profile_id uuid primary key references public.users_profiles(id),
  last_sent_at timestamptz not null,
  day_at date not null,
  daily_count integer not null check (daily_count between 1 and 50),
  total_count bigint not null check (total_count between 1 and 10000)
);

create or replace function public.save_my_profile(p_expected_version bigint,p_display_name text,p_bio text,p_mood_animal text)
returns public.profile_details language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.profile_details;
begin
 select * into v_row from public.profile_details where profile_id=v_me;
 if coalesce(v_row.version,0) is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if p_display_name is null or p_display_name<>btrim(p_display_name) or length(p_display_name) not between 1 and 80 then
   raise exception 'Display name must be trimmed, 1..80 characters' using errcode='22023'; end if;
 update public.users_profiles set display_name=p_display_name where id=v_me;
 insert into public.profile_details(profile_id,pair_id,bio,mood_animal)
 values(v_me,app_private.my_pair(),p_bio,p_mood_animal)
 on conflict(profile_id) do update set bio=excluded.bio,mood_animal=excluded.mood_animal,
   version=public.profile_details.version+1,updated_at=clock_timestamp() returning * into v_row;
 perform app_private.signal(true);
 return v_row;
end $$;

create or replace function public.save_my_preferences(p_expected_version bigint,p_theme text,p_locale text,p_partner_nickname text)
returns public.profile_preferences language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.profile_preferences;
begin
 select * into v_row from public.profile_preferences where profile_id=v_me;
 if coalesce(v_row.version,0) is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 insert into public.profile_preferences(profile_id,pair_id,theme,locale,partner_nickname)
 values(v_me,app_private.my_pair(),p_theme,p_locale,p_partner_nickname)
 on conflict(profile_id) do update set theme=excluded.theme,locale=excluded.locale,partner_nickname=excluded.partner_nickname,
   version=public.profile_preferences.version+1,updated_at=clock_timestamp() returning * into v_row;
 perform app_private.signal(false);
 return v_row;
end $$;

create or replace function app_private.can_avatar(p_key text,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_avatars a where a.object_key=p_key and a.pair_id=app_private.my_pair() and (
   (p_operation='read' and (a.owner_id=app_private.my_id() or (a.status='ready' and a.active)))
   or (p_operation='insert' and a.owner_id=app_private.my_id() and a.status='pending')
   or (p_operation='delete' and a.owner_id=app_private.my_id() and a.status='deleting')
 ))
$$;
create or replace function public.reserve_avatar(p_id uuid,p_mime_type text,p_expected_active_id uuid)
returns public.profile_avatars language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.profile_avatars; v_active uuid; v_day date:=(clock_timestamp() at time zone 'UTC')::date; v_n integer;
begin
 if p_id is null then raise exception 'Avatar UUID required' using errcode='22023'; end if;
 if exists(select 1 from app_private.retired_avatar_ids where id=p_id) then raise exception 'Avatar ID retired' using errcode='23505'; end if;
 select * into v_row from public.profile_avatars where id=p_id;
 if found then
   if v_row.owner_id<>v_me or v_row.mime_type is distinct from p_mime_type
     or v_row.expected_active_id is distinct from p_expected_active_id or v_row.status='deleting' then
     raise exception 'Avatar ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 select id into v_active from public.profile_avatars where owner_id=v_me and active;
 if v_active is distinct from p_expected_active_id then raise exception 'Active avatar conflict' using errcode='40001'; end if;
 if (select count(*) from public.profile_avatars where owner_id=v_me)>=3
   or (select coalesce(sum(reserved_bytes),0) from public.profile_avatars where owner_id=v_me)+1048576>3145728
   or (select count(*) from public.profile_avatars where owner_id=v_me)+(select count(*) from app_private.retired_avatar_ids where owner_id=v_me)>=10000 then
   raise exception 'Avatar quota: 3 retained objects / 3 MiB / 10000 lifetime' using errcode='54000'; end if;
 select reservations into v_n from app_private.avatar_limits where profile_id=v_me and day_at=v_day;
 if coalesce(v_n,0)>=10 then raise exception 'Avatar quota: 10 new reservations per UTC day' using errcode='54000'; end if;
 insert into app_private.avatar_limits(profile_id,day_at,reservations) values(v_me,v_day,1)
 on conflict(profile_id) do update set day_at=excluded.day_at,
   reservations=case when app_private.avatar_limits.day_at=excluded.day_at then app_private.avatar_limits.reservations+1 else 1 end;
 insert into public.profile_avatars(id,pair_id,owner_id,object_key,mime_type,expected_active_id)
 values(p_id,app_private.my_pair(),v_me,app_private.my_pair()::text||'/'||v_me::text||'/'||p_id::text,p_mime_type,p_expected_active_id)
 returning * into v_row;
 perform app_private.signal(false); return v_row;
end $$;
create or replace function public.finalize_avatar(p_id uuid)
returns public.profile_avatars language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.profile_avatars; v_active uuid; v_meta jsonb; v_size bigint;
begin
 select * into v_row from public.profile_avatars where id=p_id and owner_id=v_me;
 if not found or v_row.status='deleting' then raise exception 'Avatar unavailable' using errcode='42501'; end if;
 if v_row.status='ready' then return v_row; end if;
 if v_row.publication_invalidated then raise exception 'Active avatar conflict' using errcode='40001'; end if;
 select id into v_active from public.profile_avatars where owner_id=v_me and active;
 if v_active is distinct from v_row.expected_active_id then raise exception 'Active avatar conflict' using errcode='40001'; end if;
 select metadata into v_meta from storage.objects where bucket_id='connection-avatars' and name=v_row.object_key;
 if v_meta is null or coalesce(v_meta->>'size','') !~ '^[0-9]{1,9}$' then
   raise exception 'Upload missing or metadata unavailable' using errcode='22023'; end if;
 v_size:=(v_meta->>'size')::bigint;
 if v_size not between 1 and 1048576 or v_meta->>'mimetype' is distinct from v_row.mime_type then
   raise exception 'Uploaded avatar size/type mismatch' using errcode='22023'; end if;
 -- Deny old partner reads atomically before publishing the new active avatar.
 update public.profile_avatars set active=false,status='deleting',updated_at=clock_timestamp() where owner_id=v_me and active;
 -- UUID-only CAS has a NULL -> winner -> NULL ABA. Permanently revoke competing
 -- pending publication authority under the same pair-first lock; keep bytes charged
 -- and pending status/immutable arguments intact for owner retry/discard recovery.
 update public.profile_avatars set publication_invalidated=true,updated_at=clock_timestamp()
 where owner_id=v_me and id<>p_id and status='pending' and not publication_invalidated;
 update public.profile_avatars set status='ready',active=true,size_bytes=v_size,reserved_bytes=v_size,updated_at=clock_timestamp()
 where id=p_id returning * into v_row;
 perform app_private.signal(true); return v_row;
end $$;
create or replace function public.mark_avatar_delete(p_id uuid)
returns public.profile_avatars language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.profile_avatars; v_shared boolean;
begin
 select active into v_shared from public.profile_avatars where id=p_id and owner_id=v_me;
 update public.profile_avatars set active=false,status='deleting',updated_at=clock_timestamp()
 where id=p_id and owner_id=v_me returning * into v_row;
 if not found then raise exception 'Avatar unavailable' using errcode='42501'; end if;
 perform app_private.signal(coalesce(v_shared,false)); return v_row;
end $$;
create or replace function public.finish_avatar_delete(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.profile_avatars;
begin
 select * into v_row from public.profile_avatars where id=p_id and owner_id=v_me;
 if not found then return; end if;
 if v_row.status<>'deleting' then raise exception 'Mark for deletion first' using errcode='22023'; end if;
 if exists(select 1 from storage.objects where bucket_id='connection-avatars' and name=v_row.object_key) then
   raise exception 'Remove avatar through Storage API first' using errcode='22023'; end if;
 insert into app_private.retired_avatar_ids(id,owner_id) values(p_id,v_me) on conflict(id) do nothing;
 delete from public.profile_avatars where id=p_id;
 perform app_private.signal(false);
end $$;

create or replace function public.send_thought(p_id uuid)
returns public.thought_events language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_peer uuid;
 v_row public.thought_events; v_limit app_private.thought_limits; v_now timestamptz:=clock_timestamp(); v_day date; v_seq bigint;
begin
 if p_id is null then raise exception 'Thought UUID required' using errcode='22023'; end if;
 -- Dedupe BEFORE cooldown/daily quota. Event/operation rows are never client-deleted.
 select * into v_row from public.thought_events where id=p_id;
 if found then
   if v_row.sender_id<>v_me or v_row.pair_id<>v_pair then raise exception 'Thought ID conflict' using errcode='23505'; end if;
   -- A retry is a send receipt, not a read-receipt side channel into the inbox.
   v_row.read_at:=null;
   return v_row;
 end if;
 if (select count(*) from public.pair_members where pair_id=v_pair)<>2 then raise exception 'Exact partner required' using errcode='42501'; end if;
 select profile_id into v_peer from public.pair_members where pair_id=v_pair and profile_id<>v_me;
 if v_peer is null then raise exception 'Partner unavailable' using errcode='42501'; end if;
 v_day:=(v_now at time zone 'UTC')::date;
 select * into v_limit from app_private.thought_limits where profile_id=v_me;
 if v_limit.last_sent_at is not null and v_now<v_limit.last_sent_at+interval '30 seconds' then
   raise exception 'Thought cooldown: 30 seconds' using errcode='P0001'; end if;
 if v_limit.day_at=v_day and v_limit.daily_count>=50 then raise exception 'Thought quota: 50 per UTC day' using errcode='54000'; end if;
 if coalesce(v_limit.total_count,0)>=10000 then raise exception 'Thought quota: 10000 lifetime per sender' using errcode='54000'; end if;
 v_seq:=coalesce(v_limit.total_count,0)+1;
 insert into app_private.thought_limits(profile_id,last_sent_at,day_at,daily_count,total_count)
 values(v_me,v_now,v_day,1,v_seq)
 on conflict(profile_id) do update set last_sent_at=excluded.last_sent_at,day_at=excluded.day_at,total_count=excluded.total_count,
   daily_count=case when app_private.thought_limits.day_at=excluded.day_at then app_private.thought_limits.daily_count+1 else 1 end;
 insert into public.thought_events(id,pair_id,sender_id,recipient_id,phrase_key,sequence,created_at)
 values(p_id,v_pair,v_me,v_peer,'affection.phrase'||lpad((((v_seq-1)%10)+1)::text,2,'0'),v_seq,v_now) returning * into v_row;
 perform app_private.signal(true); return v_row;
end $$;
create or replace function public.mark_thought_read(p_id uuid)
returns public.thought_events language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.thought_events;
begin
 select * into v_row from public.thought_events where id=p_id and recipient_id=v_me and pair_id=app_private.my_pair();
 if not found then raise exception 'Thought unavailable' using errcode='42501'; end if;
 if v_row.read_at is not null then return v_row; end if;
 update public.thought_events set read_at=clock_timestamp() where id=p_id returning * into v_row;
 perform app_private.signal(false); return v_row;
end $$;

-- SELECT-only public API tables. Internal state has RLS, no policies and no grants.
do $$ declare t text; begin
 foreach t in array array['profile_details','profile_preferences','profile_avatars','thought_events'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('drop policy if exists profile_read on public.%I',t);
 end loop;
 foreach t in array array['retired_avatar_ids','avatar_limits','thought_limits'] loop
   execute format('alter table app_private.%I enable row level security',t);
   execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create policy profile_read on public.profile_details for select to authenticated using (pair_id=app_private.my_pair());
create policy profile_read on public.profile_preferences for select to authenticated using (profile_id=app_private.my_id() and pair_id=app_private.my_pair());
create policy profile_read on public.profile_avatars for select to authenticated using (app_private.can_avatar(object_key,'read'));
-- Recipient-only inbox; sender gets immutable send receipt via stable UUID RPC retry.
create policy profile_read on public.thought_events for select to authenticated using (recipient_id=app_private.my_id() and pair_id=app_private.my_pair());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('connection-avatars','connection-avatars',false,1048576,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists profile_storage_read on storage.objects;
drop policy if exists profile_storage_insert on storage.objects;
drop policy if exists profile_storage_delete on storage.objects;
create policy profile_storage_read on storage.objects for select to authenticated using
 (bucket_id='connection-avatars' and app_private.can_avatar(name,'read')
  and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info',
    'object.head_authenticated_info','object.info_authenticated','object.upload','object.delete','object.delete_many']));
create policy profile_storage_insert on storage.objects for insert to authenticated with check
 (bucket_id='connection-avatars' and app_private.can_avatar(name,'insert') and storage.allow_only_operation('object.upload'));
create policy profile_storage_delete on storage.objects for delete to authenticated using
 (bucket_id='connection-avatars' and app_private.can_avatar(name,'delete') and storage.allow_any_operation(array['object.delete','object.delete_many']));
-- No UPDATE, signing, list/copy/move/S3/TUS operation, or SQL byte removal.
revoke all on function app_private.can_avatar(text,text) from public,anon,authenticated,service_role;
grant execute on function app_private.can_avatar(text,text) to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('save_my_profile','save_my_preferences','reserve_avatar','finalize_avatar','mark_avatar_delete','finish_avatar_delete','send_thought','mark_thought_read') loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
   execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
-- Never publish profile payload/preferences/inbox. Only 001's sync_signals is used.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables)
 or exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and (schemaname,tablename)<>('public','sync_signals'))
 or not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sync_signals') then
   raise exception 'Unsafe Realtime publication: expected sync_signals only'; end if;
end $$;
notify pgrst,'reload schema';
commit;
