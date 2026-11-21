-- LOCAL CHECK for 019 (rolled back): every third opened bottle holds a shell; a prize is drawn once and counts as points.
begin;
delete from public.bottle_prizes; delete from public.round_answers; delete from public.question_rounds;
insert into public.question_rounds(id,pair_id,question_id,started_by,created_at,revealed_at)
select ('00000000-0000-4000-8000-00000000000'||n)::uuid,(select m.pair_id from public.pair_members m join public.users_profiles u on u.id=m.profile_id where u.auth_user_id='11111111-1111-4111-8111-111111111111'),'q1',(select id from public.users_profiles where auth_user_id='11111111-1111-4111-8111-111111111111'),now(),now()+(n||' minutes')::interval
from generate_series(1,3) n;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
create temp table before_pts as select app_private.points_earned((select id from public.users_profiles where auth_user_id='11111111-1111-4111-8111-111111111111')) p;
grant select on before_pts to authenticated;
set local role authenticated;
do $$ begin begin perform public.open_bottle_prize('00000000-0000-4000-8000-000000000001'); raise exception 'FAIL bottle 1 had a shell'; exception when sqlstate '22023' then null; end; end $$;
do $$ declare a public.bottle_prizes; b public.bottle_prizes; begin
  a:=public.open_bottle_prize('00000000-0000-4000-8000-000000000003');
  if a.tier not in ('small','big','legendary') then raise exception 'FAIL tier'; end if;
  b:=public.open_bottle_prize('00000000-0000-4000-8000-000000000003');
  if b.tier<>a.tier or b.points<>a.points then raise exception 'FAIL prize changed on reopen'; end if; end $$;
reset role;
do $$ declare now_p int; was int; got int; begin
  select p into was from before_pts;
  now_p:=app_private.points_earned((select id from public.users_profiles where auth_user_id='11111111-1111-4111-8111-111111111111'));
  select points into got from public.bottle_prizes where round_id='00000000-0000-4000-8000-000000000003';
  if now_p<>was+got then raise exception 'FAIL points % -> % (prize %)',was,now_p,got; end if; end $$;
set local role anon;
do $$ begin begin perform public.open_bottle_prize('00000000-0000-4000-8000-000000000003'); raise exception 'FAIL anon opened'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'bottle prizes check: ok';
rollback;
