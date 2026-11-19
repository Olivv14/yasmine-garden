-- 008: Talk. Real chat between the two of you: text, photos, voice notes, songs, game invites and words,
-- with replies, one reaction each per message, and read marks ("seen").
-- New messages, edits, deletions, reactions and reads reach the partner instantly through the private
-- room pair:<pair>:talk (database-sent; 006's policies), and each new message adds a bell row for push.
-- Apply AFTER 006 (notify_partner, pair rooms) and 007, as postgres, in this one transaction.
-- Additive: media_files gains an optional message parent; every existing row keeps its note parent.
begin;

-- 1. Messages. Deleted messages stay as tombstones so order and replies hold.
create table if not exists public.messages (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  sender_id uuid not null references public.users_profiles(id),
  kind text not null check (kind in ('text','photo','voice','song','game','word')),
  body text check (body is null or char_length(body) between 1 and 4000),
  payload jsonb check (payload is null or (jsonb_typeof(payload)='object' and pg_column_size(payload)<=2048)),
  reply_to uuid references public.messages(id),
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  foreign key (pair_id,sender_id) references public.pair_members(pair_id,profile_id),
  constraint messages_shape check (deleted_at is not null or
    (kind='text' and body is not null)
    or kind in ('photo','voice')
    or (kind in ('song','game','word') and payload is not null))
);
create index if not exists messages_pair_time on public.messages(pair_id,created_at desc,id desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id),
  profile_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  emoji text not null check (emoji in ('❤️','😂','😮','😢','🔥','👍')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (message_id,profile_id),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create index if not exists message_reactions_pair on public.message_reactions(pair_id);

create table if not exists public.chat_reads (
  profile_id uuid primary key references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  last_read_at timestamptz not null default '-infinity',
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);

alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_reads enable row level security;
revoke all on public.messages,public.message_reactions,public.chat_reads from public,anon,authenticated,service_role;
grant select on public.messages,public.message_reactions,public.chat_reads to authenticated;
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (pair_id=app_private.my_pair());
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select to authenticated using (pair_id=app_private.my_pair());
drop policy if exists chat_reads_read on public.chat_reads;
create policy chat_reads_read on public.chat_reads for select to authenticated using (pair_id=app_private.my_pair());

-- 2. Photos and voice notes: an upload belongs to a note (content) or to a message, never both.
alter table public.media_files alter column content_id drop not null;
alter table public.media_files add column if not exists message_id uuid references public.messages(id);
alter table public.media_files drop constraint if exists media_files_one_parent;
alter table public.media_files add constraint media_files_one_parent check (num_nonnulls(content_id,message_id)=1);
create index if not exists media_message on public.media_files(message_id);

create or replace function app_private.can_message(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages m where m.id=p_id and m.deleted_at is null and m.pair_id=app_private.my_pair())
$$;
-- Same rules as before for notes; a ready message upload is readable by both of you.
create or replace function app_private.can_media(p_key text,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_files f where f.object_key=p_key
   and f.pair_id=app_private.my_pair() and (
     (p_operation='read' and (f.owner_id=app_private.my_id()
       or (f.status='ready' and ((f.content_id is not null and app_private.can_content(f.content_id))
         or (f.message_id is not null and app_private.can_message(f.message_id))))))
     or (p_operation='insert' and f.owner_id=app_private.my_id() and f.status='pending'
       and ((f.content_id is not null and exists(select 1 from public.content_items c where c.id=f.content_id and c.deleted_at is null))
         or (f.message_id is not null and exists(select 1 from public.messages m where m.id=f.message_id and m.deleted_at is null and m.sender_id=f.owner_id))))
     or (p_operation='delete' and f.owner_id=app_private.my_id() and f.status='deleting')
   ))
$$;

-- Internal: tell the partner's open app right away. A failed room send never fails the write.
create or replace function app_private.talk(p_event text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send(p_payload,p_event,'pair:'||app_private.my_pair()::text||':talk',true);
exception when others then null;
end $$;

-- 3. Send. Same id + same message returns the stored row (safe retry from the outbox).
create or replace function public.send_message(p_id uuid,p_kind text,p_body text,p_payload jsonb,p_reply_to uuid)
returns public.messages language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v public.messages; v_body text:=nullif(btrim(p_body),'');
begin
 if p_id is null then raise exception 'Message UUID required' using errcode='22023'; end if;
 select * into v from public.messages where id=p_id;
 if found then
   if v.sender_id<>v_me or v.pair_id<>v_pair or v.kind is distinct from p_kind or v.reply_to is distinct from p_reply_to
      or (v.deleted_at is null and (v.body is distinct from v_body and v.edited_at is null)) then
     raise exception 'Message ID conflict' using errcode='23505'; end if;
   return v;
 end if;
 if p_reply_to is not null and not exists(select 1 from public.messages where id=p_reply_to and pair_id=v_pair) then
   raise exception 'Reply target unavailable' using errcode='42501'; end if;
 if (select count(*) from public.messages where pair_id=v_pair)>=500000 then
   raise exception 'Message quota' using errcode='54000'; end if;
 insert into public.messages(id,pair_id,sender_id,kind,body,payload,reply_to)
 values(p_id,v_pair,v_me,p_kind,v_body,p_payload,p_reply_to) returning * into v;
 perform app_private.talk('message',to_jsonb(v));
 begin perform app_private.notify_partner(p_id,'message',p_id);
 exception when sqlstate '54000' then null; end;
 return v;
end $$;

-- 4. Edit the words of your own message (text, or a photo or voice caption).
create or replace function public.edit_message(p_id uuid,p_body text)
returns public.messages language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v public.messages; v_body text:=nullif(btrim(p_body),'');
begin
 select * into v from public.messages where id=p_id and pair_id=app_private.my_pair();
 if not found or v.sender_id<>v_me or v.deleted_at is not null then raise exception 'Message unavailable' using errcode='42501'; end if;
 if v.kind not in ('text','photo','voice') or (v.kind='text' and v_body is null) then
   raise exception 'Nothing to edit' using errcode='22023'; end if;
 if v.body is not distinct from v_body then return v; end if;
 update public.messages set body=v_body,edited_at=clock_timestamp() where id=p_id returning * into v;
 perform app_private.talk('edit',to_jsonb(v));
 return v;
end $$;

-- 5. Delete your own message: it becomes a tombstone; its uploads are marked for removal.
create or replace function public.delete_message(p_id uuid)
returns public.messages language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v public.messages;
begin
 select * into v from public.messages where id=p_id and pair_id=app_private.my_pair();
 if not found or v.sender_id<>v_me then raise exception 'Message unavailable' using errcode='42501'; end if;
 if v.deleted_at is not null then return v; end if;
 update public.messages set body=null,payload=null,deleted_at=clock_timestamp() where id=p_id returning * into v;
 update public.media_files set status='deleting',updated_at=clock_timestamp() where message_id=p_id and status<>'deleting';
 delete from public.message_reactions where message_id=p_id;
 perform app_private.talk('delete',jsonb_build_object('id',v.id,'deleted_at',v.deleted_at));
 return v;
end $$;

-- 6. React (one emoji each per message); null takes your reaction away.
create or replace function public.react_message(p_message_id uuid,p_emoji text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair();
begin
 if not exists(select 1 from public.messages where id=p_message_id and pair_id=v_pair and deleted_at is null) then
   raise exception 'Message unavailable' using errcode='42501'; end if;
 if p_emoji is null then delete from public.message_reactions where message_id=p_message_id and profile_id=v_me;
 else insert into public.message_reactions(message_id,profile_id,pair_id,emoji) values(p_message_id,v_me,v_pair,p_emoji)
   on conflict(message_id,profile_id) do update set emoji=excluded.emoji,created_at=clock_timestamp();
 end if;
 perform app_private.talk('reaction',jsonb_build_object('message_id',p_message_id,'profile_id',v_me,'emoji',p_emoji));
 return 1;
end $$;

-- 7. Read up to a moment ("seen"); also clears your message bell rows up to then.
create or replace function public.mark_chat_read(p_until timestamptz)
returns public.chat_reads language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v public.chat_reads; v_at timestamptz:=least(p_until,clock_timestamp());
begin
 if p_until is null then raise exception 'Read time required' using errcode='22023'; end if;
 insert into public.chat_reads(profile_id,pair_id,last_read_at) values(v_me,v_pair,v_at)
 on conflict(profile_id) do update set last_read_at=greatest(public.chat_reads.last_read_at,excluded.last_read_at),updated_at=clock_timestamp()
 returning * into v;
 update public.notifications set read_at=clock_timestamp()
 where recipient_id=v_me and pair_id=v_pair and kind='message' and read_at is null and created_at<=v.last_read_at;
 perform app_private.talk('read',jsonb_build_object('profile_id',v_me,'last_read_at',v.last_read_at));
 return v;
end $$;

-- 8. Reserve an upload for one of your photo or voice messages (then upload, then finalize_media).
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
 if not ((v_msg.kind='photo' and p_mime_type like 'image/%') or (v_msg.kind='voice' and p_mime_type like 'audio/%')) then
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

do $grants$
declare f text;
begin
 foreach f in array array['public.send_message(uuid,text,text,jsonb,uuid)','public.edit_message(uuid,text)','public.delete_message(uuid)',
   'public.react_message(uuid,text)','public.mark_chat_read(timestamptz)','public.reserve_message_media(uuid,uuid,text,text)'] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $grants$;
revoke all on function app_private.can_message(uuid),app_private.talk(text,jsonb) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';

-- 9. Verification (read-only; any failure rolls everything back).
do $verify$
begin
 if to_regprocedure('app_private.notify_partner(uuid,text,uuid)') is null then raise exception '008: apply 006 first'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('messages','message_reactions','chat_reads') and not c.relrowsecurity) then raise exception '008: RLS disabled'; end if;
 if has_table_privilege('anon','public.messages','SELECT') or has_table_privilege('authenticated','public.messages','INSERT')
    or has_table_privilege('authenticated','public.messages','UPDATE') or has_table_privilege('authenticated','public.message_reactions','INSERT')
    or has_table_privilege('authenticated','public.chat_reads','UPDATE') then raise exception '008: unsafe table grant'; end if;
 if has_function_privilege('authenticated','app_private.talk(text,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.send_message(uuid,text,text,jsonb,uuid)','EXECUTE') then raise exception '008: unsafe function grant'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where ((n.nspname='public' and p.proname in ('send_message','edit_message','delete_message','react_message','mark_chat_read','reserve_message_media'))
       or (n.nspname='app_private' and p.proname in ('can_message','can_media','talk')))
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception '008: functions need security definer with empty search_path'; end if;
 if exists(select 1 from public.media_files where num_nonnulls(content_id,message_id)<>1) then raise exception '008: media without exactly one parent'; end if;
end $verify$;
commit;
