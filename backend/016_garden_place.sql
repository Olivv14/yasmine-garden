-- 016: Plant where you drop the seed. Flowers may now remember a spot on the island (x, z in garden units, the
-- island is about 7 across from its centre). Both phones then show the flower in that spot; flowers without a spot
-- keep the place their id gives them, as before.
-- Apply AFTER 015, as postgres, in this one transaction. Additive: two nullable columns and one new function.
begin;
alter table public.flowers add column if not exists px real check (px between -8 and 8);
alter table public.flowers add column if not exists pz real check (pz between -8 and 8);

-- Plant a flower (the same rules as plant_flower) at a spot on your side of the island.
create or replace function public.plant_flower_at(p_id uuid,p_flower_type text,p_x real,p_z real)
returns public.flowers language plpgsql security definer set search_path='' as $$
declare v_row public.flowers;
begin
  if p_x is null or p_z is null or sqrt(p_x*p_x+p_z*p_z)>7 then raise exception 'Somewhere on the island' using errcode='22023'; end if;
  v_row:=public.plant_flower(p_id,p_flower_type);
  if v_row.px is null then
    update public.flowers set px=p_x,pz=p_z where id=p_id and planted_by=v_row.planted_by returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public.plant_flower_at(uuid,text,real,real) from public, anon, authenticated, service_role;
grant execute on function public.plant_flower_at(uuid,text,real,real) to authenticated;

do $verify$
begin
  if has_function_privilege('anon','public.plant_flower_at(uuid,text,real,real)','EXECUTE') then raise exception '016: unsafe grant'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='plant_flower_at' and p.prosecdef
    and 'search_path=""'=any(coalesce(p.proconfig,array[]::text[]))) then raise exception '016: plant_flower_at needs security definer'; end if;
end $verify$;
commit;
