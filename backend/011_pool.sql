-- 011: Pool. 8-ball against the toad or live with your partner, saved like air hockey so it counts for the week.
-- The live table uses the existing private "pair:<pair>:play" channel (006); nothing new is needed for it.
-- Apply AFTER 010, as postgres, in this one transaction. Additive: two checks get wider; nothing is removed.
begin;

alter table public.game_events drop constraint if exists game_events_game_check;
alter table public.game_events add constraint game_events_game_check check (game in ('truth_dare','hockey','hockey_bot','pool','pool_bot'));
alter table public.game_events drop constraint if exists game_events_shape;
alter table public.game_events add constraint game_events_shape check (
    (game='truth_dare' and kind in ('truth','dare') and card_id is not null and left(card_id,1)=left(kind,1) and score_me is null and score_partner is null)
    or (game='truth_dare' and kind='finish' and card_id is null and response is null and score_me is null and score_partner is null)
    or (game in ('hockey','hockey_bot') and kind='finish' and card_id is null and response is null and score_me is not null and score_partner is not null)
    -- pool: 1 for the winner of the rack, 0 for the other
    or (game in ('pool','pool_bot') and kind='finish' and card_id is null and response is null
        and score_me in (0,1) and score_partner in (0,1) and score_me+score_partner=1));

do $verify$
begin
 if not exists(select 1 from pg_constraint where conname='game_events_game_check' and pg_get_constraintdef(oid) like '%pool_bot%') then
   raise exception '011: game check not widened'; end if;
 if exists(select 1 from public.game_events where game not in ('truth_dare','hockey','hockey_bot','pool','pool_bot')) then raise exception '011: unexpected game rows'; end if;
end $verify$;
commit;
