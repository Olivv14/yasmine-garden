-- 013: Dance and piano tiles.
-- Copy my step: a dance step is a Talk message of kind 'dance' carrying a short video (the existing media lifecycle:
-- reserve_message_media -> upload -> finalize), payload {"role":"step"|"copy","style":"bachata|...","of":<step id>}.
-- The one who filmed the step gives the copy 1 to 3 hearts. Piano tiles results are game events ('piano') that count
-- for the week: one point per star. A letter for later is a Talk message of kind 'letter' (payload {"opens_at":"YYYY-MM-DD"},
-- no body); its words live in sealed_letters, which the partner can only read from that day on (send_letter).
-- Apply AFTER 012, as postgres, in this one transaction. Additive: checks get wider, one table and one function are
-- new, reserve_message_media also accepts a video for a dance, and the points count piano stars.
begin;

-- 1. Dance messages
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','photo','voice','song','game','word','dance','letter'));
alter table public.messages drop constraint if exists messages_shape;
alter table public.messages add constraint messages_shape check (
  deleted_at is not null or (kind='text' and body is not null) or kind in ('photo','voice')
  or (kind in ('song','game','word') and payload is not null)
  or (kind='dance' and payload is not null and coalesce(payload->>'role','') in ('step','copy')
      and (payload->>'role'='step' or (payload ? 'of')))
  or (kind='letter' and body is null and payload is not null and coalesce(payload->>'opens_at','') ~ '^\d{4}-\d{2}-\d{2}$'));

-- 2. A dance carries one short video (same quota and lifecycle as photos and voice notes)
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
    or (v_msg.kind='dance' and p_mime_type in ('video/mp4','video/webm','video/quicktime'))) then
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

-- 3. Hearts for a copy, given by the one who filmed the step
create table if not exists public.dance_ratings (
  copy_id uuid primary key references public.messages(id),
  pair_id uuid not null references public.pairs(id),
  rater_id uuid not null references public.users_profiles(id),
  hearts smallint not null check (hearts between 1 and 3),
  created_at timestamptz not null default now(),
  foreign key (pair_id,rater_id) references public.pair_members(pair_id,profile_id)
);
alter table public.dance_ratings enable row level security;
drop policy if exists dance_ratings_pair_read on public.dance_ratings;
create policy dance_ratings_pair_read on public.dance_ratings for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.dance_ratings from public, anon, authenticated;
grant select on public.dance_ratings to authenticated;

create or replace function public.rate_dance(p_copy_id uuid,p_hearts smallint)
returns public.dance_ratings language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_copy public.messages; v_step public.messages; v_row public.dance_ratings;
begin
  if p_hearts is null or p_hearts not between 1 and 3 then raise exception 'One to three hearts' using errcode='22023'; end if;
  select * into v_copy from public.messages where id=p_copy_id and pair_id=v_pair and kind='dance' and deleted_at is null and payload->>'role'='copy';
  if not found then raise exception 'Copy unavailable' using errcode='42501'; end if;
  select * into v_step from public.messages where id=(v_copy.payload->>'of')::uuid and pair_id=v_pair and kind='dance';
  if not found or v_step.sender_id<>v_me then raise exception 'Only the one who filmed the step rates the copy' using errcode='42501'; end if;
  insert into public.dance_ratings(copy_id,pair_id,rater_id,hearts) values(p_copy_id,v_pair,v_me,p_hearts)
  on conflict (copy_id) do update set hearts=excluded.hearts,created_at=now() returning * into v_row;
  perform app_private.signal(true); return v_row;
