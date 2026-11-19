-- 006: Spanish, private live rooms per pair, and the bell inbox.
-- Apply AFTER 005, as postgres, on the dedicated project, in this one transaction.
-- Additive: no existing row, column or function is dropped. Re-runnable.
-- The verification block at the end raises (and rolls everything back) on any unsafe state.
begin;

-- 1. Spanish joins the saved app languages. Existing rows keep their language.
alter table public.profile_preferences drop constraint if exists profile_preferences_locale_check;
alter table public.profile_preferences add constraint profile_preferences_locale_check
  check (locale in ('en','es','fr','it','aeb-TN'));

-- 2. Private live rooms: topic "pair:<pair id>:<room>", broadcast and presence only.
-- Nothing is stored by these rooms. Clients join with config.private=true.
-- Database-sent broadcasts (realtime.send) reach only members of that pair.
drop policy if exists pair_rooms_read on realtime.messages;
create policy pair_rooms_read on realtime.messages for select to authenticated
  using ((select realtime.topic()) ~ '^pair:[0-9a-f-]{36}:(home|music|talk|play|learn)$'
    and split_part((select realtime.topic()),':',2)=(select app_private.my_pair())::text
    and realtime.messages.extension in ('broadcast','presence'));
drop policy if exists pair_rooms_write on realtime.messages;
create policy pair_rooms_write on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) ~ '^pair:[0-9a-f-]{36}:(home|music|talk|play|learn)$'
    and split_part((select realtime.topic()),':',2)=(select app_private.my_pair())::text
    and realtime.messages.extension in ('broadcast','presence'));

-- 3. The bell inbox. One row per thing that happened for the recipient.
-- It only points at the source row (ref_id); the text shown comes from the app catalog,
-- so every kind reads in each person's own language. Thoughts keep their own table.
create table if not exists public.notifications (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  sender_id uuid not null references public.users_profiles(id),
  recipient_id uuid not null references public.users_profiles(id),
  kind text not null check (kind in ('message','dedication','song_added','game_invite','game_turn','teach_card')),
  ref_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  foreign key (pair_id,sender_id) references public.pair_members(pair_id,profile_id),
  foreign key (pair_id,recipient_id) references public.pair_members(pair_id,profile_id),
  check (sender_id<>recipient_id)
);
create index if not exists notifications_inbox on public.notifications(recipient_id,created_at desc,id);
create index if not exists notifications_pair on public.notifications(pair_id);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated,service_role;
grant select on public.notifications to authenticated;
drop policy if exists inbox_read on public.notifications;
create policy inbox_read on public.notifications for select to authenticated
  using (recipient_id=app_private.my_id() and pair_id=app_private.my_pair());

-- Internal: feature RPCs (music, talk, play, learn) call this after their own write.
-- Same id retried returns the stored row; a different payload for that id conflicts.
create or replace function app_private.notify_partner(p_id uuid,p_kind text,p_ref uuid)
returns public.notifications language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.my_id(); v_pair uuid:=app_private.my_pair(); v_peer uuid; v_row public.notifications;
begin
 if p_id is null then raise exception 'Notification UUID required' using errcode='22023'; end if;
 select * into v_row from public.notifications where id=p_id;
 if found then
   if v_row.sender_id<>v_me or v_row.pair_id<>v_pair or v_row.kind<>p_kind or v_row.ref_id is distinct from p_ref then
     raise exception 'Notification ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 select profile_id into v_peer from public.pair_members where pair_id=v_pair and profile_id<>v_me;
 if v_peer is null then raise exception 'Partner unavailable' using errcode='42501'; end if;
 if (select count(*) from public.notifications where sender_id=v_me and created_at>clock_timestamp()-interval '1 day')>=500 then
   raise exception 'Notification quota: 500 per day' using errcode='54000'; end if;
 insert into public.notifications(id,pair_id,sender_id,recipient_id,kind,ref_id)
 values(p_id,v_pair,v_me,v_peer,p_kind,p_ref) returning * into v_row;
 return v_row;
end $$;
revoke all on function app_private.notify_partner(uuid,text,uuid) from public,anon,authenticated,service_role;

-- The recipient marks rows read: one, several, or all (empty array means all).
create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_count integer;
begin
 if p_ids is null or cardinality(p_ids)>500 then raise exception 'Between 0 and 500 notification IDs' using errcode='22023'; end if;
 update public.notifications set read_at=clock_timestamp()
 where recipient_id=v_me and pair_id=app_private.my_pair() and read_at is null
   and (cardinality(p_ids)=0 or id=any(p_ids));
 get diagnostics v_count=row_count;
 if v_count>0 then perform app_private.signal(false); end if;
 return v_count;
end $$;
revoke all on function public.mark_notifications_read(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

notify pgrst,'reload schema';

-- 4. Verification (read-only checks; any failure aborts the whole transaction).
do $verify$
begin
 if not exists(select 1 from pg_constraint where conname='profile_preferences_locale_check' and pg_get_constraintdef(oid) like '%''es''%') then
   raise exception '006: Spanish locale missing'; end if;
 if (select count(*) from pg_policies where schemaname='realtime' and tablename='messages' and policyname in ('pair_rooms_read','pair_rooms_write'))<>2 then
   raise exception '006: pair room policies missing'; end if;
 if (select count(*) from pg_policies where schemaname='realtime' and tablename='messages' and policyname in ('hockey_pair_read','hockey_pair_write'))<>2 then
   raise exception '006: hockey policies must stay'; end if;
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='notifications' and c.relrowsecurity) then
   raise exception '006: notifications RLS disabled'; end if;
 if has_table_privilege('anon','public.notifications','SELECT') or has_table_privilege('authenticated','public.notifications','INSERT')
    or has_table_privilege('authenticated','public.notifications','UPDATE') or has_table_privilege('authenticated','public.notifications','DELETE') then
   raise exception '006: unsafe notifications grant'; end if;
 if has_function_privilege('authenticated','app_private.notify_partner(uuid,text,uuid)','EXECUTE')
    or has_function_privilege('anon','public.mark_notifications_read(uuid[])','EXECUTE') then
   raise exception '006: unsafe function grant'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname,p.proname) in (('public','mark_notifications_read'),('app_private','notify_partner'))
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception '006: functions need security definer with empty search_path'; end if;
end $verify$;
commit;
