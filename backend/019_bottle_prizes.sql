-- 019: prizes in the bottles (Questions as messages in a bottle). Every third opened bottle (the 3rd, 6th, 9th...
-- round revealed in the pair) holds a shell for each of you. Opening it draws a prize here on the server:
-- small (5 points, most of the time), big (15) or legendary (40, rare). The points count everywhere points count.
-- Apply after 017/018, as postgres, in this one transaction. Additive: one table, one function, points_earned + prizes.
begin;
create table if not exists public.bottle_prizes (
  round_id uuid not null references public.question_rounds(id),
  owner_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  tier text not null check (tier in ('small','big','legendary')),
  points integer not null check (points in (5,15,40)),
  created_at timestamptz not null default now(),
  primary key (round_id,owner_id),
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id)
);
alter table public.bottle_prizes enable row level security;
drop policy if exists bottle_prizes_pair_read on public.bottle_prizes;
create policy bottle_prizes_pair_read on public.bottle_prizes for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.bottle_prizes from public, anon, authenticated;
grant select on public.bottle_prizes to authenticated;

-- which opened bottles hold a shell: every third round revealed in the pair (in the order they opened)
create or replace function app_private.bottle_has_shell(p_round_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select n % 3 = 0 from (
    select r.id,row_number() over (order by r.revealed_at,r.id) n from public.question_rounds r
    where r.pair_id=(select pair_id from public.question_rounds where id=p_round_id) and r.revealed_at is not null) x where x.id=p_round_id),false)
$$;
revoke all on function app_private.bottle_has_shell(uuid) from public, anon, authenticated;

-- open your shell in that bottle: the prize is drawn once and kept (opening again shows the same prize)
create or replace function public.open_bottle_prize(p_round_id uuid)
returns public.bottle_prizes language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.bottle_prizes; v_r double precision;
begin
  select * into v_row from public.bottle_prizes where round_id=p_round_id and owner_id=v_me;
  if found then return v_row; end if;
  if not exists(select 1 from public.question_rounds where id=p_round_id and pair_id=v_pair and revealed_at is not null) then
    raise exception 'Bottle not opened yet' using errcode='42501'; end if;
  if not app_private.bottle_has_shell(p_round_id) then raise exception 'No shell in this bottle' using errcode='22023'; end if;
  v_r:=random();
  insert into public.bottle_prizes(round_id,owner_id,pair_id,tier,points)
  values(p_round_id,v_me,v_pair,case when v_r<.70 then 'small' when v_r<.95 then 'big' else 'legendary' end,case when v_r<.70 then 5 when v_r<.95 then 15 else 40 end)
  on conflict (round_id,owner_id) do nothing;
  select * into v_row from public.bottle_prizes where round_id=p_round_id and owner_id=v_me;
  perform app_private.signal(true);
  return v_row;
end $$;
revoke all on function public.open_bottle_prize(uuid) from public, anon, authenticated;
grant execute on function public.open_bottle_prize(uuid) to authenticated;

create or replace function app_private.points_earned(p_profile uuid) returns integer
language sql stable security definer set search_path='' as $$
  with pair as (select pair_id from public.pair_members where profile_id=p_profile limit 1),
  ev as (select e.* from public.game_events e where e.pair_id=(select pair_id from pair)),
  duels as (
    select r.id,
      max(a.profile_id::text) filter (where a.rn=1) as a_id, max(a.score) filter (where a.rn=1) as a_score, max(a.ms) filter (where a.rn=1) as a_ms,
      max(a.profile_id::text) filter (where a.rn=2) as b_id, max(a.score) filter (where a.rn=2) as b_score, max(a.ms) filter (where a.rn=2) as b_ms
    from public.play_rounds r
    join (select x.*,row_number() over (partition by x.round_id order by x.created_at,x.id) rn from public.play_answers x) a on a.round_id=r.id
    where r.game='word_duel' and r.pair_id=(select pair_id from pair)
    group by r.id having count(*)=2)
  select (
    (select count(*) from ev where game='truth_dare' and kind<>'finish' and profile_id=p_profile)
    + coalesce((select sum(case when profile_id=p_profile then 1+case when score_me>score_partner then 2 else 0 end
                               else 1+case when score_partner>score_me then 2 else 0 end end)
                from ev where game in ('hockey','pool') and kind='finish'),0)
    + coalesce((select sum(case when card_id='lv1' then case when score_me>score_partner then 1 else 0 end
                                when card_id='lv2' then case when score_me>score_partner then 3 else 0 end
                                when card_id='lv3' then case when score_me>score_partner then 6 else 0 end
                                else 1+case when score_me>score_partner then 2 else 0 end end)
                from ev where game in ('hockey_bot','pool_bot') and kind='finish' and profile_id=p_profile),0)
    + coalesce((select sum(score_partner) from ev where game='piano' and kind='finish' and profile_id=p_profile),0)
    + coalesce((select sum(reviews/10) from public.learn_days where profile_id=p_profile),0)
    + coalesce((select sum(score) from public.play_answers where profile_id=p_profile and role in ('player','guess')),0)
    + (select count(*) from public.play_answers where profile_id=p_profile and role='self')
    + coalesce((select sum(points) from public.bottle_prizes where owner_id=p_profile),0)
    + coalesce((select sum(case
         when a_score<>b_score then case when (a_score>b_score and a_id=p_profile::text) or (b_score>a_score and b_id=p_profile::text) then 2 else 0 end
         when a_ms is null or b_ms is null or a_ms=b_ms then 1
         when (a_ms<b_ms and a_id=p_profile::text) or (b_ms<a_ms and b_id=p_profile::text) then 2 else 0 end)
       from duels where p_profile::text in (a_id,b_id)),0)
  )::integer
$$;
revoke all on function app_private.points_earned(uuid) from public, anon, authenticated;

do $verify$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='bottle_prizes' and c.relrowsecurity) then raise exception '019: bottle_prizes needs RLS'; end if;
  if has_table_privilege('authenticated','public.bottle_prizes','INSERT') then raise exception '019: unsafe table grant'; end if;
  if has_function_privilege('anon','public.open_bottle_prize(uuid)','EXECUTE') then raise exception '019: anon can open'; end if;
end $verify$;
commit;
