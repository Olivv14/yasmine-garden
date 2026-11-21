-- LOCAL CHECK for 021 (rolled back): one open game per pair, shots only on your turn and on the current table,
-- a retry of the same shot is harmless, the partner is told, leaving ends the game, anon can do nothing.
begin;
create temp table who as select u.id me,u.auth_user_id uid,m.pair_id pair,(select profile_id from public.pair_members x where x.pair_id=m.pair_id and x.profile_id<>u.id) peer,
  (select auth_user_id from public.users_profiles where id=(select profile_id from public.pair_members x where x.pair_id=m.pair_id and x.profile_id<>u.id)) peer_uid
  from public.users_profiles u join public.pair_members m on m.profile_id=u.id where u.auth_user_id='11111111-1111-4111-8111-111111111111';
grant select on who to authenticated;
delete from public.pool_games;
select set_config('request.jwt.claims',json_build_object('sub',(select uid from who),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare g public.pool_games; begin
  g:=public.pool_turn_start('a0000000-0000-4000-8000-000000000001','{"balls":[{"n":0}],"turn":0,"winner":null}');
  if g.turn<>0 or g.seat0<>(select me from who) then raise exception 'FAIL start %',g; end if;
  begin perform public.pool_turn_start('a0000000-0000-4000-8000-000000000002','{"balls":[{"n":0}],"turn":0,"winner":null}'); raise exception 'FAIL second open game'; exception when unique_violation then null; end;
  -- my shot, the turn passes to the partner
  g:=public.pool_turn_shot('a0000000-0000-4000-8000-000000000001',1,'{"power":0.5}','{"balls":[{"n":0}],"turn":1,"winner":null}','b0000000-0000-4000-8000-000000000001');
  if g.turn<>1 or g.version<>2 or g.before_state is null then raise exception 'FAIL shot %',g; end if;
  g:=public.pool_turn_shot('a0000000-0000-4000-8000-000000000001',1,'{"power":0.5}','{"balls":[{"n":0}],"turn":1,"winner":null}','b0000000-0000-4000-8000-000000000001');
  if g.version<>2 then raise exception 'FAIL retry changed the game'; end if;
  begin perform public.pool_turn_shot('a0000000-0000-4000-8000-000000000001',2,'{"power":0.4}','{"balls":[{"n":0}],"turn":0,"winner":null}',null); raise exception 'FAIL shot out of turn'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin if not exists(select 1 from public.notifications where id='b0000000-0000-4000-8000-000000000001' and kind='game_turn' and ref_id='a0000000-0000-4000-8000-000000000001') then raise exception 'FAIL partner not told'; end if; end $$;
select set_config('request.jwt.claims',json_build_object('sub',(select peer_uid from who),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare g public.pool_games; begin
  begin perform public.pool_turn_shot('a0000000-0000-4000-8000-000000000001',1,'{"power":0.4}','{"balls":[{"n":0}],"turn":0,"winner":null}',null); raise exception 'FAIL old table'; exception when sqlstate '40001' then null; end;
  g:=public.pool_turn_shot('a0000000-0000-4000-8000-000000000001',2,'{"power":0.4}','{"balls":[{"n":0}],"turn":1,"winner":1}',null);
  if g.finished_at is null or g.winner<>1 then raise exception 'FAIL win %',g; end if;
  g:=public.pool_turn_start('a0000000-0000-4000-8000-000000000003','{"balls":[{"n":0}],"turn":0,"winner":null}');
  g:=public.pool_turn_leave('a0000000-0000-4000-8000-000000000003'); if g.finished_at is null then raise exception 'FAIL leave'; end if;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.pool_turn_start(gen_random_uuid(),'{"balls":[{"n":0}],"turn":0}'); raise exception 'FAIL anon'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'pool turns check: ok';
rollback;
