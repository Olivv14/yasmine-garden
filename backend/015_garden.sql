-- 015: What each of you discovered in the garden, saved for you (it was only on each phone until now), so it follows
-- you to a new phone and your partner can see how much you found.
-- Apply AFTER 014, as postgres, in this one transaction. Additive: one new table and one new function.
begin;
create table if not exists public.garden_discoveries (
  profile_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  spot text not null check (spot ~ '^[a-z][a-z0-9-]{1,39}$'),
  found_at timestamptz not null default now(),
  primary key (profile_id,spot),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
alter table public.garden_discoveries enable row level security;
drop policy if exists garden_discoveries_pair_read on public.garden_discoveries;
create policy garden_discoveries_pair_read on public.garden_discoveries for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.garden_discoveries from public, anon, authenticated;
grant select on public.garden_discoveries to authenticated;

-- Found something: saved once (finding it again changes nothing).
create or replace function public.discover(p_spot text)
returns public.garden_discoveries language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.garden_discoveries;
begin
  if (select count(*) from public.garden_discoveries where profile_id=v_me)>=200 then raise exception 'Discovery quota' using errcode='54000'; end if;
  insert into public.garden_discoveries(profile_id,pair_id,spot) values(v_me,v_pair,p_spot) on conflict (profile_id,spot) do nothing;
  select * into v_row from public.garden_discoveries where profile_id=v_me and spot=p_spot;
  return v_row;
end $$;
revoke all on function public.discover(text) from public, anon, authenticated, service_role;
grant execute on function public.discover(text) to authenticated;

do $verify$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='garden_discoveries' and c.relrowsecurity) then
    raise exception '015: garden_discoveries needs RLS'; end if;
  if has_table_privilege('authenticated','public.garden_discoveries','INSERT') then raise exception '015: unsafe table grant'; end if;
  if has_function_privilege('anon','public.discover(text)','EXECUTE') then raise exception '015: unsafe function grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='discover'
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then raise exception '015: discover needs security definer'; end if;
end $verify$;
commit;
