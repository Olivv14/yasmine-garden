-- 018: bring Spotify's sign-in back to the Home Screen app. On iPhone, a Home Screen app opens Spotify's sign-in in a
-- separate in-app browser, which has its own storage: it lands on Between us with the one-time code but without the
-- PKCE verifier (that stays inside the Home Screen app). That page leaves the code here under its random "state";
-- the Home Screen app, which knows the state, takes it once and finishes the exchange with its verifier.
-- The code alone is useless (PKCE needs the verifier), lives at most 10 minutes and is read once.
-- Apply as postgres, in this one transaction. Additive: one table (no direct access) and two functions.
begin;
create table if not exists app_private.spotify_handoffs (
  state text primary key check (state ~ '^[A-Za-z0-9_-]{16,64}$'),
  code text not null check (char_length(code) between 1 and 1024),
  created_at timestamptz not null default now()
);
revoke all on app_private.spotify_handoffs from public, anon, authenticated;

create or replace function public.put_spotify_code(p_state text,p_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from app_private.spotify_handoffs where created_at<now()-interval '10 minutes';
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{16,64}$' or p_code is null or char_length(p_code) not between 1 and 1024 then
    raise exception 'Bad handoff' using errcode='22023'; end if;
  if (select count(*) from app_private.spotify_handoffs)>=50 then raise exception 'Busy' using errcode='54000'; end if;
  insert into app_private.spotify_handoffs(state,code) values(p_state,p_code) on conflict (state) do nothing;
end $$;

create or replace function public.take_spotify_code(p_state text)
returns text language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
  perform app_private.begin_write();
  delete from app_private.spotify_handoffs where state=p_state and created_at>now()-interval '10 minutes' returning code into v_code;
  return v_code;
end $$;

revoke all on function public.put_spotify_code(text,text) from public, anon, authenticated;
revoke all on function public.take_spotify_code(text) from public, anon, authenticated;
grant execute on function public.put_spotify_code(text,text) to anon, authenticated;
grant execute on function public.take_spotify_code(text) to authenticated;

do $$ begin
  if to_regclass('app_private.spotify_handoffs') is null then raise exception '018 verify: table missing'; end if;
  if has_table_privilege('anon','app_private.spotify_handoffs','select') then raise exception '018 verify: table readable'; end if;
  if has_function_privilege('anon','public.take_spotify_code(text)','execute') then raise exception '018 verify: anon can take'; end if;
end $$;
commit;
