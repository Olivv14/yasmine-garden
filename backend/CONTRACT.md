# Shared connection backend — exact v1 contract

**Status: implemented and executed offline; NOT applied to Supabase; live integration tests NOT RUN.** Dedicated fresh Supabase project only. No Saikan project/schema/env conventions are used. No real identities, credentials or local IndexedDB records are included. iPhone/widget delivery is explicitly outside this backend deliverable.

## 1. Decisions / trust boundary

- Exactly one pair, at most two members, database-enforced slots `1` and `2`; each profile belongs to at most one pair. No open enrollment, join code, pair-ID join RPC, self-created profile or user-editable membership.
- `auth.getUser()` -> `users_profiles.auth_user_id` -> `users_profiles.id` is identity. Display names, the old local selector and local `profile` labels NEVER authenticate. No guessed usernames or fixed UUIDs.
- All public tables enable RLS. Clients receive SELECT only; all writes use the explicitly granted RPCs below. RPCs run as definer with empty `search_path`, check the real Auth identity and serialize on the pair row. No client-provided owner/pair/timestamps/version increment is trusted. `app_private` must not be an exposed API schema.
- Journal and asynchronous question notes are private by default. `shared` is a real deliberate publication to the partner. Mood is latest-per-person, with explicit visibility. Dedications and playlist tracks also default private; UI must ask before sharing. Dedicated content types, not a freely writable JSON snapshot, are persistent shared state.
- **Recommended garden design: one shared pair garden.** Both see all active flowers and either can water; only the planter can delete. Types remain `jasmine`, `lilium`, `orchid`; water is a persisted integer 0..9, not an invented presence/growth signal. Maximum 24 active flowers per planter / 48 pair.
- `question_notes` are represented by `content_items.item_type='question_note'`: normal private/shared asynchronous answers, one active note per owner/question. They are NOT blind rounds. Blind-round submissions are text-only, immutable and hidden from the partner until both submit; drafts remain local. Media belongs to content items, not blind rounds in v1. Do not upload a round answer as a shared question note accidentally.
- Realtime publishes only per-recipient `sync_signals` invalidations, never content/answers/media. Private changes increment only the actor's row; shared changes increment both. No Presence, Broadcast, database-to-broadcast trigger or client-written presence claims. “Connected” may describe THIS client's transport, not whether the partner is online.
- Browser configuration: project URL + **publishable key** (or legacy anon key) only. NEVER service_role/secret key, DB password, Management token or JWT signing secret. No admin credentials are needed by the app.

## 2. Read schema (exact names)

All identifiers below are snake_case. UUIDs are strings, timestamps UTC ISO strings, SQL NULL maps to JS null. `bigint` versions/revisions are bounded in practice here; compare them without coercing them to floating point if the client returns strings. SQL file is the authoritative DDL.

| Table | Exact columns | Read scope |
|---|---|---|
| `users_profiles` | `id uuid`, `auth_user_id uuid`, `display_name text`, `created_at timestamptz` | self and enrolled partner; no email/password |
| `pairs` | `id uuid`, `singleton boolean`, `created_at timestamptz` | own pair |
| `pair_members` | `pair_id uuid`, `slot smallint`, `profile_id uuid` | own pair; PK `(pair_id,slot)` |
| `question_bank` | `id text`, `theme text`, `prompt text` | enrolled only; q1..q8 original prompts from approved template |
| `content_items` | `id uuid`, `pair_id uuid`, `owner_id uuid`, `item_type text`, `visibility text`, `body text`, `title text`, `url text/null`, `question_id text/null`, `entry_kind text`, `mood text`, `version bigint`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz/null` | active self-owned OR active shared in own pair |
| `moods` | `profile_id uuid` (PK), `pair_id uuid`, `mood text`, `note text`, `visibility text`, `version bigint`, `updated_at timestamptz` | self or shared in pair |
| `flowers` | `id uuid`, `pair_id uuid`, `planted_by uuid`, `flower_type text`, `water smallint`, `version bigint`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz/null` | active own-pair garden |
| `question_rounds` | `id uuid`, `pair_id uuid`, `question_id text`, `started_by uuid`, `created_at timestamptz`, `revealed_at timestamptz/null` | own pair; one unrevealed round at a time |
| `round_answers` | `round_id uuid`, `owner_id uuid`, `body text`, `submitted_at timestamptz`; PK `(round_id,owner_id)` | own submission; both only after server reveal |
| `media_files` | `id uuid`, `pair_id uuid`, `owner_id uuid`, `content_id uuid`, `object_key text`, `filename text`, `mime_type text`, `status text`, `reserved_bytes bigint`, `size_bytes bigint/null`, `created_at timestamptz`, `updated_at timestamptz` | owner including pending/deleting, or ready media linked to readable shared content |
| `sync_signals` | `profile_id uuid` (PK), `pair_id uuid`, `revision bigint`, `updated_at timestamptz` | exactly recipient's own row |

