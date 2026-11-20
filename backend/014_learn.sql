-- 014: Learn. Each of you has your own progress on every card (spaced repetition, FSRS: the app computes the next
-- review and saves the card's state here), cards come from the decks shipped with the app ("it.amore") or from words
-- your partner taught you ("w:<message id>", a Talk message of kind 'word', now with an optional voice recording).
-- Every 10 reviews in a day is a point for the week.
-- Apply AFTER 013, as postgres, in this one transaction. Additive: two new tables, one new function; a word message
-- may carry a voice note; the points also count reviews.
begin;

create table if not exists public.learn_state (
  profile_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  card_key text not null check (card_key ~ '^((it|ve|tn)\.[a-z0-9-]{1,48}|w:[0-9a-f-]{36})$'),
  due timestamptz not null,
  stability double precision not null default 0 check (stability>=0),
  difficulty double precision not null default 0 check (difficulty>=0 and difficulty<=11),
  elapsed_days integer not null default 0 check (elapsed_days>=0),
  scheduled_days integer not null default 0 check (scheduled_days>=0),
  learning_steps integer not null default 0 check (learning_steps>=0),
  reps integer not null default 0 check (reps>=0),
  lapses integer not null default 0 check (lapses>=0),
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id,card_key),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
create table if not exists public.learn_days (
  profile_id uuid not null references public.users_profiles(id),
  pair_id uuid not null references public.pairs(id),
  day date not null,
  reviews integer not null default 0 check (reviews>=0),
  primary key (profile_id,day),
  foreign key (pair_id,profile_id) references public.pair_members(pair_id,profile_id)
);
alter table public.learn_state enable row level security;
alter table public.learn_days enable row level security;
drop policy if exists learn_state_pair_read on public.learn_state;
create policy learn_state_pair_read on public.learn_state for select to authenticated using (pair_id=(select app_private.my_pair()));
drop policy if exists learn_days_pair_read on public.learn_days;
create policy learn_days_pair_read on public.learn_days for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.learn_state, public.learn_days from public, anon, authenticated;
grant select on public.learn_state, public.learn_days to authenticated;

-- One review: the card's new state (reps must grow by exactly one; the same state again is a safe retry).
create or replace function public.learn_review(p_card_key text,p_state jsonb)
returns public.learn_state language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_old public.learn_state; v_row public.learn_state;
  v_reps integer:=(p_state->>'reps')::integer;
begin
  if p_card_key like 'w:%' and not exists(select 1 from public.messages where id=substr(p_card_key,3)::uuid and pair_id=v_pair and kind='word' and deleted_at is null) then
    raise exception 'Unknown word' using errcode='22023'; end if;
  if (select count(*) from public.learn_state where profile_id=v_me)>=5000 then raise exception 'Learn quota' using errcode='54000'; end if;
  select * into v_old from public.learn_state where profile_id=v_me and card_key=p_card_key;
  if found and v_old.reps=v_reps then return v_old; end if;
  if v_reps is distinct from coalesce(v_old.reps,0)+1 then raise exception 'Out of step' using errcode='PT409'; end if;
  insert into public.learn_state(profile_id,pair_id,card_key,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review)
  values(v_me,v_pair,p_card_key,(p_state->>'due')::timestamptz,(p_state->>'stability')::double precision,(p_state->>'difficulty')::double precision,
    (p_state->>'elapsed_days')::integer,(p_state->>'scheduled_days')::integer,coalesce((p_state->>'learning_steps')::integer,0),v_reps,
    (p_state->>'lapses')::integer,(p_state->>'state')::smallint,(p_state->>'last_review')::timestamptz)
  on conflict (profile_id,card_key) do update set due=excluded.due,stability=excluded.stability,difficulty=excluded.difficulty,
    elapsed_days=excluded.elapsed_days,scheduled_days=excluded.scheduled_days,learning_steps=excluded.learning_steps,reps=excluded.reps,
    lapses=excluded.lapses,state=excluded.state,last_review=excluded.last_review,updated_at=now()
  returning * into v_row;
  insert into public.learn_days(profile_id,pair_id,day,reviews) values(v_me,v_pair,(now() at time zone 'utc')::date,1)
  on conflict (profile_id,day) do update set reviews=public.learn_days.reviews+1;
  return v_row;
end $$;
revoke all on function public.learn_review(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.learn_review(text,jsonb) to authenticated;

-- A word you teach can carry your voice saying it
create or replace function public.reserve_message_media(p_id uuid,p_message_id uuid,p_filename text,p_mime_type text)
returns public.media_files language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_msg public.messages; v_row public.media_files;
begin
 if exists(select 1 from app_private.retired_media_ids where id=p_id) then
   raise exception 'Media ID retired; use a new UUID for a new upload' using errcode='23505'; end if;
 select * into v_row from public.media_files where id=p_id;
 if found then
   if v_row.owner_id<>v_me or v_row.message_id is distinct from p_message_id or v_row.status='deleting'
     or v_row.filename is distinct from p_filename or v_row.mime_type is distinct from p_mime_type then
     raise exception 'Media ID conflict' using errcode='23505'; end if;
   return v_row;
 end if;
 select * into v_msg from public.messages where id=p_message_id and sender_id=v_me and deleted_at is null;
 if not found then raise exception 'Own message required' using errcode='42501'; end if;
 if not ((v_msg.kind='photo' and p_mime_type like 'image/%') or (v_msg.kind='voice' and p_mime_type like 'audio/%')
    or (v_msg.kind='dance' and p_mime_type in ('video/mp4','video/webm','video/quicktime'))
    or (v_msg.kind='word' and p_mime_type like 'audio/%')) then
   raise exception 'Unsupported attachment for message kind' using errcode='22023'; end if;
 if exists(select 1 from public.media_files where message_id=p_message_id) then
   raise exception 'One upload per message' using errcode='54000'; end if;
 if (select coalesce(sum(reserved_bytes),0) from public.media_files where owner_id=v_me)+26214400>104857600 then
   raise exception 'Media quota: 100 MiB per person, including pending/deleting' using errcode='54000'; end if;
 insert into public.media_files(id,pair_id,owner_id,content_id,message_id,object_key,filename,mime_type)
 values(p_id,app_private.my_pair(),v_me,null,p_message_id,
   app_private.my_pair()::text||'/'||v_me::text||'/'||p_id::text,p_filename,p_mime_type) returning * into v_row;
 return v_row;
end $$;

-- Points: as 013, plus a point for every 10 reviews in a day
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
    + coalesce((select sum(case
         when a_score<>b_score then case when (a_score>b_score and a_id=p_profile::text) or (b_score>a_score and b_id=p_profile::text) then 2 else 0 end
         when a_ms is null or b_ms is null or a_ms=b_ms then 1
         when (a_ms<b_ms and a_id=p_profile::text) or (b_ms<a_ms and b_id=p_profile::text) then 2 else 0 end)
       from duels where p_profile::text in (a_id,b_id)),0)
  )::integer
$$;
revoke all on function app_private.points_earned(uuid) from public, anon, authenticated;

do $verify$
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('learn_state','learn_days') and not c.relrowsecurity) then
    raise exception '014: learn tables need RLS'; end if;
  if has_table_privilege('authenticated','public.learn_state','INSERT') or has_table_privilege('authenticated','public.learn_days','UPDATE') then raise exception '014: unsafe table grant'; end if;
  if has_function_privilege('anon','public.learn_review(text,jsonb)','EXECUTE') then raise exception '014: unsafe function grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('learn_review','reserve_message_media')
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
    raise exception '014: functions need security definer with empty search_path'; end if;
end $verify$;
commit;