end $$;
revoke all on function public.rate_dance(uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.rate_dance(uuid,smallint) to authenticated;

-- 4. Piano tiles results: score_me the score, score_partner the stars (0-3), response the song's title
alter table public.game_events drop constraint if exists game_events_game_check;
alter table public.game_events add constraint game_events_game_check check (game in ('truth_dare','hockey','hockey_bot','pool','pool_bot','piano'));
alter table public.game_events drop constraint if exists game_events_score_me_check;
alter table public.game_events add constraint game_events_score_me_check check (score_me between 0 and case when game='piano' then 32000 else 99 end);
alter table public.game_events drop constraint if exists game_events_shape;
alter table public.game_events add constraint game_events_shape check (
    (game='truth_dare' and kind in ('truth','dare') and card_id is not null and left(card_id,1)=left(kind,1) and score_me is null and score_partner is null)
    or (game='truth_dare' and kind='finish' and card_id is null and response is null and score_me is null and score_partner is null)
    or (game='hockey' and kind='finish' and card_id is null and response is null and score_me is not null and score_partner is not null)
    or (game='hockey_bot' and kind='finish' and (card_id is null or card_id in ('lv1','lv2','lv3')) and response is null and score_me is not null and score_partner is not null)
    or (game='pool' and kind='finish' and card_id is null and response is null
        and score_me in (0,1) and score_partner in (0,1) and score_me+score_partner=1)
    or (game='pool_bot' and kind='finish' and (card_id is null or card_id in ('lv1','lv2','lv3')) and response is null
        and score_me in (0,1) and score_partner in (0,1) and score_me+score_partner=1)
    or (game='piano' and kind='finish' and card_id is null and score_me between 0 and 32000 and score_partner between 0 and 3));

-- 5. Points count piano stars too (otherwise exactly as 012)
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

-- 6. The day you got together (shown on Us as "N days together"); either of you can set it
create table if not exists public.pair_story (
  pair_id uuid primary key references public.pairs(id),
  together_since date not null check (together_since between date '1990-01-01' and date '2100-01-01'),
  updated_by uuid not null references public.users_profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.pair_story enable row level security;
drop policy if exists pair_story_pair_read on public.pair_story;
create policy pair_story_pair_read on public.pair_story for select to authenticated using (pair_id=(select app_private.my_pair()));
revoke all on public.pair_story from public, anon, authenticated;
grant select on public.pair_story to authenticated;
create or replace function public.set_together_since(p_date date)
returns public.pair_story language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_pair uuid:=app_private.my_pair(); v_row public.pair_story;
begin
  if p_date is null or p_date>current_date+1 then raise exception 'A day that has come' using errcode='22023'; end if;
  insert into public.pair_story(pair_id,together_since,updated_by) values(v_pair,p_date,v_me)
  on conflict (pair_id) do update set together_since=excluded.together_since,updated_by=excluded.updated_by,updated_at=now() returning * into v_row;
  perform app_private.signal(true); return v_row;
end $$;
revoke all on function public.set_together_since(date) from public, anon, authenticated, service_role;
grant execute on function public.set_together_since(date) to authenticated;

-- 7. Letters for later: the words stay sealed on the server until the day (the writer can always read them)
create table if not exists public.sealed_letters (
  id uuid primary key references public.messages(id),
  pair_id uuid not null references public.pairs(id),
  sender_id uuid not null references public.users_profiles(id),
  opens_at date not null,
  body text not null check (length(body) between 1 and 4000),
  foreign key (pair_id,sender_id) references public.pair_members(pair_id,profile_id)
);
alter table public.sealed_letters enable row level security;
drop policy if exists sealed_letters_read on public.sealed_letters;
create policy sealed_letters_read on public.sealed_letters for select to authenticated using (
  pair_id=(select app_private.my_pair())
  and exists(select 1 from public.messages m where m.id=sealed_letters.id and m.deleted_at is null)
  and (sender_id=(select app_private.my_id()) or opens_at<=(now() at time zone 'utc')::date));
revoke all on public.sealed_letters from public, anon, authenticated;
grant select on public.sealed_letters to authenticated;
create or replace function public.send_letter(p_id uuid,p_body text,p_opens_at date)
returns public.messages language plpgsql security definer set search_path='' as $$
declare v_me uuid:=app_private.begin_write(); v_msg public.messages; v_body text:=nullif(btrim(p_body),''); v_old public.sealed_letters;
begin
  if v_body is null or length(v_body)>4000 then raise exception 'Write a few words' using errcode='22023'; end if;
  if p_opens_at is null or p_opens_at<=current_date or p_opens_at>current_date+3660 then raise exception 'A day to come' using errcode='22023'; end if;
  select * into v_old from public.sealed_letters where id=p_id;
  if found and (v_old.sender_id<>v_me or v_old.body<>v_body or v_old.opens_at<>p_opens_at) then raise exception 'Letter ID conflict' using errcode='23505'; end if;
  v_msg:=public.send_message(p_id,'letter',null,jsonb_build_object('opens_at',to_char(p_opens_at,'YYYY-MM-DD')),null);
  if not found then insert into public.sealed_letters(id,pair_id,sender_id,opens_at,body) values(p_id,v_msg.pair_id,v_me,p_opens_at,v_body) on conflict (id) do nothing; end if;
  return v_msg;
end $$;
revoke all on function public.send_letter(uuid,text,date) from public, anon, authenticated, service_role;
grant execute on function public.send_letter(uuid,text,date) to authenticated;

do $verify$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='dance_ratings' and c.relrowsecurity) then
    raise exception '013: dance_ratings needs RLS'; end if;
  if has_table_privilege('authenticated','public.sealed_letters','INSERT') or has_table_privilege('authenticated','public.pair_story','INSERT') or has_table_privilege('authenticated','public.dance_ratings','INSERT') then raise exception '013: unsafe table grant'; end if;
  if has_function_privilege('anon','public.rate_dance(uuid,smallint)','EXECUTE') then raise exception '013: unsafe function grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('rate_dance','reserve_message_media','set_together_since','send_letter')
    and (not p.prosecdef or not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[]))))) then
    raise exception '013: functions need security definer with empty search_path'; end if;
end $verify$;
commit;