Enums and limits:

- `visibility`: `private | shared` (**not** old `share`). `item_type`: `journal | question_note | dedication | track`.
- `entry_kind`: `note | poem` (old `Nota | Poema`). Only journal may use poem/mood.
- `mood`: `none | calm | hopeful | nostalgic | hug | difficult`. Maps from template's `Sin etiquetar | En calma | Con ilusión | Con nostalgia | Necesito un abrazo | Día difícil` in that order.
- Body <=20,000 characters; title <=200; mood note <=500; profile display_name trimmed length 1..80. Dedication URL <=2,048, http/https only, no userinfo/whitespace, conservative hostname syntax (no IPv6 literal URL in v1). Render text via `textContent`, links via safe URL construction + `rel=noopener noreferrer`; no server URL fetch/preview.
- Journal can be empty while attaching files. UI must not mark an empty journal as complete before attachment upload succeeds. Question note requires a valid `question_id`; other types require question_id NULL. Dedication requires URL; all others require URL NULL. Track may attach audio only; dedication may not attach files.
- 10,000 **lifetime content rows per owner**, including tombstones; 1,000 lifetime rounds per pair; 10,000 lifetime flowers per pair. These small-app safety caps intentionally need reviewed admin maintenance if reached.
- At most 20 attachments per content item; one audio file per track; 25 MiB (26,214,400 bytes) per file; 100 MiB (104,857,600 bytes) reserved/actual per person. Reservations count pending + deleting bytes, not just visible files. Each pending upload reserves the full 25 MiB, then finalization releases unused space. Thus only four uploads can initially be pending; upload/finalize sequentially. A file that would fit in remaining actual bytes can still fail reservation if <25 MiB free; delete media to make reservation headroom.
- Mutation limit: 120 **successful mutation RPCs** per enrolled person per database UTC minute (retries count). Failed transaction counters roll back, so this is a basic write limiter, NOT HTTP/DoS protection; read requests and Storage HTTP requests are not rate-limited by it. Auth platform rate limits must remain enabled. No custom enterprise gateway required.

### Exact read examples

Every Supabase result MUST check `error`; never turn a denied/missing schema response into an empty successful app.

```js
const {data: {user}, error: authError} = await supabase.auth.getUser();
if (authError || !user) throw new Error('Sign in required');
const {data: me, error: profileError} = await supabase.from('users_profiles')
  .select('id,auth_user_id,display_name,created_at')
  .eq('auth_user_id', user.id).maybeSingle();
if (profileError || !me) throw new Error('Account not enrolled');
const membership = await supabase.from('pair_members')
  .select('pair_id,slot,profile_id').eq('profile_id', me.id).single();
if (membership.error) throw membership.error;
const pairId = membership.data.pair_id;
```

Then exact domains, with `.eq('pair_id',pairId)` where a pair_id exists:

