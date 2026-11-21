-- LOCAL CHECK for 020 (rolled back): prizes hold items, shop items are given free, no duplicates while new ones remain,
-- the album box and the shelf chest open only when earned and only once, the golden jasmine needs a golden prize,
-- one invite a minute, and anon can do none of it.
begin;
create temp table who as select u.id me,u.auth_user_id uid,m.pair_id pair from public.users_profiles u join public.pair_members m on m.profile_id=u.id
  where u.auth_user_id='11111111-1111-4111-8111-111111111111';
grant select on who to authenticated;
delete from public.reward_boxes; delete from public.bottle_prizes; delete from public.round_answers; delete from public.question_rounds;
delete from public.shop_purchases where profile_id=(select me from who);
insert into public.question_rounds(id,pair_id,question_id,started_by,created_at,revealed_at)
select ('00000000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,(select pair from who),'q1',(select me from who),now()-(20-n)*interval '1 hour',now()-(20-n)*interval '1 hour'
from generate_series(1,7) n;

-- 1. the draw itself, many times (as postgres): every tier gives a known item; big ones become free shop items, never twice
do $$ declare i text; n int:=0; begin
  for k in 1..300 loop i:=app_private.draw_item((select me from who),(select pair from who),'small');
    if i not in ('seed','sticker','points') then raise exception 'FAIL small item %',i; end if; end loop;
  for k in 1..14 loop i:=app_private.draw_item((select me from who),(select pair from who),'big');
    if i<>'points' and i !~ '^(heart|theme)\.' then raise exception 'FAIL big item %',i; end if; end loop;
  select count(*) into n from public.shop_purchases where profile_id=(select me from who) and item ~ '^(heart|theme)\.' and cost=0;
  if n<>12 then raise exception 'FAIL expected the 12 big items, got %',n; end if;
  if app_private.draw_item((select me from who),(select pair from who),'big')<>'points' then raise exception 'FAIL all owned should give points'; end if;
end $$;

select set_config('request.jwt.claims',json_build_object('sub',(select uid from who),'role','authenticated')::text,true);
set local role authenticated;
-- 2. a bottle prize now has an item and stays the same when opened again
do $$ declare a public.bottle_prizes; b public.bottle_prizes; begin
  a:=public.open_bottle_prize('00000000-0000-4000-8000-000000000003');
  if a.item is null then raise exception 'FAIL prize without item'; end if;
  b:=public.open_bottle_prize('00000000-0000-4000-8000-000000000003');
  if b.item is distinct from a.item or b.points<>a.points then raise exception 'FAIL prize changed'; end if; end $$;
-- 3. album: 7 bottles opened = row 1 full, row 2 not; row 1 opens once
do $$ declare a public.reward_boxes; b public.reward_boxes; begin
  a:=public.open_album_box(1); if a.tier<>'big' or a.points<>15 then raise exception 'FAIL album tier'; end if;
  b:=public.open_album_box(1); if b.item is distinct from a.item then raise exception 'FAIL album reopened differently'; end if;
  begin perform public.open_album_box(2); raise exception 'FAIL row 2 opened'; exception when sqlstate '22023' then null; end; end $$;
-- 4. chest: not before the shelf is full
do $$ begin begin perform public.claim_shelf_chest('tn'); raise exception 'FAIL chest opened early'; exception when sqlstate '22023' then null; end;
  begin perform public.claim_shelf_chest('xx'); raise exception 'FAIL unknown shelf'; exception when sqlstate '22023' then null; end; end $$;
reset role;
insert into public.garden_discoveries(profile_id,pair_id,spot) select (select me from who),(select pair from who),s
  from unnest(array['harissa','door','jasmine','cage','palm','carthage','camel','couscous','mosaic']) s on conflict do nothing;
set local role authenticated;
do $$ declare c public.reward_boxes; begin c:=public.claim_shelf_chest('tn');
  if c.tier<>'legendary' or c.points<>40 or c.item is null then raise exception 'FAIL chest %',c; end if; end $$;
-- 5. golden jasmine: refused without a golden prize
do $$ begin
  if exists(select 1 from public.reward_boxes where item='golden') or exists(select 1 from public.bottle_prizes where item='golden') then return; end if;
  begin perform public.plant_flower(gen_random_uuid(),'golden'); raise exception 'FAIL golden planted without prize'; exception when insufficient_privilege then null; end; end $$;
-- 6. invites: one a minute
do $$ begin perform public.invite_game(gen_random_uuid());
  begin perform public.invite_game(gen_random_uuid()); raise exception 'FAIL second invite'; exception when sqlstate '54000' then null; end; end $$;
reset role;
-- with a golden prize, one golden flower can be planted
update public.reward_boxes set item='golden' where source='chest:tn';
set local role authenticated;
do $$ begin perform public.plant_flower(gen_random_uuid(),'golden');
  begin perform public.plant_flower(gen_random_uuid(),'golden'); raise exception 'FAIL second golden'; exception when insufficient_privilege then null; end; end $$;
reset role;
-- 7. points count the reward boxes
do $$ declare p int; begin p:=app_private.points_earned((select me from who));
  if p < (select coalesce(sum(points),0) from public.reward_boxes)+(select coalesce(sum(points),0) from public.bottle_prizes) then raise exception 'FAIL points %',p; end if; end $$;
set local role anon;
do $$ begin begin perform public.open_album_box(1); raise exception 'FAIL anon album'; exception when insufficient_privilege then null; end;
  begin perform public.invite_game(gen_random_uuid()); raise exception 'FAIL anon invite'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'box items check: ok';
rollback;
