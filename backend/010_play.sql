-- 010: Play. Air hockey against the toad, word duels and "How well do you know me", played in turns.
-- Truth-or-dare spice levels need no change here: the new cards (t11-t30, d11-d30) live in the app
-- catalog and already fit the stored card id check.
-- Apply AFTER 009, as postgres, in this one transaction. Additive: two checks get wider, two tables and
-- three functions are new; no existing row, column or function is removed.
begin;

-- 1. Practice air hockey against the toad: saved like a live game, so it counts for the week.
alter table public.game_events drop constraint if exists game_events_game_check;
alter table public.game_events add constraint game_events_game_check check (game in ('truth_dare','hockey','hockey_bot'));
alter table public.game_events drop constraint if exists game_events_shape;
alter table public.game_events add constraint game_events_shape check (
    (game='truth_dare' and kind in ('truth','dare') and card_id is not null and left(card_id,1)=left(kind,1) and score_me is null and score_partner is null)
    or (game='truth_dare' and kind='finish' and card_id is null and response is null and score_me is null and score_partner is null)
    or (game in ('hockey','hockey_bot') and kind='finish' and card_id is null and response is null and score_me is not null and score_partner is not null));

-- 2. A new bell kind: your partner played the round you started.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message','dedication','song_added','game_invite','game_turn','game_result','teach_card'));

-- 3. Rounds played in turns. Word duel: both answer the same words (picks are 1 right, 0 wrong,
-- -1 out of time). Know me: one answers about themself (picks 0-3), the other guesses (picks 0-3).
-- Words and questions live in the app; only their ids are stored. Scores are computed here.
create or replace function app_private.play_items_ok(p text[]) returns boolean
language sql immutable set search_path='' as $$
  select p is not null and cardinality(p) between 3 and 10
    and not exists(select 1 from unnest(p) x where x is null or x !~ '^[a-z0-9][a-z0-9_.-]{0,39}$')
    and (select count(distinct x) from unnest(p) x)=cardinality(p)
$$;
create or replace function app_private.play_picks_ok(p_role text,p smallint[]) returns boolean
language sql immutable set search_path='' as $$
  select p is not null and cardinality(p) between 3 and 10
    and not exists(select 1 from unnest(p) x where x is null
      or (p_role='player' and x not in (-1,0,1)) or (p_role in ('self','guess') and x not between 0 and 3))
$$;

create table if not exists public.play_rounds (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  game text not null check (game in ('word_duel','know_me')),
  started_by uuid not null references public.users_profiles(id),
  deck text check (deck is null or deck ~ '^[a-z][a-z0-9-]{1,23}$'),
  items text[] not null check (app_private.play_items_ok(items)),
  created_at timestamptz not null default now(),
  foreign key (pair_id,started_by) references public.pair_members(pair_id,profile_id),
  constraint play_rounds_shape check ((game='word_duel' and deck is not null) or (game='know_me' and deck is null))
);
create index if not exists play_rounds_pair on public.play_rounds(pair_id,created_at desc);

create table if not exists public.play_answers (
  id uuid not null unique,
  round_id uuid not null references public.play_rounds(id),
  profile_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  role text not null check (role in ('player','self','guess')),
  picks smallint[] not null,
  score smallint check (score between 0 and 10),
  ms integer check (ms between 0 and 3600000),
  created_at timestamptz not null default now(),
  primary key (round_id,profile_id),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id),
  constraint play_answers_picks check (app_private.play_picks_ok(role,picks)),
  constraint play_answers_shape check ((role='self' and score is null) or (role in ('player','guess') and score is not null))
);
create index if not exists play_answers_pair on public.play_answers(pair_id,created_at desc);

-- Did I already play this round? (Lets the guesser see the answers about the other only afterwards.)
create or replace function app_private.played_round(p_round uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.play_answers where round_id=p_round and profile_id=app_private.my_id())
$$;

alter table public.play_rounds enable row level security;
alter table public.play_answers enable row level security;
revoke all on public.play_rounds,public.play_answers from public,anon,authenticated;
grant select on public.play_rounds,public.play_answers to authenticated;
drop policy if exists connection_read on public.play_rounds;
create policy connection_read on public.play_rounds for select to authenticated using (pair_id=app_private.my_pair());
drop policy if exists connection_read on public.play_answers;
create policy connection_read on public.play_answers for select to authenticated
  using (pair_id=app_private.my_pair() and (profile_id=app_private.my_id() or role<>'self' or app_private.played_round(round_id)));