```js
supabase.from('pair_members').select('pair_id,slot,profile_id').eq('pair_id',pairId).order('slot');
supabase.from('users_profiles').select('id,auth_user_id,display_name,created_at');
supabase.from('question_bank').select('id,theme,prompt').order('id');
supabase.from('content_items').select('*').eq('pair_id',pairId)
  .eq('item_type','journal').order('created_at').order('id').range(0,199);
// Repeat for question_note, dedication, track. No owner filter for a shared feed;
// add .eq('owner_id',me.id) only when intentionally displaying "mine".
supabase.from('moods').select('*').eq('pair_id',pairId);
supabase.from('flowers').select('*').eq('pair_id',pairId).order('created_at').order('id');
supabase.from('question_rounds').select('*').eq('pair_id',pairId)
  .order('created_at',{ascending:false}).order('id').range(0,199);
supabase.from('round_answers').select('round_id,owner_id,body,submitted_at').eq('round_id',roundId);
supabase.from('media_files').select('*').eq('content_id',contentId).order('created_at').order('id');
supabase.from('media_files').select('*').eq('owner_id',me.id).eq('status','deleting');
supabase.from('sync_signals').select('profile_id,pair_id,revision,updated_at').eq('profile_id',me.id).single();
```

Page content/rounds/media in ranges of 200, increment start until returned page length <200. Do not assume default API row limit includes all records. RLS hides tombstoned content/flowers automatically; a partner must replace snapshots on invalidation, not only merge upserts (otherwise unshared/deleted items linger).

## 3. Exact RPC write contract

Call `.rpc(NAME, {EXACT_ARGUMENT_NAMES})`. All public application RPCs below require an enrolled permanent authenticated account. Each non-void result is one composite row (PostgREST/client may expose as an object or single-element array; normalize to exactly one row and fail on unexpected shape). `void` yields null/no useful body. Never generate ownership fields client-side. Use `crypto.randomUUID()` for new content/flower/round/media IDs; persist that operation ID for uncertain-network retry.

### `save_content(p_id uuid, p_expected_version bigint, p_data jsonb) -> content_items`

Full replacement of editable fields, NOT a patch. `p_expected_version=0` only for a new ID; otherwise exact currently read `version`. Allowed JSON keys ONLY:

```js
{
  item_type: 'journal',       // REQUIRED; immutable for that ID
  visibility: 'private',     // default private if omitted/null
  body: '',                  // default ''
  title: '',                 // default ''
  url: null,                 // dedication only, required there
  question_id: null,         // question_note only, required there
  entry_kind: 'note',        // default note
  mood: 'none'               // default none
}
```

`id`, owner, pair, audit fields are not JSON keys. Unknown keys reject. Output version starts at 1; each update increments. A question note's `(owner_id,question_id)` is unique while active. To edit the note for q2, read its ID and version; do not create another ID. A shared-to-private transition invalidates both recipients. A note/track with attachment metadata can be shared only after explicit user consent; attachment visibility always follows the parent's current visibility, not a duplicated client flag.

### `delete_content(p_id uuid, p_expected_version bigint) -> void`

Owner only. Tombstones and clears body/title; marks ALL attached media `deleting`; both immediately disappear from partner reads. Tombstone retains basic ownership/type/question/mood/audit metadata and a non-content placeholder URL for a deleted dedication. Physical object deletion still requires the lifecycle below. Repeat delete of an already tombstoned ID is a no-op; otherwise stale versions reject. Do not reuse deleted content IDs.

### `save_mood(p_expected_version bigint, p_mood text, p_note text, p_visibility text) -> moods`

Creates latest-self row with expected 0 or replaces with current version. All four arguments required. “Clear mood” is an explicit save with `p_mood:'none', p_note:'', p_visibility:'private'`; no separate delete API.

### `plant_flower(p_id uuid, p_flower_type text) -> flowers`

New shared flower water=0/version=1, planted_by=actor. Same ID/same type retry returns existing row; changed payload or deleted ID conflicts.

### `change_flower(p_id uuid, p_expected_version bigint, p_action text) -> flowers`

`p_action:'water'` increments by one, saturating at 9; either member may water. `p_action:'delete'` tombstones, planter only. Requires current version and increments it. “Water all” calls once per currently visible flower with its version (at most 48); on conflict refetch and do NOT blindly repeat an increment that might already have committed.

### `start_round(p_id uuid, p_question_id text) -> question_rounds`

