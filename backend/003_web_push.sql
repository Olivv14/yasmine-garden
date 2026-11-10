-- Standard Web Push, dedicated project only. Requires 001 -> 002. No network IO.
begin;
create table if not exists app_private.push_subscriptions (
 id uuid primary key,
 owner_id uuid not null references public.users_profiles(id),
 pair_id uuid not null references public.pairs(id),
 endpoint text not null,
 p256dh text not null,
 auth_secret text not null,
 enabled boolean not null default true,
 preview boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(pair_id,owner_id) references public.pair_members(pair_id,profile_id)
);
-- One active identity per endpoint; disabled immutable rows pin its owner forever.
-- Install the replacement before dropping old 003's lifetime-unique constraint.
create unique index if not exists push_subscriptions_active_endpoint
 on app_private.push_subscriptions(endpoint) where enabled;
create index if not exists push_subscriptions_endpoint_history
 on app_private.push_subscriptions(endpoint);
create index if not exists push_subscriptions_owner_created
 on app_private.push_subscriptions(owner_id,created_at);
alter table app_private.push_subscriptions
 drop constraint if exists push_subscriptions_endpoint_key;
create table if not exists app_private.push_deliveries (
 event_id uuid not null references public.thought_events(id),
 subscription_id uuid not null references app_private.push_subscriptions(id),
 status text not null default 'pending' check(status in ('pending','leased','retry','accepted','gone','rejected','cancelled','exhausted')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_token uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(),
 accepted_at timestamptz,
 primary key(event_id,subscription_id)
);
alter table app_private.push_subscriptions enable row level security;
alter table app_private.push_deliveries enable row level security;
revoke all on app_private.push_subscriptions,app_private.push_deliveries from public,anon,authenticated,service_role;

-- Deliberately narrow real vendor origins. No arbitrary hosts, IPs, userinfo, ports,
-- escapes, whitespace, query/fragment or redirects. Rechecked by transport.
create or replace function app_private.push_endpoint_valid(p_endpoint text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(p_endpoint) between 20 and 2048 and p_endpoint ~
 '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com)/[A-Za-z0-9_./~-]+$'
 and p_endpoint !~ '(^|/)\.{1,2}(/|$)',false)
$$;
create or replace function app_private.push_key_valid(p_key text,p_size integer)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_raw bytea;
begin
 if p_key is null or p_key !~ '^[A-Za-z0-9_-]+$' or length(p_key)<>(case p_size when 65 then 87 when 16 then 22 else 0 end) then return false; end if;
 v_raw:=decode(translate(p_key,'-_','+/')||repeat('=',(4-length(p_key)%4)%4),'base64');
 return octet_length(v_raw)=p_size and (p_size<>65 or get_byte(v_raw,0)=4)
 and rtrim(translate(replace(encode(v_raw,'base64'),E'\n',''),'+/','-_'),'=')=p_key;
exception when others then return false;
end $$;

create or replace function public.register_my_push(p_id uuid,p_endpoint text,p_p256dh text,p_auth text,p_preview boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row app_private.push_subscriptions;
 v_now timestamptz:=clock_timestamp(); v_day timestamptz;
begin
 if p_id is null or p_preview is null or not app_private.push_endpoint_valid(p_endpoint)
 or not app_private.push_key_valid(p_p256dh,65) or not app_private.push_key_valid(p_auth,16) then
 raise exception 'Invalid push subscription' using errcode='22023'; end if;
 select * into v_row from app_private.push_subscriptions where id=p_id;
 if found and (v_row.owner_id<>v_me or v_row.endpoint<>p_endpoint or v_row.p256dh<>p_p256dh or v_row.auth_secret<>p_auth) then
   raise exception 'Push operation conflict' using errcode='23505'; end if;
 -- Pair-first serialization also protects these historical owner pins and counts.
 if exists(select 1 from app_private.push_subscriptions where endpoint=p_endpoint
   and (owner_id<>v_me or (enabled and id<>p_id))) then
   raise exception 'Push operation conflict' using errcode='23505'; end if;
 -- An already enabled retry consumes no new-device quota, even at every limit.
 if (v_row.id is null or not v_row.enabled) and
   (select count(*) from app_private.push_subscriptions where owner_id=v_me and enabled)>=5 then
   raise exception 'Push device quota' using errcode='54000'; end if;
 if v_row.id is not null then
   update app_private.push_subscriptions set enabled=true,preview=p_preview where id=p_id returning * into v_row;
 else
   v_day:=date_trunc('day',v_now,'UTC');
   if (select count(*) from app_private.push_subscriptions where owner_id=v_me)>=10000 then
     raise exception 'Push identity quota' using errcode='54000'; end if;
   if (select count(*) from app_private.push_subscriptions where owner_id=v_me
     and created_at>=v_day and created_at<v_day+interval '24 hours')>=10 then
     raise exception 'Push daily identity quota' using errcode='54000'; end if;
   insert into app_private.push_subscriptions(id,owner_id,pair_id,endpoint,p256dh,auth_secret,preview,created_at)
   values(p_id,v_me,app_private.my_pair(),p_endpoint,p_p256dh,p_auth,p_preview,v_now) returning * into v_row;
 end if;
 return jsonb_build_object('id',v_row.id,'enabled',v_row.enabled,'preview',v_row.preview,'created_at',v_row.created_at);
end $$;
create or replace function public.disable_my_push(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write();
begin
 if not exists(select 1 from app_private.push_subscriptions where id=p_id and owner_id=v_me) then
 raise exception 'Push subscription unavailable' using errcode='42501'; end if;
 update app_private.push_subscriptions set enabled=false where id=p_id;
 update app_private.push_deliveries set status='cancelled',lease_token=null,lease_until=null
 where subscription_id=p_id and status in ('pending','retry','leased');
end $$;
create or replace function public.list_my_push()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.my_id();
begin
 if v_me is null then raise exception 'Enrollment required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'enabled',enabled,'preview',preview,'created_at',created_at) order by created_at,id)
 from app_private.push_subscriptions where owner_id=v_me),'[]'::jsonb);
end $$;
-- Capture eligible devices ONLY at event creation, inside send_thought's pair lock.
-- Applying 003 or registering/re-enabling a device NEVER backfills old events.
create or replace function app_private.push_snapshot_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.push_deliveries(event_id,subscription_id)
 select new.id,s.id from app_private.push_subscriptions s
 where s.owner_id=new.recipient_id and s.pair_id=new.pair_id and s.enabled;
 return new;
end $$;
drop trigger if exists thought_push_snapshot on public.thought_events;
create trigger thought_push_snapshot after insert on public.thought_events
for each row execute function app_private.push_snapshot_event();

create or replace function public.push_claim(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.thought_events; v_locale text; v_now timestamptz; v_targets jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 select * into v_event from public.thought_events where id=p_event_id;
 if not found then raise exception 'Thought unavailable' using errcode='42501'; end if;
 perform 1 from public.pairs where id=v_event.pair_id for update;
 v_now:=clock_timestamp();
 select locale into v_locale from public.profile_preferences where profile_id=v_event.recipient_id;
 if exists(select 1 from app_private.push_deliveries where event_id=p_event_id and status in ('pending','retry','leased'))
 and v_locale is null then raise exception 'Recipient locale required' using errcode='22023'; end if;
 update app_private.push_deliveries d set status='cancelled',lease_token=null,lease_until=null
 from app_private.push_subscriptions s where d.event_id=p_event_id and s.id=d.subscription_id and not s.enabled and d.status in ('pending','retry','leased');
 update app_private.push_deliveries set status='exhausted',lease_token=null,lease_until=null
 where event_id=p_event_id and attempts>=3 and (status='retry' or (status='leased' and lease_until<=v_now));
 with claimed as (
 update app_private.push_deliveries d set status='leased',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_until=v_now+interval '90 seconds'
 from app_private.push_subscriptions s
 where d.event_id=p_event_id and s.id=d.subscription_id and s.enabled and attempts<3
 and ((d.status in ('pending','retry') and d.next_attempt_at<=v_now) or (d.status='leased' and d.lease_until<=v_now))
 returning d.subscription_id,d.lease_token,d.attempts)
 select coalesce(jsonb_agg(jsonb_build_object('subscription_id',s.id,'lease_token',c.lease_token,'attempt',c.attempts,
 'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_secret,'preview',s.preview,'locale',v_locale,
 'phrase_key',v_event.phrase_key,'sender',(select display_name from public.users_profiles where id=v_event.sender_id))), '[]'::jsonb)
 into v_targets from claimed c join app_private.push_subscriptions s on s.id=c.subscription_id;
 return v_targets;
end $$;
create or replace function public.push_complete(p_event_id uuid,p_subscription_id uuid,p_lease_token uuid,p_outcome text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_pair uuid; v_sub uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('accepted','retry','gone','rejected') then raise exception 'Invalid push outcome' using errcode='22023'; end if;
 select pair_id into v_pair from public.thought_events where id=p_event_id;
 if v_pair is null then raise exception 'Thought unavailable' using errcode='42501'; end if;
 perform 1 from public.pairs where id=v_pair for update;
 update app_private.push_deliveries set
 status=case when p_outcome='retry' and attempts>=3 then 'exhausted' else p_outcome end,
 accepted_at=case when p_outcome='accepted' then clock_timestamp() else null end,
 next_attempt_at=clock_timestamp()+interval '30 seconds',lease_token=null,lease_until=null
 where event_id=p_event_id and subscription_id=p_subscription_id and status='leased' and lease_token=p_lease_token
 returning subscription_id into v_sub;
 if v_sub is null then return false; end if;
 if p_outcome='gone' then
   update app_private.push_subscriptions set enabled=false where id=v_sub;
   update app_private.push_deliveries set status='cancelled',lease_token=null,lease_until=null
   where subscription_id=v_sub and status in ('pending','retry','leased');
 end if;
 return true;
end $$;
create or replace function public.push_status(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 return (select jsonb_build_object('targets',count(*),'provider_accepted',count(*) filter(where status='accepted'),
 'retriable',count(*) filter(where status in ('pending','retry','leased')),
 'terminal',count(*) filter(where status in ('gone','rejected','cancelled','exhausted')))
 from app_private.push_deliveries where event_id=p_event_id);
end $$;
-- Each function's API execute ACL is exact; private helpers never browser callable.
revoke all on function app_private.push_endpoint_valid(text),app_private.push_key_valid(text,integer),app_private.push_snapshot_event() from public,anon,authenticated,service_role;
revoke all on function public.register_my_push(uuid,text,text,text,boolean),public.disable_my_push(uuid),public.list_my_push() from public,anon,authenticated,service_role;
grant execute on function public.register_my_push(uuid,text,text,text,boolean),public.disable_my_push(uuid),public.list_my_push() to authenticated;
revoke all on function public.push_claim(uuid),public.push_complete(uuid,uuid,uuid,text),public.push_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.push_claim(uuid),public.push_complete(uuid,uuid,uuid,text),public.push_status(uuid) to service_role;
notify pgrst,'reload schema';
commit;