-- 4. Start a round and play your part of it at once. Same id + same round returns the stored row (safe retry).
create or replace function public.play_start(p_id uuid,p_game text,p_deck text,p_items text[],p_picks smallint[],p_ms integer)
returns public.play_rounds language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.play_rounds; v_role text;
begin
 if p_id is null then raise exception 'Round UUID required' using errcode='22023'; end if;
 select * into v_row from public.play_rounds where id=p_id;
 if found then
   if v_row.pair_id<>v_pair or v_row.started_by<>v_me or v_row.game is distinct from p_game
      or v_row.deck is distinct from p_deck or v_row.items is distinct from p_items then
     raise exception 'Round ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 if (select count(*) from public.pair_members where pair_id=v_pair)<>2 then raise exception 'Two enrolled members required' using errcode='42501'; end if;
 if (select count(*) from public.play_rounds where pair_id=v_pair)>=5000 then raise exception 'Play quota' using errcode='54000'; end if;
 if p_game not in ('word_duel','know_me') then raise exception 'Unknown game' using errcode='22023'; end if;
 v_role:=case when p_game='word_duel' then 'player' else 'self' end;
 if not app_private.play_items_ok(p_items) or not app_private.play_picks_ok(v_role,p_picks) or cardinality(p_picks)<>cardinality(p_items) then
   raise exception 'One valid pick per item' using errcode='22023'; end if;
 if p_ms is not null and p_ms not between 0 and 3600000 then raise exception 'Time out of range' using errcode='22023'; end if;
 insert into public.play_rounds(id,pair_id,game,started_by,deck,items) values(p_id,v_pair,p_game,v_me,p_deck,p_items) returning * into v_row;
 insert into public.play_answers(id,round_id,profile_id,pair_id,role,picks,score,ms)
 values(p_id,p_id,v_me,v_pair,v_role,p_picks,
   case when v_role='player' then (select count(*) from unnest(p_picks) x where x=1) end,
   case when v_role='player' then p_ms end);
 begin perform app_private.notify_partner(p_id,'game_turn',p_id);
 exception when sqlstate '54000' then null; end;
 perform app_private.signal(true);
 return v_row;
end $$;

-- 5. Play the round your partner started. A guess is scored against their answers here, never on a phone.
create or replace function public.play_answer(p_id uuid,p_round_id uuid,p_picks smallint[],p_ms integer)
returns public.play_answers language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_round public.play_rounds; v_row public.play_answers;
  v_role text; v_self smallint[]; v_score smallint;
begin
 if p_id is null then raise exception 'Answer UUID required' using errcode='22023'; end if;
 select * into v_row from public.play_answers where id=p_id;
 if found then
   if v_row.profile_id<>v_me or v_row.round_id is distinct from p_round_id or v_row.picks is distinct from p_picks then
     raise exception 'Answer ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 select * into v_round from public.play_rounds where id=p_round_id and pair_id=v_pair for update;
 if not found then raise exception 'Round unavailable' using errcode='42501'; end if;
 if v_round.started_by=v_me then raise exception 'Your partner plays this round' using errcode='42501'; end if;
 if exists(select 1 from public.play_answers where round_id=p_round_id and profile_id=v_me) then
   raise exception 'Already played' using errcode='PT409'; end if;
 v_role:=case when v_round.game='word_duel' then 'player' else 'guess' end;
 if not app_private.play_picks_ok(v_role,p_picks) or cardinality(p_picks)<>cardinality(v_round.items) then
   raise exception 'One valid pick per item' using errcode='22023'; end if;
 if p_ms is not null and p_ms not between 0 and 3600000 then raise exception 'Time out of range' using errcode='22023'; end if;
 if v_role='guess' then
   select picks into v_self from public.play_answers where round_id=p_round_id and profile_id=v_round.started_by;
   select count(*) into v_score from generate_subscripts(p_picks,1) i where p_picks[i]=v_self[i];
 else
   select count(*) into v_score from unnest(p_picks) x where x=1;
 end if;
 insert into public.play_answers(id,round_id,profile_id,pair_id,role,picks,score,ms)
 values(p_id,p_round_id,v_me,v_pair,v_role,p_picks,v_score,case when v_role='player' then p_ms end) returning * into v_row;
 begin perform app_private.notify_partner(p_id,'game_result',p_round_id);
 exception when sqlstate '54000' then null; end;
 perform app_private.signal(true);
 return v_row;
end $$;

do $grants$
declare f text;
begin
 foreach f in array array['public.play_start(uuid,text,text,text[],smallint[],integer)','public.play_answer(uuid,uuid,smallint[],integer)'] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $grants$;
-- The read policy calls this as the signed-in person; the two checks are used by table constraints.
revoke all on function app_private.played_round(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.played_round(uuid) to authenticated;
revoke all on function app_private.play_items_ok(text[]),app_private.play_picks_ok(text,smallint[]) from public,anon,service_role;
grant execute on function app_private.play_items_ok(text[]),app_private.play_picks_ok(text,smallint[]) to authenticated;

notify pgrst,'reload schema';

-- 6. Verification (read-only; any failure rolls everything back).
do $verify$
begin
 if to_regprocedure('app_private.notify_partner(uuid,text,uuid)') is null then raise exception '010: apply 006 first'; end if;
 if to_regclass('public.messages') is null then raise exception '010: apply 008 first'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('play_rounds','play_answers') and not c.relrowsecurity) then raise exception '010: RLS disabled'; end if;
 if has_table_privilege('anon','public.play_rounds','SELECT') or has_table_privilege('anon','public.play_answers','SELECT')
    or has_table_privilege('authenticated','public.play_rounds','INSERT') or has_table_privilege('authenticated','public.play_answers','INSERT')
    or has_table_privilege('authenticated','public.play_answers','UPDATE') or has_table_privilege('authenticated','public.play_rounds','DELETE') then
   raise exception '010: unsafe table grant'; end if;
 if has_function_privilege('anon','public.play_start(uuid,text,text,text[],smallint[],integer)','EXECUTE')
    or has_function_privilege('anon','public.play_answer(uuid,uuid,smallint[],integer)','EXECUTE') then raise exception '010: unsafe function grant'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where ((n.nspname='public' and p.proname in ('play_start','play_answer')) or (n.nspname='app_private' and p.proname='played_round'))
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception '010: functions need security definer with empty search_path'; end if;
 if exists(select 1 from public.game_events where game not in ('truth_dare','hockey','hockey_bot')) then raise exception '010: unexpected game rows'; end if;
end $verify$;
commit;
