-- 020: what is inside the boxes (mockup QBox), the stamp album's big box (QPostcards), the shelf's legendary chest
-- (LearnShelf) and the hockey invite (GameStarts4).
-- * Every prize keeps its points (5 / 15 / 40) and now also holds an item, drawn here on the server:
--   small: a seed packet (one more seed), a sticker for the chat, or just the points;
--   big: a heart button or a theme you don't have yet (a free shop item);
--   legendary: a golden jasmine (a seed for a seventh flower) or a mascot friend you don't have yet.
--   When everything of a tier is already yours, the prize is the points alone.
-- * reward_boxes: boxes that don't come from a bottle: a full row of 5 stamps (album, a big box) and a full
--   country shelf of discoveries (chest, legendary). Each is opened once per person, the server checks it is earned.
-- * The golden jasmine can be planted only by someone who won one (one golden flower per golden prize).
-- * invite_game: "Play live" sends your partner a game_invite (the bell and a push), at most one a minute.
-- Apply after 019, as postgres, in this one transaction. Additive: one column, one table, functions.
begin;

alter table public.bottle_prizes add column if not exists item text check (item is null or item ~ '^[a-z]+(\.[a-z]{2,20})?$');

create table if not exists public.reward_boxes (
  owner_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  source text not null check (source ~ '^(album:[1-9][0-9]{0,2}|chest:(tn|ve))$'),
  tier text not null check (tier in ('small','big','legendary')),
  points integer not null check (points in (5,15,40)),
  item text check (item is null or item ~ '^[a-z]+(\.[a-z]{2,20})?$'),
  created_at timestamptz not null default now(),
  primary key (owner_id,source),
  foreign key (pair_id,owner_id) references public.pair_members(pair_id,profile_id)
);
alter table public.reward_boxes enable row level security;
drop policy if exists reward_boxes_pair_read on public.reward_boxes;
create policy reward_boxes_pair_read on public.reward_boxes for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.reward_boxes from public, anon, authenticated;
grant select on public.reward_boxes to authenticated;

-- the golden jasmine: a seventh flower type, only from a legendary prize
alter table public.flowers drop constraint if exists flowers_flower_type_check;
alter table public.flowers add constraint flowers_flower_type_check
  check (flower_type in ('rose','marigold','jasmine','lavender','lilium','orchid','golden'));

-- Draw the item of a prize for one person (shop items are given at once, free). Returns the item id.
create or replace function app_private.draw_item(p_me uuid,p_pair uuid,p_tier text) returns text
language plpgsql volatile security definer set search_path='' as $$
declare v_pick text; v_r double precision:=random();
  v_owned text[]:=array(select item from public.shop_purchases where profile_id=p_me);
begin
  if p_tier='small' then
    return case when v_r<.4 then 'seed' when v_r<.7 then 'sticker' else 'points' end;
  elsif p_tier='big' then
    select x into v_pick from unnest(array['heart.kiss','heart.harissa','heart.flower','heart.jasmine','heart.star','heart.rose','heart.paw','heart.arepa','heart.moon',
      'theme.sidi','theme.salto','theme.blaugrana']) x where x<>all(v_owned) order by random() limit 1;
  else
    if v_r<.5 then return 'golden'; end if;
    select x into v_pick from unnest(array['mascot.bird','mascot.camel','mascot.chef']) x where x<>all(v_owned) order by random() limit 1;
    if v_pick is null then return 'golden'; end if;
  end if;
  if v_pick is null then return 'points'; end if;
  insert into public.shop_purchases(id,pair_id,profile_id,item,cost) values(gen_random_uuid(),p_pair,p_me,v_pick,0) on conflict (profile_id,item) do nothing;
  return v_pick;
end $$;
revoke all on function app_private.draw_item(uuid,uuid,text) from public, anon, authenticated;

-- open your shell in a bottle (as in 019, now with its item); old prizes keep their points and no item
create or replace function public.open_bottle_prize(p_round_id uuid)
returns public.bottle_prizes language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.bottle_prizes; v_r double precision; v_tier text;
begin
  select * into v_row from public.bottle_prizes where round_id=p_round_id and owner_id=v_me;
  if found then return v_row; end if;
  if not exists(select 1 from public.question_rounds where id=p_round_id and pair_id=v_pair and revealed_at is not null) then
    raise exception 'Bottle not opened yet' using errcode='42501'; end if;
  if not app_private.bottle_has_shell(p_round_id) then raise exception 'No shell in this bottle' using errcode='22023'; end if;
  v_r:=random();v_tier:=case when v_r<.70 then 'small' when v_r<.95 then 'big' else 'legendary' end;
  insert into public.bottle_prizes(round_id,owner_id,pair_id,tier,points,item)
  values(p_round_id,v_me,v_pair,v_tier,case v_tier when 'small' then 5 when 'big' then 15 else 40 end,app_private.draw_item(v_me,v_pair,v_tier))
  on conflict (round_id,owner_id) do nothing;
  select * into v_row from public.bottle_prizes where round_id=p_round_id and owner_id=v_me;
  perform app_private.signal(true);
  return v_row;
end $$;
revoke all on function public.open_bottle_prize(uuid) from public, anon, authenticated;
grant execute on function public.open_bottle_prize(uuid) to authenticated;

create or replace function app_private.open_reward(p_me uuid,p_pair uuid,p_source text,p_tier text) returns public.reward_boxes
language plpgsql security definer set search_path='' as $$
declare v_row public.reward_boxes;
begin
  select * into v_row from public.reward_boxes where owner_id=p_me and source=p_source;
  if found then return v_row; end if;
  insert into public.reward_boxes(owner_id,pair_id,source,tier,points,item)
  values(p_me,p_pair,p_source,p_tier,case p_tier when 'small' then 5 when 'big' then 15 else 40 end,app_private.draw_item(p_me,p_pair,p_tier))
  on conflict (owner_id,source) do nothing;
  select * into v_row from public.reward_boxes where owner_id=p_me and source=p_source;
  perform app_private.signal(true);
  return v_row;
