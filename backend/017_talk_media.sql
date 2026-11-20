-- 017: Talk like a real messenger. Videos and stickers in the chat; photos and videos can be "view once" or "view
-- twice" (payload {"view":"once"|"twice"}; the server counts each time the other one opens it, the app hides it after);
-- your own stickers (small images cut from your photos), shared by both of you.
-- Apply AFTER 016, as postgres, in this one transaction. Additive: wider checks, two new tables, four new functions,
-- and reserve_message_media also takes a video for a video message.
begin;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','photo','voice','song','game','word','dance','letter','video','sticker'));
alter table public.messages drop constraint if exists messages_shape;
alter table public.messages add constraint messages_shape check (
  deleted_at is not null or (kind='text' and body is not null) or kind in ('photo','voice','video')
  or (kind in ('song','game','word') and payload is not null)
  or (kind='dance' and payload is not null and coalesce(payload->>'role','') in ('step','copy')
      and (payload->>'role'='step' or (payload ? 'of')))
  or (kind='letter' and body is null and payload is not null and coalesce(payload->>'opens_at','') ~ '^\d{4}-\d{2}-\d{2}$')
  or (kind='sticker' and payload is not null and (payload ? 'sticker')));

create or replace function public.reserve_message_media(p_id uuid,p_message_id uuid,p_filename text,p_mime_type text)
returns public.media_files language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_msg public.messages; v_row public.media_files;
begin
 if exists(select 1 from app_private.retired_media_ids where id=p_id) then
   raise exception 'Media ID retired; use a new UUID for a new upload' using errcode='23505'; end if;
 select * into v_row from public.media_files where id=p_id;
 if found then
   if v_row.owner_id<>v_me or v_row.message_id is distinct from p_message_id or v_row.status='deleting'
     or v_row.filename is distinct from p_filename or v_row.mime_type is distinct from p_mime_type then
     raise exception 'Media ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 select * into v_msg from public.messages where id=p_message_id and sender_id=v_me and deleted_at is null;
 if not found then raise exception 'Own message required' using errcode='42501'; end if;
 if not ((v_msg.kind='photo' and p_mime_type like 'image/%') or (v_msg.kind='voice' and p_mime_type like 'audio/%')
    or (v_msg.kind='dance' and p_mime_type in ('video/mp4','video/webm','video/quicktime'))
    or (v_msg.kind='word' and p_mime_type like 'audio/%')
    or (v_msg.kind='video' and p_mime_type in ('video/mp4','video/webm','video/quicktime'))) then
   raise exception 'Unsupported attachment for message kind' using errcode='22023'; end if;
 if exists(select 1 from public.media_files where message_id=p_message_id) then
   raise exception 'One upload per message' using errcode='54000'; end if;
 if (select coalesce(sum(reserved_bytes),0) from public.media_files where owner_id=v_me)+26214400>104857600 then
   raise exception 'Media quota: 100 MiB per person, including pending/deleting' using errcode='54000'; end if;
 insert into public.media_files(id,pair_id,owner_id,content_id,message_id,object_key,filename,mime_type)
 values(p_id,app_private.my_pair(),v_me,null,p_message_id,
   app_private.my_pair()::text||'/'||v_me::text||'/'||p_id::text,p_filename,p_mime_type) returning * into v_row;
 return v_row;
end $$;

-- view once / twice
create table if not exists public.message_views (
  message_id uuid not null references public.messages(id),
  viewer_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  views integer not null default 0 check (views>=0),
  last_at timestamptz not null default now(),
  primary key (message_id,viewer_id),
  foreign key (pair_id,viewer_id) references public.pair_members(pair_id,profile_id)
);
alter table public.message_views enable row level security;
drop policy if exists message_views_pair_read on public.message_views;
create policy message_views_pair_read on public.message_views for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.message_views from public, anon, authenticated;
grant select on public.message_views to authenticated;

-- Opening a photo or video: returns how many times you have now opened it. Refused once the limit is reached.
create or replace function public.view_media(p_message_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_msg public.messages; v_limit integer; v_now integer;
begin
  select * into v_msg from public.messages where id=p_message_id and pair_id=v_pair and deleted_at is null and kind in ('photo','video');
  if not found then raise exception 'Unavailable' using errcode='42501'; end if;
  if v_msg.sender_id=v_me then return 0; end if;
  v_limit:=case v_msg.payload->>'view' when 'once' then 1 when 'twice' then 2 else null end;
  select views into v_now from public.message_views where message_id=p_message_id and viewer_id=v_me;
  if v_limit is not null and coalesce(v_now,0)>=v_limit then raise exception 'Already seen' using errcode='PT403'; end if;
  insert into public.message_views(message_id,viewer_id,pair_id,views) values(p_message_id,v_me,v_pair,1)
  on conflict (message_id,viewer_id) do update set views=public.message_views.views+1,last_at=now() returning views into v_now;
  perform app_private.talk('viewed',jsonb_build_object('message_id',p_message_id,'viewer_id',v_me,'views',v_now));
  return v_now;
end $$;

-- your own stickers: small images (a data URL, up to about 200 kB), at most 80 each
create table if not exists public.stickers (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  owner_id uuid not null references public.users_profiles(id),
  image text not null check (image ~ '^data:image/(png|webp|jpeg);base64,' and length(image)<=280000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id)
);
alter table public.stickers enable row level security;
drop policy if exists stickers_pair_read on public.stickers;
create policy stickers_pair_read on public.stickers for select to authenticated using (pair_id=(select app_private.my_pair()) and deleted_at is null);
revoke all on public.stickers from public, anon, authenticated;
grant select on public.stickers to authenticated;
create or replace function public.save_sticker(p_id uuid,p_image text)
returns public.stickers language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.stickers;
begin
  select * into v_row from public.stickers where id=p_id;
  if found then if v_row.owner_id<>v_me or v_row.image<>p_image then raise exception 'Sticker ID conflict' using errcode='23505'; end if; return v_row; end if;
  if (select count(*) from public.stickers where owner_id=v_me and deleted_at is null)>=80 then raise exception 'Sticker quota' using errcode='54000'; end if;
  insert into public.stickers(id,pair_id,owner_id,image) values(p_id,v_pair,v_me,p_image) returning * into v_row;
  perform app_private.signal(true);return v_row;
end $$;
create or replace function public.delete_sticker(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write();
begin
  update public.stickers set deleted_at=now() where id=p_id and owner_id=v_me and deleted_at is null;
  if not found then raise exception 'Not your sticker' using errcode='42501'; end if;
  perform app_private.signal(true);
end $$;
revoke all on function public.view_media(uuid), public.save_sticker(uuid,text), public.delete_sticker(uuid) from public, anon, authenticated, service_role;
grant execute on function public.view_media(uuid), public.save_sticker(uuid,text), public.delete_sticker(uuid) to authenticated;

do $verify$
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('stickers','message_views') and not c.relrowsecurity) then raise exception '017: RLS'; end if;
  if has_table_privilege('authenticated','public.stickers','INSERT') or has_table_privilege('authenticated','public.message_views','INSERT') then raise exception '017: unsafe grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('view_media','save_sticker','delete_sticker','reserve_message_media')
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then raise exception '017: definer'; end if;
end $verify$;
commit;
