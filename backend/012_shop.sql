-- 012: The shop. Spend the points you earn playing on themes, heart buttons and mascots; your partner sees
-- your heart and your mascots. Prices live here; the server counts your points with the same rules as the app
-- (src/games/score.js) and refuses a purchase you cannot afford.
-- Also: games against the toad may carry the level that was played (lv1 easy, lv2 medium, lv3 hard), so
-- beating the Champion can unlock the Djerba sunset theme.
-- Apply AFTER 011, as postgres, in this one transaction. Additive: one check gets wider, two tables and three
-- functions are new; no existing row, column or function is removed.
begin;

-- 1. The toad's level on bot games
alter table public.game_events drop constraint if exists game_events_card_id_check;
alter table public.game_events add constraint game_events_card_id_check check (card_id is null or card_id ~ '^[td][0-9]{2}$' or card_id in ('lv1','lv2','lv3'));
alter table public.game_events drop constraint if exists game_events_shape;
alter table public.game_events add constraint game_events_shape check (
    (game='truth_dare' and kind in ('truth','dare') and card_id is not null and left(card_id,1)=left(kind,1) and score_me is null and score_partner is null)
    or (game='truth_dare' and kind='finish' and card_id is null and response is null and score_me is null and score_partner is null)
    or (game='hockey' and kind='finish' and card_id is null and response is null and score_me is not null and score_partner is not null)
    or (game='hockey_bot' and kind='finish' and (card_id is null or card_id in ('lv1','lv2','lv3')) and response is null and score_me is not null and score_partner is not null)
    or (game='pool' and kind='finish' and card_id is null and response is null
        and score_me in (0,1) and score_partner in (0,1) and score_me+score_partner=1)
    or (game='pool_bot' and kind='finish' and (card_id is null or card_id in ('lv1','lv2','lv3')) and response is null
        and score_me in (0,1) and score_partner in (0,1) and score_me+score_partner=1));

-- 2. Prices (null: not for sale). Price 0 with no purchase row means everyone has it from the start.
create or replace function app_private.shop_price(p_item text) returns integer
language sql immutable set search_path='' as $$
  select case p_item
    when 'heart.classic' then 0 when 'heart.kiss' then 60 when 'heart.harissa' then 90 when 'heart.flower' then 50
    when 'heart.jasmine' then 60 when 'heart.star' then 120 when 'heart.rose' then 70 when 'heart.paw' then 80
    when 'heart.arepa' then 70 when 'heart.moon' then 90
    when 'mascot.emmy' then 0 when 'mascot.bird' then 80 when 'mascot.camel' then 120 when 'mascot.chef' then 400
    when 'theme.dusk' then 0 when 'theme.yasmine' then 0 when 'theme.oliver' then 0 when 'theme.sidi' then 150
    when 'theme.salto' then 150 when 'theme.blaugrana' then 200 when 'theme.djerba' then 0
    else null end
$$;
create or replace function app_private.shop_free(p_item text) returns boolean
language sql immutable set search_path='' as $$
  select p_item in ('heart.classic','mascot.emmy','theme.dusk','theme.yasmine','theme.oliver')
$$;

-- 3. Points, counted like the app: a truth or dare turn 1; hockey or pool 1 each and 2 more for the winner; a win
-- against the toad what its card says (Dreamer 1, Coach 3, Champion 6; games without a level: 1, and 2 more for a win); duel and know-me answers their score, answering about yourself 1; a finished duel
-- 2 more for the winner (or the faster on a tie), 1 each on a perfect tie.
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
    + coalesce((select sum(score) from public.play_answers where profile_id=p_profile and role in ('player','guess')),0)
    + (select count(*) from public.play_answers where profile_id=p_profile and role='self')
    + coalesce((select sum(case
         when a_score<>b_score then case when (a_score>b_score and a_id=p_profile::text) or (b_score>a_score and b_id=p_profile::text) then 2 else 0 end
         when a_ms is null or b_ms is null or a_ms=b_ms then 1
         when (a_ms<b_ms and a_id=p_profile::text) or (b_ms<a_ms and b_id=p_profile::text) then 2 else 0 end)
       from duels where p_profile::text in (a_id,b_id)),0)
  )::integer
$$;

