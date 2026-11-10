-- Standalone dedicated Supabase project ONLY. Apply manually as postgres.
-- No accounts, emails, credentials, existing local content, or remote targets embedded.
-- Re-runnable for this exact schema; not a schema-drift repair/migration framework.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;
revoke create on schema public from public, anon, authenticated;

create table if not exists public.users_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  created_at timestamptz not null default now()
);
create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete restrict,
  slot smallint not null check (slot in (1,2)),
  profile_id uuid not null unique references public.users_profiles(id) on delete restrict,
  primary key (pair_id,slot), unique (pair_id,profile_id)
);
create table if not exists public.question_bank (
  id text primary key check (id ~ '^q[1-8]$'),
  theme text not null, prompt text not null
);
-- Original prompts from the approved local application, not a third-party question pack.
insert into public.question_bank(id,theme,prompt) values
('q1','Lo cotidiano','¿Qué detalle pequeño de hoy te habría gustado que yo viera?'),
('q2','Lo cotidiano','¿Cómo sería una tarde tranquila en la que te sintieras completamente a gusto?'),
('q3','Recuerdos','¿Qué olor o sonido te lleva a un lugar que todavía sientes tuyo?'),
('q4','Recuerdos','¿Qué versión de ti de hace años te gustaría abrazar, y qué le dirías?'),
('q5','Lo que viene','¿Qué ilusión te da un poco de miedo decir en voz alta?'),
('q6','Lo que viene','¿Qué tradición pequeña te gustaría que inventáramos algún día?'),
('q7','Cuidarnos','Cuando el día pesa, ¿prefieres compañía, palabras o un rato de silencio?'),
('q8','Cuidarnos','¿Qué gesto te ayuda a sentir que alguien te escucha de verdad?')
on conflict (id) do nothing;

-- A small typed content table avoids four almost-identical CRUD APIs.
create table if not exists public.content_items (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  owner_id uuid not null references public.users_profiles(id) on delete restrict,
  item_type text not null check (item_type in ('journal','question_note','dedication','track')),
  visibility text not null default 'private' check (visibility in ('private','shared')),
  body text not null default '' check (length(body)<=20000),
  title text not null default '' check (length(title)<=200),
  url text,
  question_id text references public.question_bank(id),
  entry_kind text not null default 'note' check (entry_kind in ('note','poem')),
  mood text not null default 'none' check (mood in ('none','calm','hopeful','nostalgic','hug','difficult')),
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id),
  check ((item_type='question_note') = (question_id is not null)),
  check ((item_type='dedication') = (url is not null)),
  check (url is null or (length(url)<=2048 and url ~ '^https?://[^/@[:space:]:?#]+(:[0-9]+)?([/?#][^[:space:]]*)?$')),
  check (item_type='journal' or (entry_kind='note' and mood='none'))
);
create unique index if not exists one_question_note on public.content_items(owner_id,question_id)
  where item_type='question_note' and deleted_at is null;
