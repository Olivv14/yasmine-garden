-- 021: pool turn by turn, any time (mockup GameStarts4: "A game is waiting: it's your shot").
-- One game at a time per pair. Whoever's turn it is shoots on their phone (the same physics as live pool), and saves
-- the table after the shot; the other phone replays that shot from the table before it, then it is their turn.
-- The server keeps whose turn it is, refuses a shot out of turn or on an old table (version), and tells the partner
-- (a game_turn in the bell, its ref is the game's id). The table is the players' own data (small JSON).
-- Apply after 020, as postgres, in this one transaction. Additive: one table, three functions.
begin;
create table if not exists public.pool_games (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  seat0 uuid not null references public.users_profiles(id),
  seat1 uuid not null references public.users_profiles(id),
  state jsonb not null check (pg_column_size(state)<=24000),
  before_state jsonb check (before_state is null or pg_column_size(before_state)<=24000),
  last_shot jsonb check (last_shot is null or pg_column_size(last_shot)<=2000),
  last_by uuid references public.users_profiles(id),
  turn smallint not null check (turn in (0,1)),
  winner smallint check (winner in (0,1)),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (pair_id,seat0) references public.pair_members(pair_id,profile_id),
  foreign key (pair_id,seat1) references public.pair_members(pair_id,profile_id)
);
create unique index if not exists pool_games_one_open on public.pool_games(pair_id) where finished_at is null;
alter table public.pool_games enable row level security;
drop policy if exists pool_games_pair_read on public.pool_games;
create policy pool_games_pair_read on public.pool_games for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.pool_games from public, anon, authenticated;
grant select on public.pool_games to authenticated;

create or replace function app_private.pool_state_ok(p jsonb) returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(p)='object' and jsonb_typeof(p->'balls')='array' and jsonb_array_length(p->'balls') between 1 and 16
    and (p->>'turn') in ('0','1') and coalesce(p->>'winner','0') in ('0','1')
$$;
revoke all on function app_private.pool_state_ok(jsonb) from public, anon, authenticated;

-- a new game (you break, seat 0); the same id again returns it; refused while another game is open
create or replace function public.pool_turn_start(p_id uuid,p_state jsonb)
returns public.pool_games language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_peer uuid; v_row public.pool_games;
begin
  select * into v_row from public.pool_games where id=p_id and pair_id=v_pair;
  if found then return v_row; end if;
  if not app_private.pool_state_ok(p_state) or (p_state->>'turn')<>'0' or p_state->>'winner' is not null then raise exception 'Invalid table' using errcode='22023'; end if;
  if exists(select 1 from public.pool_games where pair_id=v_pair and finished_at is null) then raise exception 'A game is already open' using errcode='23505'; end if;
  select profile_id into v_peer from public.pair_members where pair_id=v_pair and profile_id<>v_me;
  if v_peer is null then raise exception 'Partner unavailable' using errcode='42501'; end if;
  insert into public.pool_games(id,pair_id,seat0,seat1,state,turn) values(p_id,v_pair,v_me,v_peer,p_state,0) returning * into v_row;
  perform app_private.signal(true);
  return v_row;
end $$;

-- your shot: only on your turn and on the table you saw (version); the partner is told (p_notify_id for the push)
create or replace function public.pool_turn_shot(p_id uuid,p_expected_version bigint,p_shot jsonb,p_state jsonb,p_notify_id uuid)
returns public.pool_games language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.pool_games; v_seat smallint;
begin
  select * into v_row from public.pool_games where id=p_id and pair_id=app_private.my_pair() for update;
  if not found then raise exception 'Game unavailable' using errcode='42501'; end if;
  if v_row.version=p_expected_version+1 and v_row.last_by=v_me and v_row.last_shot=p_shot then return v_row; end if; -- a retry
  if v_row.finished_at is not null then raise exception 'Game over' using errcode='22023'; end if;
  if v_row.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  v_seat:=case when v_me=v_row.seat0 then 0 when v_me=v_row.seat1 then 1 end;
  if v_seat is null or v_seat<>v_row.turn then raise exception 'Not your turn' using errcode='42501'; end if;
  if not app_private.pool_state_ok(p_state) or jsonb_typeof(p_shot)<>'object' or pg_column_size(p_shot)>2000 then raise exception 'Invalid shot' using errcode='22023'; end if;
  update public.pool_games set before_state=state,state=p_state,last_shot=p_shot,last_by=v_me,turn=(p_state->>'turn')::smallint,
    winner=(p_state->>'winner')::smallint,finished_at=case when p_state->>'winner' is not null then clock_timestamp() end,
    version=version+1,updated_at=clock_timestamp() where id=p_id returning * into v_row;
  if p_notify_id is not null and (v_row.turn<>v_seat or v_row.winner is not null) then perform app_private.notify_partner(p_notify_id,'game_turn',p_id); end if;
  perform app_private.signal(true);
  return v_row;
end $$;

-- leave a game (it ends without a winner), so a new one can start
create or replace function public.pool_turn_leave(p_id uuid)
returns public.pool_games language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.pool_games;
begin
  update public.pool_games set finished_at=coalesce(finished_at,clock_timestamp()),version=version+1,updated_at=clock_timestamp()
  where id=p_id and pair_id=app_private.my_pair() and v_me in (seat0,seat1) returning * into v_row;
  if not found then raise exception 'Game unavailable' using errcode='42501'; end if;
  perform app_private.signal(true);
  return v_row;
end $$;
revoke all on function public.pool_turn_start(uuid,jsonb), public.pool_turn_shot(uuid,bigint,jsonb,jsonb,uuid), public.pool_turn_leave(uuid) from public, anon, authenticated;
grant execute on function public.pool_turn_start(uuid,jsonb), public.pool_turn_shot(uuid,bigint,jsonb,jsonb,uuid), public.pool_turn_leave(uuid) to authenticated;
notify pgrst,'reload schema';

do $verify$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='pool_games' and c.relrowsecurity) then raise exception '021: pool_games needs RLS'; end if;
  if has_table_privilege('authenticated','public.pool_games','INSERT') or has_table_privilege('authenticated','public.pool_games','UPDATE') then raise exception '021: unsafe table grant'; end if;
  if has_function_privilege('anon','public.pool_turn_shot(uuid,bigint,jsonb,jsonb,uuid)','EXECUTE') then raise exception '021: anon can shoot'; end if;
end $verify$;
commit;
