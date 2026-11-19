-- Read-only snapshot of the production schema and row counts (no personal content is printed).
select n.nspname as schema, c.relname as table, c.relrowsecurity as rls, c.reltuples::bigint as approx_rows
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and n.nspname in ('public','app_private') order by 1,2;
select 'users' as what, count(*) from public.users_profiles
union all select 'content', count(*) from public.content_items
union all select 'rounds', count(*) from public.question_rounds
union all select 'thoughts', count(*) from public.thought_events
union all select 'flowers', count(*) from public.flowers
union all select 'push_subscriptions', count(*) from app_private.push_subscriptions;
select conname, pg_get_constraintdef(oid) from pg_constraint
where conname in ('flowers_flower_type_check','profile_preferences_locale_check','profile_preferences_theme_check');
select schemaname, tablename, policyname from pg_policies where schemaname='realtime' order by policyname;
select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 1;