create index if not exists content_pair_updated on public.content_items(pair_id,updated_at,id);
create index if not exists content_owner on public.content_items(owner_id);
create index if not exists content_question on public.content_items(question_id);
create table if not exists public.moods (
  profile_id uuid primary key references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  mood text not null check (mood in ('none','calm','hopeful','nostalgic','hug','difficult')),
  note text not null default '' check (length(note)<=500),
  visibility text not null default 'private' check (visibility in ('private','shared')),
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create index if not exists moods_pair on public.moods(pair_id);
create table if not exists public.flowers (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  planted_by uuid not null references public.users_profiles(id),
  flower_type text not null check (flower_type in ('jasmine','lilium','orchid')),
  water smallint not null default 0 check (water between 0 and 9),
  version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (pair_id,planted_by) references public.pair_members(pair_id,profile_id)
);
create index if not exists flowers_pair on public.flowers(pair_id);
create index if not exists flowers_planter on public.flowers(planted_by);
create table if not exists public.question_rounds (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  question_id text not null references public.question_bank(id),
  started_by uuid not null references public.users_profiles(id),
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  foreign key (pair_id,started_by) references public.pair_members(pair_id,profile_id)
);
create unique index if not exists one_open_round on public.question_rounds(pair_id) where revealed_at is null;
create index if not exists rounds_pair_created on public.question_rounds(pair_id,created_at,id);
create index if not exists rounds_question on public.question_rounds(question_id);
create index if not exists rounds_starter on public.question_rounds(started_by);
create table if not exists public.round_answers (
  round_id uuid not null references public.question_rounds(id),
  owner_id uuid not null references public.users_profiles(id),
  body text not null check (length(btrim(body)) between 1 and 20000),
  submitted_at timestamptz not null default now(),
  primary key (round_id,owner_id)
);
create index if not exists answers_owner on public.round_answers(owner_id);
create table if not exists public.media_files (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  owner_id uuid not null references public.users_profiles(id),
  content_id uuid not null references public.content_items(id),
  object_key text not null unique,
  filename text not null check (length(filename) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','video/mp4','video/webm','video/quicktime')),
  status text not null default 'pending' check (status in ('pending','ready','deleting')),
  reserved_bytes bigint not null default 26214400 check (reserved_bytes between 1 and 26214400),
  size_bytes bigint check (size_bytes between 1 and 26214400),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id),
  check ((status='ready' and size_bytes is not null and reserved_bytes=size_bytes) or status<>'ready')
);
create index if not exists media_owner on public.media_files(owner_id);
create index if not exists media_pair on public.media_files(pair_id);
create index if not exists media_content on public.media_files(content_id);
-- Only this content-free, per-recipient invalidation table goes to Realtime.
create table if not exists public.sync_signals (
  profile_id uuid primary key references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create index if not exists sync_pair on public.sync_signals(pair_id);
create table if not exists app_private.write_limits (
  profile_id uuid primary key references public.users_profiles(id),
  minute_at timestamptz not null, requests integer not null
);
-- Operation identities survive metadata/byte release. Never prune or reassign IDs.
-- No parent/owner FK or payload: retirement must not cascade away with app data.
create table if not exists app_private.retired_media_ids (
  id uuid primary key,
  retired_at timestamptz not null default clock_timestamp()
);

create or replace function app_private.my_id() returns uuid
language sql stable security definer set search_path='' as $$
  select p.id from public.users_profiles p
  join auth.users u on u.id=p.auth_user_id
  where p.auth_user_id=(select auth.uid()) and (select auth.role())='authenticated'
    and not coalesce(u.is_anonymous,false)
$$;
create or replace function app_private.my_pair() returns uuid
language sql stable security definer set search_path='' as $$
  select pair_id from public.pair_members where profile_id=app_private.my_id()
$$;
create or replace function app_private.can_content(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.content_items c where c.id=p_id and c.deleted_at is null
   and c.pair_id=app_private.my_pair()
   and (c.owner_id=app_private.my_id() or c.visibility='shared'))
$$;
create or replace function app_private.can_media(p_key text,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_files f where f.object_key=p_key
   and f.pair_id=app_private.my_pair() and (
     (p_operation='read' and (f.owner_id=app_private.my_id()
       or (f.status='ready' and app_private.can_content(f.content_id))))
     or (p_operation='insert' and f.owner_id=app_private.my_id() and f.status='pending'
       and exists(select 1 from public.content_items c where c.id=f.content_id and c.deleted_at is null))
     or (p_operation='delete' and f.owner_id=app_private.my_id() and f.status='deleting')
   ))
$$;
-- Every mutation serializes on the single pair. Two people do not need a lock service.
-- This protects membership, count/byte quotas, optimistic writes and reveal in one order.
create or replace function app_private.begin_write() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.my_id(); v_pair uuid:=app_private.my_pair(); v_count integer;
begin
 if v_me is null or v_pair is null then raise exception 'Enrollment required' using errcode='42501'; end if;
 perform 1 from public.pairs where id=v_pair for update;
 insert into app_private.write_limits(profile_id,minute_at,requests)
 values(v_me,date_trunc('minute',clock_timestamp()),1)
 on conflict(profile_id) do update set
 requests=case when app_private.write_limits.minute_at=excluded.minute_at
   then app_private.write_limits.requests+1 else 1 end, minute_at=excluded.minute_at
 returning requests into v_count;
 if v_count>120 then raise exception 'Write limit: 120 per minute' using errcode='P0001'; end if;
 return v_me;
end $$;
create or replace function app_private.signal(p_shared boolean) returns void
language sql security definer set search_path='' as $$
 update public.sync_signals set revision=revision+1,updated_at=clock_timestamp()
 where pair_id=app_private.my_pair() and (p_shared or profile_id=app_private.my_id())
$$;

-- Admin-only enrollment. No browser/RPC-role execute permission, no public join endpoint.
create or replace function public.admin_enroll_pair(p_auth_a uuid,p_name_a text,p_auth_b uuid,p_name_b text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_pair uuid; v_a uuid; v_b uuid;
begin
 if p_auth_a is null or p_auth_b is null or p_auth_a=p_auth_b then
   raise exception 'Two distinct Auth accounts required' using errcode='22023'; end if;
 if (select count(*) from auth.users where id in(p_auth_a,p_auth_b) and not coalesce(is_anonymous,false))<>2 then
   raise exception 'Both permanent Auth accounts must already exist' using errcode='22023'; end if;
 insert into public.pairs(singleton) values(true) on conflict(singleton) do nothing;
 select id into v_pair from public.pairs where singleton for update;
 if exists(select 1 from public.pair_members m join public.users_profiles p on p.id=m.profile_id
   where m.pair_id=v_pair and p.auth_user_id not in(p_auth_a,p_auth_b)) then
   raise exception 'Pair already enrolled; replacement requires reviewed admin migration' using errcode='42501'; end if;
 insert into public.users_profiles(auth_user_id,display_name) values(p_auth_a,p_name_a)
   on conflict(auth_user_id) do nothing;
 insert into public.users_profiles(auth_user_id,display_name) values(p_auth_b,p_name_b)
   on conflict(auth_user_id) do nothing;
 select id into v_a from public.users_profiles where auth_user_id=p_auth_a;
 select id into v_b from public.users_profiles where auth_user_id=p_auth_b;
 if not exists(select 1 from public.pair_members where pair_id=v_pair) then
   insert into public.pair_members(pair_id,slot,profile_id) values(v_pair,1,v_a),(v_pair,2,v_b);
 end if;
 insert into public.sync_signals(profile_id,pair_id) values(v_a,v_pair),(v_b,v_pair) on conflict(profile_id) do nothing;
 return v_pair;
end $$;

create or replace function public.save_content(p_id uuid,p_expected_version bigint,p_data jsonb)
returns public.content_items language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_old public.content_items; v_new public.content_items;
 v_pair uuid:=app_private.my_pair(); v_type text:=p_data->>'item_type';
begin
 if p_id is null or p_expected_version is null or p_expected_version<0 or p_data is null
   or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid content arguments' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in
   ('item_type','visibility','body','title','url','question_id','entry_kind','mood')) then
   raise exception 'Unknown content field' using errcode='22023'; end if;
 select * into v_old from public.content_items where id=p_id;
 if found then
   if v_old.owner_id<>v_me or v_old.deleted_at is not null then raise exception 'Content unavailable' using errcode='42501'; end if;
   if v_old.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
   if v_type is distinct from v_old.item_type then raise exception 'Type is immutable' using errcode='22023'; end if;
 else
   if p_expected_version<>0 then raise exception 'Version conflict' using errcode='40001'; end if;
   if (select count(*) from public.content_items where owner_id=v_me)>=10000 then
     raise exception 'Content quota: 10000 lifetime rows per person' using errcode='54000'; end if;
 end if;
 insert into public.content_items(id,pair_id,owner_id,item_type,visibility,body,title,url,question_id,entry_kind,mood)
 values(p_id,v_pair,v_me,v_type,coalesce(p_data->>'visibility','private'),coalesce(p_data->>'body',''),
   coalesce(p_data->>'title',''),p_data->>'url',p_data->>'question_id',
   coalesce(p_data->>'entry_kind','note'),coalesce(p_data->>'mood','none'))
 on conflict(id) do update set visibility=excluded.visibility,body=excluded.body,title=excluded.title,
   url=excluded.url,question_id=excluded.question_id,entry_kind=excluded.entry_kind,mood=excluded.mood,
   version=public.content_items.version+1,updated_at=clock_timestamp()
 returning * into v_new;
 perform app_private.signal(v_new.visibility='shared' or coalesce(v_old.visibility='shared',false));
 return v_new;
end $$;
create or replace function public.delete_content(p_id uuid,p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_old public.content_items;
begin
 select * into v_old from public.content_items where id=p_id and owner_id=v_me;
 if not found then raise exception 'Content unavailable' using errcode='42501'; end if;
 if v_old.deleted_at is not null then return; end if;
 if v_old.version is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 update public.content_items set deleted_at=clock_timestamp(),body='',title='',url=case when item_type='dedication' then 'https://deleted.invalid' else null end,
   version=version+1,updated_at=clock_timestamp() where id=p_id;
 update public.media_files set status='deleting',updated_at=clock_timestamp() where content_id=p_id;
 perform app_private.signal(v_old.visibility='shared');
end $$;
create or replace function public.save_mood(p_expected_version bigint,p_mood text,p_note text,p_visibility text)
returns public.moods language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_old public.moods; v_new public.moods;
begin
 select * into v_old from public.moods where profile_id=v_me;
 if coalesce(v_old.version,0) is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 insert into public.moods(profile_id,pair_id,mood,note,visibility)
 values(v_me,app_private.my_pair(),p_mood,p_note,p_visibility)
 on conflict(profile_id) do update set mood=excluded.mood,note=excluded.note,visibility=excluded.visibility,
   version=public.moods.version+1,updated_at=clock_timestamp() returning * into v_new;
 perform app_private.signal(p_visibility='shared' or coalesce(v_old.visibility='shared',false));
 return v_new;
end $$;
create or replace function public.plant_flower(p_id uuid,p_flower_type text)
returns public.flowers language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.flowers;
begin
 select * into v_row from public.flowers where id=p_id;
 if found then
   if v_row.planted_by<>v_me or v_row.flower_type is distinct from p_flower_type or v_row.deleted_at is not null then
     raise exception 'Flower ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 if (select count(*) from public.flowers where planted_by=v_me and deleted_at is null)>=24
    or (select count(*) from public.flowers where pair_id=app_private.my_pair())>=10000 then
   raise exception 'Garden quota' using errcode='54000'; end if;
 insert into public.flowers(id,pair_id,planted_by,flower_type)
 values(p_id,app_private.my_pair(),v_me,p_flower_type) returning * into v_row;
 perform app_private.signal(true); return v_row;
end $$;
create or replace function public.change_flower(p_id uuid,p_expected_version bigint,p_action text)
returns public.flowers language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.flowers;
begin
 select * into v_row from public.flowers where id=p_id and pair_id=app_private.my_pair() and deleted_at is null;
 if not found then raise exception 'Flower unavailable' using errcode='42501'; end if;
 if v_row.version is distinct from p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if p_action='water' then
   update public.flowers set water=least(9,water+1),version=version+1,updated_at=clock_timestamp() where id=p_id returning * into v_row;
 elsif p_action='delete' and v_row.planted_by=v_me then
   update public.flowers set deleted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=p_id returning * into v_row;
 else raise exception 'Invalid or forbidden flower action' using errcode='42501'; end if;
 perform app_private.signal(true); return v_row;
end $$;

create or replace function public.start_round(p_id uuid,p_question_id text)
returns public.question_rounds language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.question_rounds;
begin
 select * into v_row from public.question_rounds where id=p_id;
 if found then
   if v_row.pair_id<>v_pair or v_row.question_id is distinct from p_question_id then
     raise exception 'Round ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 if (select count(*) from public.pair_members where pair_id=v_pair)<>2 then raise exception 'Two enrolled members required' using errcode='42501'; end if;
 if (select count(*) from public.question_rounds where pair_id=v_pair)>=1000 then raise exception 'Round quota' using errcode='54000'; end if;
 insert into public.question_rounds(id,pair_id,question_id,started_by) values(p_id,v_pair,p_question_id,v_me) returning * into v_row;
 perform app_private.signal(true); return v_row;
end $$;
create or replace function public.submit_round_answer(p_round_id uuid,p_body text)
returns public.round_answers language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_round public.question_rounds; v_row public.round_answers;
begin
 select * into v_round from public.question_rounds where id=p_round_id and pair_id=app_private.my_pair() for update;
 if not found then raise exception 'Round unavailable' using errcode='42501'; end if;
 select * into v_row from public.round_answers where round_id=p_round_id and owner_id=v_me;
 if found then
   if v_row.body is distinct from p_body then raise exception 'Submitted answer is immutable' using errcode='23505'; end if;
   return v_row;
 end if;
 if v_round.revealed_at is not null then raise exception 'Round already revealed' using errcode='42501'; end if;
 insert into public.round_answers(round_id,owner_id,body) values(p_round_id,v_me,p_body) returning * into v_row;
 if (select count(*) from public.round_answers where round_id=p_round_id)=2 then
   update public.question_rounds set revealed_at=clock_timestamp() where id=p_round_id;
   perform app_private.signal(true);
 else perform app_private.signal(false); end if;
 return v_row;
end $$;

create or replace function public.reserve_media(p_id uuid,p_content_id uuid,p_filename text,p_mime_type text)
returns public.media_files language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_content public.content_items; v_row public.media_files;
begin
 -- begin_write acquired the pair lock before consulting retirement or live rows.
 if exists(select 1 from app_private.retired_media_ids where id=p_id) then
   raise exception 'Media ID retired; use a new UUID for a new upload' using errcode='23505'; end if;
 select * into v_row from public.media_files where id=p_id;
 if found then
   if v_row.owner_id<>v_me or v_row.content_id is distinct from p_content_id or v_row.status='deleting'
     or v_row.filename is distinct from p_filename or v_row.mime_type is distinct from p_mime_type then
     raise exception 'Media ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 select * into v_content from public.content_items where id=p_content_id and owner_id=v_me and deleted_at is null;
 if not found then raise exception 'Owned content required' using errcode='42501'; end if;
 if v_content.item_type='dedication' or (v_content.item_type='track' and p_mime_type not like 'audio/%') then
   raise exception 'Unsupported attachment for content type' using errcode='22023'; end if;
 if (select count(*) from public.media_files where content_id=p_content_id)>=(case when v_content.item_type='track' then 1 else 20 end) then
   raise exception 'Attachment count quota' using errcode='54000'; end if;
 -- Reserve the full bucket object limit, NOT a client-supplied size. A lying client
 -- cannot exceed the 100 MiB quota by leaving oversized pending uploads unfinalized.
 if (select coalesce(sum(reserved_bytes),0) from public.media_files where owner_id=v_me)+26214400>104857600 then
   raise exception 'Media quota: 100 MiB per person, including pending/deleting' using errcode='54000'; end if;
 insert into public.media_files(id,pair_id,owner_id,content_id,object_key,filename,mime_type)
 values(p_id,app_private.my_pair(),v_me,p_content_id,
   app_private.my_pair()::text||'/'||v_me::text||'/'||p_id::text,p_filename,p_mime_type) returning * into v_row;
 perform app_private.signal(false); return v_row;
end $$;
create or replace function public.finalize_media(p_id uuid)
returns public.media_files language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.media_files; v_meta jsonb; v_size bigint;
begin
 select * into v_row from public.media_files where id=p_id and owner_id=v_me;
 if not found or v_row.status='deleting' then raise exception 'Media unavailable' using errcode='42501'; end if;
 if v_row.status='ready' then return v_row; end if;
 select metadata into v_meta from storage.objects where bucket_id='connection-private' and name=v_row.object_key;
 if v_meta is null or coalesce(v_meta->>'size','') !~ '^[0-9]{1,9}$' then
   raise exception 'Upload missing or metadata unavailable' using errcode='22023'; end if;
 v_size:=(v_meta->>'size')::bigint;
 if v_size not between 1 and 26214400 or v_meta->>'mimetype' is distinct from v_row.mime_type then
   raise exception 'Uploaded size/type mismatch; mark for deletion' using errcode='22023'; end if;
 update public.media_files set status='ready',size_bytes=v_size,reserved_bytes=v_size,updated_at=clock_timestamp()
 where id=p_id returning * into v_row;
 perform app_private.signal(exists(select 1 from public.content_items where id=v_row.content_id and visibility='shared'));
 return v_row;
end $$;
create or replace function public.mark_media_delete(p_id uuid)
returns public.media_files language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.media_files;
begin
 update public.media_files set status='deleting',updated_at=clock_timestamp() where id=p_id and owner_id=v_me returning * into v_row;
 if not found then raise exception 'Media unavailable' using errcode='42501'; end if;
 perform app_private.signal(exists(select 1 from public.content_items where id=v_row.content_id and visibility='shared'));
 return v_row;
end $$;
create or replace function public.finish_media_delete(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.media_files;
begin
 select * into v_row from public.media_files where id=p_id and owner_id=v_me;
 if not found then return; end if;
 if v_row.status<>'deleting' then raise exception 'Mark for deletion first' using errcode='22023'; end if;
 if exists(select 1 from storage.objects where bucket_id='connection-private' and name=v_row.object_key) then
   raise exception 'Remove object through Storage API first' using errcode='22023'; end if;
 -- Same transaction and pair lock as metadata removal/quota release. Any failure
 -- (including signal failure) rolls back both retirement and removal together.
 insert into app_private.retired_media_ids(id) values(p_id) on conflict(id) do nothing;
 delete from public.media_files where id=p_id;
 perform app_private.signal(false);
end $$;

-- All application tables: SELECT-only to authenticated, RLS; no direct writes.
do $$ declare t text; begin
 foreach t in array array['users_profiles','pairs','pair_members','question_bank','content_items','moods','flowers','question_rounds','round_answers','media_files','sync_signals'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('drop policy if exists connection_read on public.%I',t);
 end loop;
end $$;
alter table app_private.write_limits enable row level security;
revoke all on app_private.write_limits from public,anon,authenticated;
alter table app_private.retired_media_ids enable row level security;
revoke all on app_private.retired_media_ids from public,anon,authenticated,service_role;
create policy connection_read on public.users_profiles for select to authenticated using
 (id=app_private.my_id() or exists(select 1 from public.pair_members m where m.profile_id=id and m.pair_id=app_private.my_pair()));
create policy connection_read on public.pairs for select to authenticated using (id=app_private.my_pair());
create policy connection_read on public.pair_members for select to authenticated using (pair_id=app_private.my_pair());
create policy connection_read on public.question_bank for select to authenticated using (app_private.my_pair() is not null);
create policy connection_read on public.content_items for select to authenticated using (app_private.can_content(id));
create policy connection_read on public.moods for select to authenticated using
 (pair_id=app_private.my_pair() and (profile_id=app_private.my_id() or visibility='shared'));
create policy connection_read on public.flowers for select to authenticated using (pair_id=app_private.my_pair() and deleted_at is null);
create policy connection_read on public.question_rounds for select to authenticated using (pair_id=app_private.my_pair());
create policy connection_read on public.round_answers for select to authenticated using
 (exists(select 1 from public.question_rounds r where r.id=round_id and r.pair_id=app_private.my_pair()
   and (owner_id=app_private.my_id() or r.revealed_at is not null)));
create policy connection_read on public.media_files for select to authenticated using (app_private.can_media(object_key,'read'));
create policy connection_read on public.sync_signals for select to authenticated using (profile_id=app_private.my_id() and pair_id=app_private.my_pair());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('connection-private','connection-private',false,26214400,
 array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists connection_storage_read on storage.objects;
drop policy if exists connection_storage_insert on storage.objects;
drop policy if exists connection_storage_delete on storage.objects;
create policy connection_storage_read on storage.objects for select to authenticated using
 (bucket_id='connection-private' and app_private.can_media(name,'read')
  and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info',
    'object.head_authenticated_info','object.info_authenticated','object.upload','object.delete','object.delete_many']));
create policy connection_storage_insert on storage.objects for insert to authenticated with check
 (bucket_id='connection-private' and app_private.can_media(name,'insert')
  and storage.allow_only_operation('object.upload'));
create policy connection_storage_delete on storage.objects for delete to authenticated using
 (bucket_id='connection-private' and app_private.can_media(name,'delete')
  and storage.allow_any_operation(array['object.delete','object.delete_many']));
-- Operation-aware policies also deny signed URL/upload grants and S3/TUS/copy paths.
-- Requires the current managed Storage allow_*_operation helpers; fail closed if absent.
-- No UPDATE policy: upsert, overwrite and move are deliberately denied.
-- Never DELETE from storage.objects in SQL: Storage API removes the actual bytes.

-- Strip default PUBLIC execute, including on reapplication. Explicit allowlist only.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.my_id(),app_private.my_pair(),app_private.can_content(uuid),app_private.can_media(text,text) to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
 ('admin_enroll_pair','save_content','delete_content','save_mood','plant_flower','change_flower','start_round','submit_round_answer','reserve_media','finalize_media','mark_media_delete','finish_media_delete') loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
   if f.proname<>'admin_enroll_pair' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
-- Fresh dedicated project only. Keep payload tables OUT of Realtime even on rerun.
do $$ declare t text; begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
   create publication supabase_realtime;
 end if;
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables) then
   raise exception 'Unsafe FOR ALL TABLES publication: stop and review project'; end if;
 foreach t in array array['users_profiles','pairs','pair_members','question_bank','content_items','moods','flowers','question_rounds','round_answers','media_files'] loop
   if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
     execute format('alter publication supabase_realtime drop table public.%I',t);
   end if;
 end loop;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sync_signals') then
   alter publication supabase_realtime add table public.sync_signals;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