Both members must be enrolled. Valid q1..q8 only. Exactly one `revealed_at IS NULL` round allowed. Same ID/question retry returns row. If simultaneous starts return unique violation `23505`, refetch the open round and use it; never claim two rounds started.

### `submit_round_answer(p_round_id uuid, p_body text) -> round_answers`

Trimmed body length 1..20,000; text-only. Inserts only actor's answer, immutable thereafter. Identical-body retry returns actor's existing row; changed body rejects `23505`. Pair + round locks serialize submission; only when two distinct enrolled owners have answered does the server set `revealed_at` and invalidate both users. Before then, partner raw table SELECT and related queries return no hidden answer; only the submitter is invalidated. First submission does NOT signal partner submission progress. Refetch `question_rounds` plus `round_answers`; never infer reveal from client counts, another tab, a Presence message or a timer. One unanswered round intentionally remains resumable indefinitely; cancel/edit/delete/restart round is not supported in v1. Account/round erasure is an explicit owner-admin maintenance operation, not a bypass client RPC.

### Media RPCs

- `reserve_media(p_id uuid,p_content_id uuid,p_filename text,p_mime_type text) -> media_files`. Owned active parent only. While the reservation exists, ID retry requires same parent/name/type and a non-deleting status; no reassignment. After successful finish, the UUID is permanently retired: same-parent replay AND changed-parent reuse both reject `23505` (`Media ID retired; use a new UUID for a new upload`). Do not regenerate a UUID merely to bypass a failed/uncertain retry; use a fresh UUID only for a genuinely new upload operation. Returns the existing pending/ready row on an identical live retry, or generated `object_key`, `status:'pending'`, full-byte reservation for a new operation. Filename 1..200 characters is display metadata only, not a path.
- `finalize_media(p_id uuid) -> media_files`. Owner only. Reads real `storage.objects.metadata.size` and `.mimetype`, verifies nonzero <=25 MiB and exact reserved MIME type, marks `ready`, stores `size_bytes`, reduces `reserved_bytes` to actual. Missing upload/metadata or mismatch rejects. Repeated ready finalization returns existing row. No trusting frontend claimed size, MIME or `ready` flag.
- `mark_media_delete(p_id uuid) -> media_files`. Owner only, repeatable. Sets `deleting` and stops partner reads before physical deletion. All statuses can be marked.
- `finish_media_delete(p_id uuid) -> void`. Owner only, requires status deleting and **no object row remaining** in the private bucket. Atomically records a permanent private retired-ID marker and removes metadata/releases its byte and attachment-count reservation in the same SQL transaction, under the pair-first mutation lock. Already-absent metadata returns void; repeated finish leaves the marker intact. Will NOT delete bytes for you. `app_private.retired_media_ids(id,retired_at)` is internal only: RLS enabled, no client policies or table grants, no extra RPC, no content payload, not published to Realtime. Exact migration reapplication preserves populated markers and timestamps. Markers must not be pruned/reassigned and consume no media byte/count quota; an old UUID can never address a new upload incarnation. This does not retroactively recover identities deleted before this schema was applied.