end $$;
revoke all on function app_private.open_reward(uuid,uuid,text,text) from public, anon, authenticated;

-- the stamp album: one stamp per bottle opened in the pair; row N is full at 5*N stamps and holds a big box
create or replace function public.open_album_box(p_row integer)
returns public.reward_boxes language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair();
begin
  if p_row is null or p_row<1 or p_row>999 then raise exception 'Row 1 to 999' using errcode='22023'; end if;
  if (select count(*) from public.question_rounds where pair_id=v_pair and revealed_at is not null)<p_row*5 then
    raise exception 'This row is not full yet' using errcode='22023'; end if;
  return app_private.open_reward(v_me,v_pair,'album:'||p_row,'big');
end $$;
revoke all on function public.open_album_box(integer) from public, anon, authenticated;
grant execute on function public.open_album_box(integer) to authenticated;

-- the shelf: all nine things of a country found in the garden (garden_discoveries, 015) open its legendary chest
create or replace function public.claim_shelf_chest(p_country text)
returns public.reward_boxes language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_spots text[];
begin
  v_spots:=case p_country
    when 'tn' then array['harissa','door','jasmine','cage','palm','carthage','camel','couscous','mosaic']
    when 've' then array['araguaney','turpial','hammock','cuatro','arepas','angel','chiguire','catatumbo','orchid'] end;
  if v_spots is null then raise exception 'Unknown shelf' using errcode='22023'; end if;
  if (select count(distinct spot) from public.garden_discoveries where profile_id=v_me and spot=any(v_spots))<cardinality(v_spots) then
    raise exception 'This shelf is not full yet' using errcode='22023'; end if;
  return app_private.open_reward(v_me,v_pair,'chest:'||p_country,'legendary');
end $$;
revoke all on function public.claim_shelf_chest(text) from public, anon, authenticated;
grant execute on function public.claim_shelf_chest(text) to authenticated;

-- planting (as in 001) with one more rule: a golden jasmine needs a golden prize not planted yet
create or replace function public.plant_flower(p_id uuid,p_flower_type text)
returns public.flowers language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.flowers;
begin
 select * into v_row from public.flowers where id=p_id;
 if found then
   if v_row.planted_by<>v_me or v_row.flower_type is distinct from p_flower_type or v_row.deleted_at is not null then
     raise exception 'Flower ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 if (select count(*) from public.flowers where planted_by=v_me and deleted_at is null)>=24
    or (select count(*) from public.flowers where pair_id=app_private.my_pair())>=10000 then
   raise exception 'Garden quota' using errcode='54000'; end if;
 if p_flower_type='golden' and
    (select count(*) from public.flowers where planted_by=v_me and flower_type='golden')
    >=(select count(*) from public.bottle_prizes where owner_id=v_me and item='golden')+(select count(*) from public.reward_boxes where owner_id=v_me and item='golden') then
   raise exception 'Win a golden jasmine first' using errcode='42501'; end if;
 insert into public.flowers(id,pair_id,planted_by,flower_type)
 values(p_id,app_private.my_pair(),v_me,p_flower_type) returning * into v_row;
 perform app_private.signal(true); return v_row;
end $$;

-- "Play live": a hockey (or pool) invite for your partner, at most one a minute
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message','dedication','song_added','game_invite','game_turn','game_result','teach_card'));
create or replace function public.invite_game(p_id uuid)
returns public.notifications language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_row public.notifications;
begin
  select * into v_row from public.notifications where id=p_id and sender_id=v_me;
  if found then return v_row; end if;
  if exists(select 1 from public.notifications where sender_id=v_me and kind='game_invite' and created_at>clock_timestamp()-interval '1 minute') then
    raise exception 'One invite a minute' using errcode='54000'; end if;
  v_row:=app_private.notify_partner(p_id,'game_invite',null);
  perform app_private.signal(true);
  return v_row;
end $$;
revoke all on function public.invite_game(uuid) from public, anon, authenticated;
grant execute on function public.invite_game(uuid) to authenticated;

-- points: everything 019 counted, plus the reward boxes
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
    + coalesce((select sum(points) from public.reward_boxes where owner_id=p_profile),0)
    + coalesce((select sum(case
         when a_score<>b_score then case when (a_score>b_score and a_id=p_profile::text) or (b_score>a_score and b_id=p_profile::text) then 2 else 0 end
         when a_ms is null or b_ms is null or a_ms=b_ms then 1
         when (a_ms<b_ms and a_id=p_profile::text) or (b_ms<a_ms and b_id=p_profile::text) then 2 else 0 end)
       from duels where p_profile::text in (a_id,b_id)),0)
  )::integer
$$;
revoke all on function app_private.points_earned(uuid) from public, anon, authenticated;

notify pgrst,'reload schema';

do $verify$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='reward_boxes' and c.relrowsecurity) then raise exception '020: reward_boxes needs RLS'; end if;
  if has_table_privilege('authenticated','public.reward_boxes','INSERT') then raise exception '020: unsafe table grant'; end if;
  if has_function_privilege('anon','public.open_album_box(integer)','EXECUTE') or has_function_privilege('anon','public.claim_shelf_chest(text)','EXECUTE')
     or has_function_privilege('anon','public.invite_game(uuid)','EXECUTE') or has_function_privilege('authenticated','app_private.draw_item(uuid,uuid,text)','EXECUTE') then
    raise exception '020: unsafe function grant'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='bottle_prizes' and column_name='item') then raise exception '020: item column'; end if;
end $verify$;
commit;
