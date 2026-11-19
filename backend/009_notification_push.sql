-- 009: push for every bell row: a message, a dedication, an added song, a game invite or turn, a word.
-- Same design as 003 for thoughts (which keep working unchanged): devices are captured when the row is
-- created, only the sender's own dispatch call (verified by the Edge Function) sends it, deliveries are
-- leased, retried at most 3 times, and a gone device is disabled.
-- Apply AFTER 003, 006, 007 and 008, as postgres, in this one transaction.
begin;

create table if not exists app_private.notification_deliveries (
 notification_id uuid not null references public.notifications(id),
 subscription_id uuid not null references app_private.push_subscriptions(id),
 status text not null default 'pending' check(status in ('pending','leased','retry','accepted','gone','rejected','cancelled','exhausted')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_token uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(),
 accepted_at timestamptz,
 primary key(notification_id,subscription_id)
);
alter table app_private.notification_deliveries enable row level security;
revoke all on app_private.notification_deliveries from public,anon,authenticated,service_role;

-- Capture the recipient's enabled devices at creation. Registering a device never backfills old rows.
create or replace function app_private.push_snapshot_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.notification_deliveries(notification_id,subscription_id)
 select new.id,s.id from app_private.push_subscriptions s
 where s.owner_id=new.recipient_id and s.pair_id=new.pair_id and s.enabled;
 return new;
end $$;
drop trigger if exists notification_push_snapshot on public.notifications;
create trigger notification_push_snapshot after insert on public.notifications
for each row execute function app_private.push_snapshot_notification();

-- Service role only. p_sender_auth is the Auth user the Edge Function verified: only the sender of a
-- row can dispatch it. The preview text (message words, song title) goes only to devices with preview on.
create or replace function public.push_claim_notification(p_id uuid,p_sender_auth uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_n public.notifications; v_locale text; v_now timestamptz; v_targets jsonb; v_preview text; v_sender text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 select * into v_n from public.notifications where id=p_id;
 if not found or not exists(select 1 from public.users_profiles where id=v_n.sender_id and auth_user_id=p_sender_auth) then
   raise exception 'Notification unavailable' using errcode='42501'; end if;
 perform 1 from public.pairs where id=v_n.pair_id for update;
 v_now:=clock_timestamp();
 select coalesce((select locale from public.profile_preferences where profile_id=v_n.recipient_id),'en') into v_locale;
 select display_name into v_sender from public.users_profiles where id=v_n.sender_id;
 v_preview:=case v_n.kind
   when 'message' then (select case when m.kind='text' then left(m.body,140) else null end from public.messages m where m.id=v_n.ref_id and m.deleted_at is null)
   when 'dedication' then (select left(i.title,140) from public.playlist_items i where i.id=v_n.ref_id and i.deleted_at is null)
   when 'song_added' then (select left(i.title,140) from public.playlist_items i where i.id=v_n.ref_id and i.deleted_at is null)
   else null end;
 update app_private.notification_deliveries d set status='cancelled',lease_token=null,lease_until=null
 from app_private.push_subscriptions s where d.notification_id=p_id and s.id=d.subscription_id and not s.enabled and d.status in ('pending','retry','leased');
 update app_private.notification_deliveries set status='exhausted',lease_token=null,lease_until=null
 where notification_id=p_id and attempts>=3 and (status='retry' or (status='leased' and lease_until<=v_now));
 with claimed as (
  update app_private.notification_deliveries d set status='leased',attempts=attempts+1,
   lease_token=gen_random_uuid(),lease_until=v_now+interval '90 seconds'
  from app_private.push_subscriptions s
  where d.notification_id=p_id and s.id=d.subscription_id and s.enabled and attempts<3
   and ((d.status in ('pending','retry') and d.next_attempt_at<=v_now) or (d.status='leased' and d.lease_until<=v_now))
  returning d.subscription_id,d.lease_token,d.attempts)
 select coalesce(jsonb_agg(jsonb_build_object('subscription_id',s.id,'lease_token',c.lease_token,'attempt',c.attempts,
   'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_secret,'preview',s.preview,'locale',v_locale,
   'kind',v_n.kind,'sender',v_sender,'text',case when s.preview then v_preview else null end)),'[]'::jsonb)
 into v_targets from claimed c join app_private.push_subscriptions s on s.id=c.subscription_id;
 return v_targets;
end $$;

create or replace function public.push_complete_notification(p_id uuid,p_subscription_id uuid,p_lease_token uuid,p_outcome text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_pair uuid; v_sub uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('accepted','retry','gone','rejected') then raise exception 'Invalid push outcome' using errcode='22023'; end if;
 select pair_id into v_pair from public.notifications where id=p_id;
 if v_pair is null then raise exception 'Notification unavailable' using errcode='42501'; end if;
 perform 1 from public.pairs where id=v_pair for update;
 update app_private.notification_deliveries set
  status=case when p_outcome='retry' and attempts>=3 then 'exhausted' else p_outcome end,
  accepted_at=case when p_outcome='accepted' then clock_timestamp() else null end,
  next_attempt_at=clock_timestamp()+interval '30 seconds',lease_token=null,lease_until=null
 where notification_id=p_id and subscription_id=p_subscription_id and status='leased' and lease_token=p_lease_token
 returning subscription_id into v_sub;
 if v_sub is null then return false; end if;
 if p_outcome='gone' then
   update app_private.push_subscriptions set enabled=false where id=v_sub;
   update app_private.push_deliveries set status='cancelled',lease_token=null,lease_until=null where subscription_id=v_sub and status in ('pending','retry','leased');
   update app_private.notification_deliveries set status='cancelled',lease_token=null,lease_until=null where subscription_id=v_sub and status in ('pending','retry','leased');
 end if;
 return true;
end $$;

create or replace function public.push_status_notification(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 return (select jsonb_build_object('targets',count(*),'provider_accepted',count(*) filter(where status='accepted'),
  'retriable',count(*) filter(where status in ('pending','retry','leased')),
  'terminal',count(*) filter(where status in ('gone','rejected','cancelled','exhausted')))
  from app_private.notification_deliveries where notification_id=p_id);
end $$;

revoke all on function app_private.push_snapshot_notification() from public,anon,authenticated,service_role;
revoke all on function public.push_claim_notification(uuid,uuid),public.push_complete_notification(uuid,uuid,uuid,text),public.push_status_notification(uuid) from public,anon,authenticated,service_role;
grant execute on function public.push_claim_notification(uuid,uuid),public.push_complete_notification(uuid,uuid,uuid,text),public.push_status_notification(uuid) to service_role;
notify pgrst,'reload schema';

do $verify$
begin
 if to_regclass('public.messages') is null then raise exception '009: apply 008 first'; end if;
 if has_function_privilege('authenticated','public.push_claim_notification(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.push_complete_notification(uuid,uuid,uuid,text)','EXECUTE') then
   raise exception '009: push functions must be service role only'; end if;
 if not exists(select 1 from pg_trigger where tgname='notification_push_snapshot') then raise exception '009: snapshot trigger missing'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where ((n.nspname='public' and p.proname in ('push_claim_notification','push_complete_notification','push_status_notification'))
       or (n.nspname='app_private' and p.proname='push_snapshot_notification'))
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception '009: functions need security definer with empty search_path'; end if;
end $verify$;
commit;