Error handling: `42501` forbidden/unenrolled; `40001` optimistic conflict (refetch/reconcile, not blind overwrite); `23505` duplicate note/open round/immutable answer/ID collision/**permanently retired media UUID** (not a retryable reservation); `23514` enum/length/check violation; `23502` required field missing; `23503` invalid FK such as unknown question; `22023` invalid arguments/upload lifecycle; `54000` quota; `P0001` basic write-rate cap. Storage/Auth/transport errors are separate HTTP/client errors. Show the real failure, retain unsent local drafts and allow a controlled retry.

Idempotency: stable client UUIDs dedupe create operations; start/plant/reserve/identical submit/finalize/delete-finish have explicit retry behavior above. `save_content`, `save_mood`, watering and edits are version-guarded, not silently replayable. If the response is lost, read the target ID/version and compare the full intended data before deciding whether to retry. Never turn `40001` into “saved”.

## 4. Private Storage lifecycle / permissions

Bucket: **`connection-private`**, `public=false`, per-object 25 MiB. Object key is exactly `<pair_id>/<owner_profile_id>/<media_id>` returned by RPC; no extension, names, Auth UUIDs, URLs or credentials needed in paths. Metadata row links the object to the owned parent and pair. Path alone grants NOTHING.

Exact allowed MIME values: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/ogg`, `audio/wav`, `video/mp4`, `video/webm`, `video/quicktime`. Normalize recording `audio/webm;codecs=opus` to base `audio/webm` for reservation + upload `contentType` (and corresponding supported types); do not transcode by changing labels. Reject unsupported MIME before reservation. MIME declarations are not antivirus/content sniffing. No SVG/HTML/PDF uploads. Decoder/browser compatibility still requires device tests; unsupported codecs should show an error without deleting the file.

```js
// Check error after EVERY call; row normalization omitted here only for brevity.
const reserved = await supabase.rpc('reserve_media', {
  p_id: mediaId, p_content_id: contentId,
  p_filename: file.name, p_mime_type: mime
});
// require successful reserved result, then use returned object_key
await supabase.storage.from('connection-private').upload(key,file,{
  upsert:false, contentType:mime, cacheControl:'0'
});
await supabase.rpc('finalize_media',{p_id:mediaId});
// only then render to partner / report the attachment saved
const downloaded = await supabase.storage.from('connection-private').download(key);
// use URL.createObjectURL(downloaded.data); revoke when view/session changes
```

Owner can read their pending/deleting objects for recovery; peer can read ONLY ready media whose active parent is shared. INSERT needs an existing pending reservation owned by the actor; no unreserved arbitrary key. Current managed `storage.allow_only_operation` / `storage.allow_any_operation` helpers restrict INSERT to `object.upload`, SELECT to authenticated read/info + upload/delete checks, and DELETE to `object.delete`/`object.delete_many`. **Signing downloads/uploads, object listing/copy, S3 and TUS are denied server-side**, not just discouraged in UI; otherwise pre-authorized signed uploads could outlive a deleted reservation. This requires the current helpers on the dedicated project and fails closed if absent. Standard JS `.upload` / `.download` / `.remove` are the supported paths. Their actual HTTP operation behavior is still an explicit live integration gate. There is deliberately NO UPDATE policy: overwrite/upsert/move denied. Replace a file by a new reservation/key, finalize, then delete old file. Clients must not use public URLs, long-lived signed URLs, signed-upload URLs, S3 credentials or direct SQL Storage manipulation.

Removal order (also after `delete_content`):

1. Mark item/media deleting via RPC. Stop playback, revoke object URLs, remove rendered shared item.
2. Await/cancel any in-flight upload for that reservation before cleanup; do not race an upload and delete intentionally.
3. `supabase.storage.from('connection-private').remove([object_key])`; check error.
4. `finish_media_delete({p_id})`. If object still exists, this rejects and the reservation stays charged. If remove's response was lost, retry remove then finish. An absent object is safe once verified. Successful finish retires that UUID permanently; replaying reserve cannot revive it, even for the original parent. A subsequent new upload requires a new UUID/key; keep stale cleanup retries bound to the old UUID/key.

Failed upload: preserve an actionable pending row; retry upload only without upsert, or mark/remove/finish. If upload returned conflict after a lost response, try finalize; do not overwrite. Owner's next login lists their `pending`/`deleting` rows and offers retry/discard. Do not auto-delete an active in-flight upload. A stale pending reservation can be discarded after a user-confirmed grace period; no background job is secretly deployed here.

There is no atomic transaction spanning object bytes and public metadata. The deny-first lifecycle keeps privacy/quota conservative; interruptions/races may leave retained bytes/reservations. Privileged orphan cleanup, if later needed, runs ONLY in a trusted operator/server context: inventory `media_files` + bucket objects, review bucket/prefix/age against grace period, remove bytes through Storage API, verify absence, then finish/repair metadata. Never SQL-delete `storage.objects`, never delete across other buckets/projects, never ship privileged cleanup credentials to browser. Revocation cannot erase bytes a partner already downloaded, and independently generated signed URLs can remain usable until expiration; this frontend uses fresh authenticated downloads, no signed URL issuance. Clear/revoke local views on every snapshot replacement and logout.

## 5. Realtime and reconnect (exact channel)

Only `public.sync_signals` is in `supabase_realtime`; only UPDATE events are required. RLS permits just the subscriber's profile row. Channel names/filters are NOT authorization. No other content tables should be enabled in Dashboard Realtime. No `REPLICA IDENTITY FULL`, raw hidden-answer events, Broadcast channel or Presence channel is needed.

```js
const channel = supabase.channel('connection-sync-'+me.id)
 .on('postgres_changes',{
   event:'UPDATE',schema:'public',table:'sync_signals',
   filter:'profile_id=eq.'+me.id
 },()=>scheduleFullRefetch())
 .subscribe(status=>{
   if(status==='SUBSCRIBED') scheduleFullRefetch();
   // CHANNEL_ERROR / TIMED_OUT / CLOSED => show transport stale/reconnecting
 });
```

Refresh Realtime Auth when the normal Supabase Auth session refreshes (the JS client integrates session refresh; if explicitly managing tokens use `supabase.realtime.setAuth(session.access_token)`, NEVER a handcrafted token). Close/remove channel before sign-out/account change and clear all user-scoped memory/media URLs. Expired/no session must not continue rendering partner content.

Hydration/reconnect algorithm: establish authenticated subscription; read own sync revision R0; fetch complete paginated domain snapshots; read revision R1; if changed, retry (debounce/queue concurrent invalidations). Replace visible collections only when consistent. On every `SUBSCRIBED`, network regain, foreground and relogin do a complete refetch; while active optionally poll revision every 30s for missed-event recovery. Realtime is an invalidation hint, never durable storage nor proof partner is online. Lost/reordered notifications do not break recovery because snapshots and revision are persisted server-side. Do not use `updated_at > lastSeen` alone: soft-delete/unsharing must remove previously visible rows too.

## 6. Safe manual apply / invitation handoff (NOT EXECUTED)

Human owner/provisioning parent owns this step. Do not execute these against any existing Saikan or client project. No cloud creation, credential capture or deployment happened in this backend work.

1. Verify the intended owner's Dashboard identity and exact **fresh dedicated Free project**. No card/upgrade. Confirm public schema has no unrelated app data and no pre-existing permissive Storage policies. Record project ref in private operator notes, not secrets in this repo.
2. In Dashboard Authentication configuration disable **Allow new users to sign up** and **Allow anonymous sign-ins**; disable unused providers/manual linking. Keep Email verification enabled. Configure exact app Site URL + invite/recovery redirect allowlist before invitations. No public signup form. These Auth settings are NOT SQL settings and are NOT changed by the migration. Test a normal uninvited signup really fails.
3. SQL Editor, privileged postgres session: review and run **all** of `001_shared_app.sql` as one transaction. Failure rolls back; do not continue with a partial statement selection. Never submit this through browser PostgREST or make an `exec_sql` escape hatch. Re-running this exact file preserves rows/policies and is tested offline; `CREATE TABLE IF NOT EXISTS` does not reconcile arbitrary drift. If drift exists, stop and review, do not assume idempotence repairs it.
4. Run `verify.sql` unchanged. This is read-only and can run before enrollment. It checks table RLS, table grants, definer path/execute, private bucket/policies, publication allowlist and seed. Inspect Database API settings: expose `public` (normal managed defaults may also exist), NOT `app_private`, `auth` or `storage` as custom Data API schemas. Inspect Storage policies for no extra permissive policy; verify.sql refuses extras in this dedicated project. Keep Storage global upload limit at least 25 MiB, not lower than bucket limit.
5. Owner invites exactly the intended two users through Dashboard **Authentication > Users > Invite user**, or through a trusted server-only `auth.admin.inviteUserByEmail` workflow. Never store/share a default password; each user accepts invitation and sets their own password via Auth recovery/invite flow. If email delivery or disabled-signup interaction blocks invitation, stop and resolve the Dashboard/provider configuration; do not enable public signup as a workaround. Do not silently fall back to hardcoded accounts. Auth UUIDs come from the resulting Users records, not guessed labels.
6. In the same privileged SQL Editor call `public.admin_enroll_pair(p_auth_a uuid,p_name_a text,p_auth_b uuid,p_name_b text)`. Supply the two actual Auth IDs privately at execution time; no identities are compiled into SQL. Its return is the pair UUID. Both Auth users must exist and not be anonymous. It refuses a replacement occupant; repeated enrollment with the same two members preserves data and membership. It is NOT granted to authenticated, anon OR service_role; only its postgres owner/admin DB context can invoke it. There is no app-side enrollment button. User/profile creation and pair enrollment are separate and intentional.
7. Read back `users_profiles(id,auth_user_id,display_name)`, `pair_members(pair_id,slot,profile_id)` and `sync_signals` as admin; require exactly the approved two profiles, two distinct member slots, two sync rows. Rerun `verify.sql`. Then frontend consumes only URL/publishable key and users sign in through Supabase Auth. Failure to resolve a profile is “not enrolled,” never fallback identity.
8. Replacement/removal/account erasure requires reviewed owner-admin operations, with explicit export/consent/storage cleanup before deleting anything. Auth FK is RESTRICT so a Dashboard delete must not silently cascade journal/media away. Do not remove a member from an active blind round without deciding what happens to their retained answers.

Optional psql operator enrollment (interactive IDs/display names only, no credentials in command history):

```sql
\prompt 'Approved Auth user A UUID: ' auth_a
\prompt 'Display name A: ' name_a
\prompt 'Approved Auth user B UUID: ' auth_b
\prompt 'Display name B: ' name_b
begin;
select public.admin_enroll_pair(:'auth_a'::uuid, :'name_a', :'auth_b'::uuid, :'name_b');
select id,auth_user_id,display_name from public.users_profiles;
select pair_id,slot,profile_id from public.pair_members order by slot;
select profile_id,pair_id,revision from public.sync_signals;
commit;
```

The `\prompt` packet is psql-only, not SQL Editor syntax. Review outputs before accepting completion; none of this packet has been run against a remote project.

## 7. Verification evidence and remaining live gates

`local-check.mjs` creates **ephemeral embedded PostgreSQL** databases using PGlite, with deliberately minimal local `auth`/`storage` ABI fixture schemas and random synthetic identities. It executes the actual migration twice, actual read-only verification and actual SQL functions/RLS under separate `SET ROLE` identities; no Supabase HTTP response is simulated or claimed. The original 48 checks remain, with explicit same-parent/changed-parent retired-ID denials, private-marker access denials, repeat-finish/zero-byte checks and an injected post-retirement delete failure proving atomic rollback. An independent database creates a retired marker through the real lifecycle, reapplies the exact migration over populated state, compares its ID/timestamp and content/media snapshots, reruns catalog checks, repeats both denials, and proves stale old-ID mark/finish cannot affect a fresh UUID upload. It never connects to a remote system. Local storage row operations test policy predicates, not physical object deletion. No heavy database server or Docker image was installed.

Run without changing app package/assets:

```bash
# From repo root. Install test-only dependency OUTSIDE the repo.
npm install --prefix "$TMPDIR/connection-backend-check" --no-audit --no-fund --ignore-scripts @electric-sql/pglite
CONNECTION_TEST_PACKAGE_JSON="$TMPDIR/connection-backend-check/package.json" node backend/local-check.mjs
node --check backend/local-check.mjs
```

`CONNECTION_TEST_PACKAGE_JSON` must be an absolute native path on Windows. Exact local dependency version/executed result are in `execution/step-01-backend.md` in the parent workspace. This harness is supplementary offline execution, not a migration/apply command. `verify.sql` deliberately contains no synthetic users or test-data writes and is safe to inspect/run read-only against the dedicated project once approved.

**Live gates — all NOT RUN until provisioned and approved; do not call the app complete before these:**

- Apply migration + rerun catalog verification on actual dedicated Supabase PG; capture real version/schema-cache behavior and all RPC result shapes. Confirm eight question seeds, two members, private bucket and only sync_signals published. No conflicting policies.
- Two independent browser Auth sessions A/B + signed-out session. A creates private journal and media; B raw REST SELECT/Storage download must not return them. Random keys/pair IDs, unreserved upload, partner update/delete, direct table mutations, anon RPCs and an unenrolled authenticated account must fail or return zero rows without changing the target. Verify original content intact after denied writes.
- Publish then unshare journal/mood/playlist; B sees shared only and removes it after unshare/refetch. Ready media follows parent publication immediately on fresh reads. An already downloaded copy is not revocable. Reload/relogin preserves both accounts' server data. Default content stays private.
- Real Storage upload <=25 MiB with matching allowed MIME, finalization metadata, authenticated download/playback image/audio/video on target browsers; reject disallowed type/oversize, unreserved upload and overwrite. Test pending/missing/failure cleanup, delete interrupted at each step, then retry recovery and verify bytes + metadata + quota. Check actual Storage metadata keys match `.size`/`.mimetype`; if not, stop and adapt based on actual server docs/output, do not accept a forged frontend size.
- A submits round answer; B cannot read it by raw query/nested query/Realtime even when knowing IDs. Refresh B before submitting: still hidden. B submits: both see exactly two, timestamp persisted. Repeat identical submissions doesn't duplicate. Change rejected. Disconnect B, submit while offline/online, reconnect/refetch resumes correct round. No answer text ever in websocket invalidations.
- **Real simultaneous sessions:** competing start_round calls leave one open round; competing submissions reveal only after two distinct members; competing edits/waters return a version conflict rather than lost update; pending upload reservations never exceed 100 MiB/person. Pair slots prevent third enrollment, independent of timing. Test RPC limit via scoped synthetic actions, not flooding live real-user content.
- Browser code/public built artifact audit: no secret/service_role/admin API, no local selector impersonation, no silent upload of old local private data, no false presence and no auto-play regression.

Live privacy tests must use synthetic records explicitly created by test sessions, track their IDs, then owner-delete only those records and clean Storage via API. Do NOT truncate tables, delete all users, replace memberships or run the embedded fixture SQL on a live project. The old local state/export stays untouched; importing it is a separate user-approved, user-scoped, UUID-mapped/idempotent operation and is NOT implemented by this backend migration.

## 8. Official primary sources checked

Retrieved directly on 2026-11-10 (current pages, not model recall); paraphrased here, no copied question pack or project recipes:

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): table grants and RLS both required; Auth UID/permanent-user checks; definer bypass and service-role warning. We explicitly revoke table writes and test owner/member/non-member behavior.
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions): definer search_path + ownership checks + explicit execute revocation. Internal helpers live in nonexposed app_private; deliberately exposed mutation RPCs check identity/ownership themselves and have allowlisted execute grants.
- [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser): server-verified Auth user lookup, not a local display selector.
- [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration): signup and anonymous signin switches are Dashboard configuration.
- [Supabase admin invitation](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) and [admin create user](https://supabase.com/docs/reference/javascript/auth-admin-createuser): privileged admin surface; never browser service-role. This packet uses invitations, not hardcoded passwords.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control): storage.objects policies, INSERT-only normal uploads, SELECT/UPDATE additionally required for upsert. Our no-UPDATE policy prevents overwrites.
- [Supabase Storage helper functions](https://supabase.com/docs/guides/storage/schema/helper-functions) and [official operation identifiers](https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts): operation-aware RLS to deny signing/S3/TUS paths. The local harness models this ABI explicitly; actual managed Storage behavior remains untested.
- [Supabase bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets): bucket size/MIME enforcement alongside our reservation quota.
- [Supabase delete objects](https://supabase.com/docs/guides/storage/management/delete-objects): delete via Storage API; SQL deletes leave bytes orphaned. Our RPC verifies absence but never SQL-deletes managed Storage rows.
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): publication allowlist, per-subscriber authorization and session token integration. Our payload tables are excluded entirely.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): FOR UPDATE blocks competing writers until transaction ends. Applied to the singleton pair before count/byte/reveal decisions; genuine concurrent-session integration remains a live gate.
