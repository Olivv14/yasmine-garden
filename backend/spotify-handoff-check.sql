-- LOCAL CHECK for 018 (rolled back): anon can leave a code, cannot take it; a signed-in member takes it once.
begin;
set local role anon;
select public.put_spotify_code('abcdefghijklmnop1234','the-code');
do $$ begin begin perform public.take_spotify_code('abcdefghijklmnop1234'); raise exception 'FAIL anon took'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.put_spotify_code('short','x'); raise exception 'FAIL short state'; exception when sqlstate '22023' then null; end; end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$ declare c text; begin c:=public.take_spotify_code('abcdefghijklmnop1234'); if c is distinct from 'the-code' then raise exception 'FAIL take got %',c; end if;
  c:=public.take_spotify_code('abcdefghijklmnop1234'); if c is not null then raise exception 'FAIL second take'; end if; end $$;
reset role;
select 'spotify handoff check: ok';
rollback;
