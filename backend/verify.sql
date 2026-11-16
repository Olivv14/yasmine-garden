-- READ-ONLY catalog verification. Does not enroll users, write fixtures or touch app data.
-- Run AFTER 001_shared_app.sql as postgres in the dedicated project only.
-- Throws on unsafe catalog state; output success is NOT a live RLS/API integration test.
begin transaction read only;
do $$
declare v_bad integer; v_tables text[]:=array['users_profiles','pairs','pair_members','question_bank','content_items','moods','flowers','question_rounds','round_answers','media_files','sync_signals'];
begin
 select count(*) into v_bad from unnest(v_tables) t
 where not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=t and c.relrowsecurity);
 if v_bad<>0 then raise exception 'Missing table or RLS disabled'; end if;
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='app_private' and c.relname='retired_media_ids' and c.relrowsecurity)
   or exists(select 1 from pg_policies where schemaname='app_private' and tablename='retired_media_ids') then
   raise exception 'Retired media IDs must have RLS and no client policies'; end if;
 if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
   cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   where has_table_privilege(r,'app_private.retired_media_ids',p)) then
   raise exception 'Unsafe retired media IDs grant'; end if;
 select count(*) into v_bad from unnest(v_tables) t
 where not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='connection_read' and cmd='SELECT');
 if v_bad<>0 then raise exception 'Missing SELECT policy'; end if;
 if exists(select 1 from unnest(v_tables) t where has_table_privilege('anon','public.'||t,'SELECT')
   or has_table_privilege('authenticated','public.'||t,'INSERT')
   or has_table_privilege('authenticated','public.'||t,'UPDATE')
   or has_table_privilege('authenticated','public.'||t,'DELETE')) then
   raise exception 'Unsafe table grant'; end if;
 if has_function_privilege('authenticated','public.admin_enroll_pair(uuid,text,uuid,text)','EXECUTE')
   or has_function_privilege('anon','public.save_content(uuid,bigint,jsonb)','EXECUTE')
   or has_function_privilege('authenticated','app_private.begin_write()','EXECUTE') then
   raise exception 'Unsafe function execute grant'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='app_private' or (n.nspname='public' and p.proname in
   ('admin_enroll_pair','save_content','delete_content','save_mood','plant_flower','change_flower','start_round','submit_round_answer','reserve_media','finalize_media','mark_media_delete','finish_media_delete')))
   and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
   raise exception 'Definer function missing fixed empty search_path'; end if;
 if not exists(select 1 from storage.buckets where id='connection-private' and not public and file_size_limit=26214400) then
   raise exception 'Missing or unsafe bucket'; end if;
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in
   ('connection_storage_read','connection_storage_insert','connection_storage_delete'))<>3 then
   raise exception 'Storage policies missing'; end if;
 -- Dedicated project: any extra permissive Storage policy can OR around our gates.
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
   and policyname not in('connection_storage_read','connection_storage_insert','connection_storage_delete')) then
   raise exception 'Unexpected Storage policy: manual review required'; end if;
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables)
   or (select count(*) from pg_publication_tables where pubname='supabase_realtime')<>1
   or not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sync_signals') then
   raise exception 'Realtime publication must contain ONLY public.sync_signals'; end if;
 if (select count(*) from public.question_bank)<>8 then raise exception 'Question seed mismatch'; end if;
 if exists(select 1 from public.pair_members group by pair_id having count(*)>2) then raise exception 'Member cap violated'; end if;
end $$;
select 'catalog checks passed; live user/RLS/Storage/Realtime tests still required' as result;
select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in('users_profiles','pairs','pair_members','question_bank','content_items','moods','flowers','question_rounds','round_answers','media_files','sync_signals') order by c.relname;
select pubname,schemaname,tablename from pg_publication_tables where pubname='supabase_realtime';
select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
commit;