-- 4. What each of you bought, and what each of you has chosen
create table if not exists public.shop_purchases (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  profile_id uuid not null references public.users_profiles(id),
  item text not null check (item ~ '^(heart|mascot|theme)\.[a-z]{2,20}$'),
  cost integer not null check (cost between 0 and 5000),
  created_at timestamptz not null default now(),
  unique (profile_id,item),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create table if not exists public.shop_choices (
  profile_id uuid primary key references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  heart text not null default 'heart.classic' check (heart ~ '^heart\.[a-z]{2,20}$'),
  theme text not null default 'theme.dusk' check (theme ~ '^theme\.[a-z]{2,20}$'),
  mascots text[] not null default array['mascot.emmy'] check (cardinality(mascots)<=2),
  updated_at timestamptz not null default now(),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
alter table public.shop_purchases enable row level security;
alter table public.shop_choices enable row level security;
drop policy if exists shop_purchases_pair_read on public.shop_purchases;
create policy shop_purchases_pair_read on public.shop_purchases for select to authenticated using (pair_id=(select app_private.my_pair()));
drop policy if exists shop_choices_pair_read on public.shop_choices;
create policy shop_choices_pair_read on public.shop_choices for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.shop_purchases, public.shop_choices from public, anon, authenticated;
grant select on public.shop_purchases, public.shop_choices to authenticated;

create or replace function app_private.shop_owns(p_profile uuid,p_item text) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.shop_free(p_item) or exists(select 1 from public.shop_purchases where profile_id=p_profile and item=p_item)
$$;

-- buy: idempotent on the id; one purchase per item; you need the points (Djerba needs a win against the Champion)
create or replace function public.shop_buy(p_id uuid,p_item text)
returns public.shop_purchases language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_price integer:=app_private.shop_price(p_item); v_row public.shop_purchases;
begin
  select * into v_row from public.shop_purchases where id=p_id;
  if found then
    if v_row.profile_id<>v_me or v_row.item<>p_item then raise exception 'Purchase ID conflict' using errcode='23505'; end if;
    return v_row;
  end if;
  if v_price is null then raise exception 'Not for sale' using errcode='22023'; end if;
  if app_private.shop_free(p_item) then raise exception 'Already yours' using errcode='22023'; end if;
  select * into v_row from public.shop_purchases where profile_id=v_me and item=p_item;
  if found then return v_row; end if;
  if p_item='theme.djerba' and not exists(select 1 from public.game_events where profile_id=v_me and game in ('hockey_bot','pool_bot')
      and kind='finish' and card_id='lv3' and score_me>score_partner) then
    raise exception 'Beat the Champion first' using errcode='PT403'; end if;
  perform 1 from public.users_profiles where id=v_me for update;   -- one purchase at a time per person
  if app_private.points_earned(v_me)-coalesce((select sum(cost) from public.shop_purchases where profile_id=v_me),0)<v_price then
    raise exception 'Not enough points' using errcode='PT402'; end if;
  insert into public.shop_purchases(id,pair_id,profile_id,item,cost) values(p_id,v_pair,v_me,p_item,v_price) returning * into v_row;
  perform app_private.signal(true); return v_row;
end $$;

-- choose what you show: one heart, one theme, up to two mascots; only things you own
create or replace function public.shop_choose(p_heart text,p_theme text,p_mascots text[])
returns public.shop_choices language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.shop_choices; m text;
begin
  if p_heart is null or p_theme is null or p_mascots is null or cardinality(p_mascots)>2 then raise exception 'Bad choice' using errcode='22023'; end if;
  if left(p_heart,6)<>'heart.' or left(p_theme,6)<>'theme.' then raise exception 'Bad choice' using errcode='22023'; end if;
  if not app_private.shop_owns(v_me,p_heart) or not app_private.shop_owns(v_me,p_theme) then raise exception 'Not yours' using errcode='PT403'; end if;
  foreach m in array p_mascots loop
    if left(m,7)<>'mascot.' or not app_private.shop_owns(v_me,m) then raise exception 'Not yours' using errcode='PT403'; end if;
  end loop;
  if (select count(distinct x) from unnest(p_mascots) x)<>cardinality(p_mascots) then raise exception 'Bad choice' using errcode='22023'; end if;
  insert into public.shop_choices(profile_id,pair_id,heart,theme,mascots,updated_at) values(v_me,v_pair,p_heart,p_theme,p_mascots,now())
  on conflict (profile_id) do update set heart=excluded.heart,theme=excluded.theme,mascots=excluded.mascots,updated_at=now()
  returning * into v_row;
  perform app_private.signal(true); return v_row;
end $$;
revoke all on function public.shop_buy(uuid,text), public.shop_choose(text,text,text[]) from public, anon, authenticated, service_role;
grant execute on function public.shop_buy(uuid,text), public.shop_choose(text,text,text[]) to authenticated;
revoke all on function app_private.points_earned(uuid), app_private.shop_owns(uuid,text) from public, anon, authenticated;

-- 5. Verification
do $verify$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='shop_purchases' and c.relrowsecurity)
     or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='shop_choices' and c.relrowsecurity) then
    raise exception '012: shop tables need RLS'; end if;
  if has_table_privilege('authenticated','public.shop_purchases','INSERT') or has_table_privilege('authenticated','public.shop_choices','UPDATE')
     or has_table_privilege('authenticated','public.shop_choices','INSERT') then raise exception '012: unsafe table grant'; end if;
  if has_function_privilege('anon','public.shop_buy(uuid,text)','EXECUTE') or has_function_privilege('authenticated','app_private.points_earned(uuid)','EXECUTE') then
    raise exception '012: unsafe function grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where ((n.nspname='public' and p.proname in ('shop_buy','shop_choose')) or (n.nspname='app_private' and p.proname in ('points_earned','shop_owns')))
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
    raise exception '012: functions need security definer with empty search_path'; end if;
end $verify$;
commit;
