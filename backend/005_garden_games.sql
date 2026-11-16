-- 005: six garden flowers, Italian locale, shared games (truth or dare, air hockey).
-- Apply AFTER 001 -> 002 -> 003 -> 004, as postgres, on the dedicated project, in this one transaction.
-- Re-runnable for this exact schema. Adds no data and changes no existing rows.
-- The verification block at the end raises (and rolls everything back) on any unsafe state.
begin;

-- 1. Six flowers. Existing rows (jasmine, lilium, orchid) stay valid.
alter table public.flowers drop constraint if exists flowers_flower_type_check;
alter table public.flowers add constraint flowers_flower_type_check
  check (flower_type in ('rose','marigold','jasmine','lavender','lilium','orchid'));

-- 2. Italian locale for saved preferences (push payloads read this value).
alter table public.profile_preferences drop constraint if exists profile_preferences_locale_check;
alter table public.profile_preferences add constraint profile_preferences_locale_check
  check (locale in ('en','fr','it','aeb-TN'));

-- 3. Game events: one row per truth-or-dare turn, and one per finished game.
-- Card text lives in the app catalog; only the stable card id is stored.
create table if not exists public.game_events (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  profile_id uuid not null references public.users_profiles(id),
  game text not null check (game in ('truth_dare','hockey')),
  kind text not null check (kind in ('truth','dare','finish')),
  card_id text check (card_id is null or card_id ~ '^[td][0-9]{2}$'),
  response text check (response is null or char_length(response) between 1 and 500),
  score_me smallint check (score_me between 0 and 99),
  score_partner smallint check (score_partner between 0 and 99),
  created_at timestamptz not null default now(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id),
  constraint game_events_shape check (
    (game='truth_dare' and kind in ('truth','dare') and card_id is not null and left(card_id,1)=left(kind,1) and score_me is null and score_partner is null)
    or (game='truth_dare' and kind='finish' and card_id is null and response is null and score_me is null and score_partner is null)
    or (game='hockey' and kind='finish' and card_id is null and response is null and score_me is not null and score_partner is not null))
);
create index if not exists game_events_pair on public.game_events(pair_id,created_at);
alter table public.game_events enable row level security;
revoke all on public.game_events from public,anon,authenticated;
grant select on public.game_events to authenticated;
drop policy if exists connection_read on public.game_events;
create policy connection_read on public.game_events for select to authenticated using (pair_id=app_private.my_pair());

-- Turns alternate inside a truth-or-dare game; a finish needs at least one turn.
-- Same id + same fields returns the stored row (safe retry), like plant_flower.
create or replace function public.record_game_event(p_id uuid,p_game text,p_kind text,p_card_id text,p_response text,p_score_me smallint,p_score_partner smallint)
returns public.game_events language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.game_events; v_last public.game_events;
begin
 select * into v_row from public.game_events where id=p_id;
 if found then
   if v_row.profile_id<>v_me or v_row.pair_id<>v_pair or v_row.game is distinct from p_game or v_row.kind is distinct from p_kind
      or v_row.card_id is distinct from p_card_id or v_row.score_me is distinct from p_score_me or v_row.score_partner is distinct from p_score_partner then
     raise exception 'Game event ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 if (select count(*) from public.pair_members where pair_id=v_pair)<>2 then raise exception 'Two enrolled members required' using errcode='42501'; end if;
 if (select count(*) from public.game_events where pair_id=v_pair)>=20000 then raise exception 'Game quota' using errcode='54000'; end if;
 if p_game='truth_dare' then
   select * into v_last from public.game_events where pair_id=v_pair and game='truth_dare' order by created_at desc,id desc limit 1;
   if p_kind in ('truth','dare') and found and v_last.kind<>'finish' and v_last.profile_id=v_me then
     raise exception 'Not your turn' using errcode='PT409'; end if;
   if p_kind='finish' and (not found or v_last.kind='finish') then
     raise exception 'No turns to finish' using errcode='22023'; end if;
 end if;
 insert into public.game_events(id,pair_id,profile_id,game,kind,card_id,response,score_me,score_partner)
 values(p_id,v_pair,v_me,p_game,p_kind,p_card_id,nullif(btrim(p_response),''),p_score_me,p_score_partner) returning * into v_row;
 perform app_private.signal(true); return v_row;
end $$;
revoke all on function public.record_game_event(uuid,text,text,text,text,smallint,smallint) from public,anon,authenticated,service_role;
grant execute on function public.record_game_event(uuid,text,text,text,text,smallint,smallint) to authenticated;

-- 4. Live air hockey: a private Realtime channel per pair ("hockey:<pair id>").
-- Broadcast and presence only; nothing is stored. Clients must join with config.private=true.
drop policy if exists hockey_pair_read on realtime.messages;
create policy hockey_pair_read on realtime.messages for select to authenticated
  using ((select realtime.topic())='hockey:'||(select app_private.my_pair())::text and realtime.messages.extension in ('broadcast','presence'));
drop policy if exists hockey_pair_write on realtime.messages;
create policy hockey_pair_write on realtime.messages for insert to authenticated
  with check ((select realtime.topic())='hockey:'||(select app_private.my_pair())::text and realtime.messages.extension in ('broadcast','presence'));

-- 5. Verification (read-only checks; any failure aborts the whole transaction).
do $verify$
begin
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='game_events' and c.relrowsecurity) then
   raise exception '005: game_events RLS disabled'; end if;
 if has_table_privilege('anon','public.game_events','SELECT') or has_table_privilege('authenticated','public.game_events','INSERT')
    or has_table_privilege('authenticated','public.game_events','UPDATE') or has_table_privilege('authenticated','public.game_events','DELETE') then
   raise exception '005: unsafe game_events grant'; end if;
 if has_function_privilege('anon','public.record_game_event(uuid,text,text,text,text,smallint,smallint)','EXECUTE') then
   raise exception '005: anon may record games'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_game_event'
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception '005: record_game_event needs security definer with empty search_path'; end if;
 if (select count(*) from pg_policies where schemaname='realtime' and tablename='messages' and policyname in ('hockey_pair_read','hockey_pair_write'))<>2 then
   raise exception '005: hockey channel policies missing'; end if;
end $verify$;
commit;
