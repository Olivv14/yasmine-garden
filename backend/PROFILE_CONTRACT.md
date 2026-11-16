# Profiles, private preferences, avatars and affection — additive v2 contract

**Implemented and executed in offline PostgreSQL only. NOT applied to Supabase. Not a complete product/UI or native push implementation.** Applies only to the fresh dedicated project described in `CONTRACT.md`, after `001_shared_app.sql`. This extension does not change the base migration, base verifier, frontend, packages or experience resources. The person's name is **Yasmine**; the garden enum `jasmine` remains botanical and unchanged.

## Trust boundary and compatibility

- Identity remains `supabase.auth.getUser()` -> `users_profiles.auth_user_id` -> `users_profiles.id`. Resolve the authenticated user and enrolled profile before displaying settings; never derive an identity from a name, email, local selector, nickname or storage path. All mutation RPCs derive actor/pair server-side through existing `app_private.begin_write()` / `my_id()` / `my_pair()` helpers. There are no owner/recipient/pair mutation arguments.
- Base tables, function signatures, column lists, content/mood enums, buckets and Storage policies are unmodified. The extension only updates an actor's existing `users_profiles.display_name` through the authorized profile RPC; it never creates a replacement profile or changes Auth IDs.
- Four new public tables have RLS, authenticated SELECT only and no direct writes. Three internal tables have RLS, no policies and no client/service-role grants. Eight RPCs and the one internal RLS predicate use `SECURITY DEFINER SET search_path=''`, explicit ownership checks and explicit execute revokes. Only authenticated gets execute. `app_private` must not be an exposed Data API schema.
- Mutations acquire the existing singleton pair row lock FIRST. This serializes name/settings versions, active-avatar CAS, reservation quotas, immutable operation identities, recipient derivation, sequence and cooldown decisions. Existing 120-successful-RPCs/person/UTC-minute cap includes these RPCs and retries. Failed transactions roll back their limiter increments; this is not HTTP/DoS protection.
- Only `sync_signals` is published to Realtime. Name/presentation edits, avatar activation/revocation and a new affection event invalidate both; private preferences/reservations/cleanup and recipient read state invalidate only the actor. Idempotent finalize/send retries do not duplicate invalidations. Reconnect uses the base full-resnapshot/revision algorithm, not presence.

## Exact tables

SQL types and defaults are authoritative in `002_profile_thoughts.sql`. UUID values are strings. UTC timestamps map to ISO strings; SQL NULL maps to JS null. Handle bigint versions/revisions without unsafe floating-point coercion.

| Table | Exact columns | Read scope |
|---|---|---|
| `profile_details` | `profile_id uuid` PK, `pair_id uuid`, `bio text`, `mood_animal text`, `version bigint`, `updated_at timestamptz` | own pair; these are deliberately partner-visible presentation fields |
| `profile_preferences` | `profile_id uuid` PK, `pair_id uuid`, `theme text`, `locale text`, `partner_nickname text/null`, `version bigint`, `updated_at timestamptz` | actor only; partner cannot read theme/locale/nickname |
| `profile_avatars` | `id uuid` PK, `pair_id uuid`, `owner_id uuid`, `object_key text` unique, `mime_type text`, `status text`, `active boolean`, `expected_active_id uuid/null`, `reserved_bytes bigint`, `size_bytes bigint/null`, `created_at timestamptz`, `updated_at timestamptz`, `publication_invalidated boolean NOT NULL DEFAULT false` | actor sees all retained operations; partner sees ONLY ready + active |
| `thought_events` | `id uuid` PK, `pair_id uuid`, `sender_id uuid`, `recipient_id uuid`, `phrase_key text`, `sequence bigint`, `created_at timestamptz`, `read_at timestamptz/null` | **recipient-only** inbox; sender receives sanitized send receipt through RPC retry, not inbox queries |

Private implementation state (no API reads/writes, never published): `app_private.retired_avatar_ids(id uuid PK,owner_id uuid,retired_at timestamptz)`, `avatar_limits(profile_id uuid PK,day_at date,reservations integer)`, `thought_limits(profile_id uuid PK,last_sent_at timestamptz,day_at date,daily_count integer,total_count bigint)`. Retired avatar IDs have no owner FK and survive app-data maintenance. Do not prune/reassign operation IDs or event rows without an approved permanent dedupe-preservation migration.

Avatar ordering fix adds **one appended column** to the existing avatar table/composite RPC return shape: `publication_invalidated`. RPC names, arguments and named return types are unchanged; clients must tolerate this additional returned field. It is server-controlled publication authority, not an identity, browser cancellation token or client-editable preference. No helper table/function or new grant is added. On first application over the old 002 shape, every already-pending operation is conservatively invalidated because its pre-fix publication history cannot be recovered safely; ready/deleting state, bytes, quotas, operation identities and cleanup remain intact. The column-existence guard runs this upgrade only once. Exact reapplication never clears invalidation or invalidates fresh unsuperseded pending rows.

### Exact values and semantics

- Themes (exactly ten): `dark`, `light`, `pastel`, `barcelona`, `tunisia`, `italy`, `lavender`, `ocean`, `forest`, `rose`.
- Locales (exactly three): `en`, `fr`, `aeb-TN`. No `ar`/MSA substitution. Translation catalogs/RTL belong to `experience/`, not generated SQL prose.
- `display_name`: trimmed 1..80 characters. It is the actor's **real own-name edit**, not a public rename of the partner. Account email/password/provider changes remain normal Supabase Auth flows, not this RPC; no password/email columns are added here.
- `bio`: optional empty text or at most 280 characters. Saving it deliberately shares this small self-description with the partner; do not use it for extra sensitive account information. All fields are text, never HTML.
- `mood_animal`: `none | calm | hopeful | nostalgic | hug | difficult`. These are the exact `experience/preferences.mjs` presentation keys: paw/turtle/butterfly/elephant/bear/hedgehog respectively. It is an independent **self-chosen decorative symbol**, not a feeling inferred from taps, content or presence, and does not mutate `moods`, its visibility, or the base mood enum.
- `partner_nickname`: NULL (unset) or trimmed 1..80 characters, **viewer-specific private label for their one server-known partner**. Optional storage capability only; keep UI disabled/unset until the ambiguous nickname request is confirmed. It does not alter either person's `users_profiles.display_name`. No global/public nickname field is added.
- `phrase_key`: exactly `affection.phrase01` ... `affection.phrase10`. No `thought.01` alias or ambiguous UI key mapping. Only keys, not localized sentences or fabricated memories, are stored.

## Exact reads

Every call must check `error`. A missing/denied schema or failed Auth lookup is not a successful empty account. After `getUser`, resolve `me.id` using the base contract. Then:

```js
supabase.from('profile_details').select('*').eq('pair_id', pairId);
supabase.from('profile_preferences').select('*').eq('profile_id', me.id).maybeSingle();
supabase.from('profile_avatars').select('*').eq('pair_id', pairId).order('created_at').order('id');
// Owner recovery list: include pending/deleting, not just the active row.
supabase.from('profile_avatars').select('*').eq('owner_id', me.id).order('created_at').order('id');
supabase.from('thought_events').select('*').eq('recipient_id', me.id)
  .order('created_at', {ascending:false}).order('id').range(0,199);
```

Page inbox/retained rows in ranges of 200 until a short page; replace snapshots on invalidation so removed avatars do not linger. Zero `profile_details`/preferences rows means **not configured yet**, not auto-created server data. The UI may propose explicit initial `dark`/`en`/empty bio/`none`/NULL values, but must not call them persisted before a successful save and readback. Initial settings versions are 0 when no row exists.

## Exact RPCs

Call `.rpc(NAME, {EXACT_ARGUMENT_NAMES})`. All arguments below are required, including explicit NULL values. Non-void returns are one composite row (normalize an object or one-element array; fail on unexpected result shape). After mutation, read the exact target back and reconcile the authoritative revision. No client timestamps/version increments/ownership fields are accepted.

### `save_my_profile(p_expected_version bigint,p_display_name text,p_bio text,p_mood_animal text) -> profile_details`

Full replacement, actor only. Initial expected version 0; otherwise exactly the current `profile_details.version`. Updates the existing `users_profiles.display_name` and self presentation in one transaction. Return includes detail version, not a duplicate display-name column: refetch the actor's `users_profiles` name and `profile_details`. Each successful edit increments version; a stale version returns `40001`. This is optimistic concurrency, not a replayable operation-ID save. If the response is lost, refetch and compare all intended fields before deciding whether another save is required. No blind retry on `40001`.

### `save_my_preferences(p_expected_version bigint,p_theme text,p_locale text,p_partner_nickname text) -> profile_preferences`

Full replacement, actor only, initial expected 0 then current row version. DB checks exact allowlists and nickname bound. Clear provisional nickname with explicit NULL. Version increments on each successful save; no partner invalidation. Name, avatar and presentation do not belong in this preferences table.

### CamelCase resource adapter boundary

`experience`'s `version:1` is its **serialization format version**, NOT either SQL optimistic version. Keep a separate `detailsVersion`/`preferencesVersion` from server snapshots. Explicitly map:

| Resource field | SQL source / write |
|---|---|
| `displayName` | `users_profiles.display_name` / `save_my_profile.p_display_name` |
| `moodAnimal` | `profile_details.mood_animal` / `save_my_profile.p_mood_animal` |
| `theme` | `profile_preferences.theme` / `save_my_preferences.p_theme` |
| `language` | `profile_preferences.locale` / `save_my_preferences.p_locale` |
| `nickname` | `profile_preferences.partner_nickname`, NULL <-> empty resource string; optional capability not confirmation of meaning |
| `photoRef` | own `profile_avatars.id` where ready+active, otherwise NULL; UUID is opaque and passes the resource identifier shape; never `object_key`, URL or base64 |

Adapter scope must equal the resolved authenticated `me.id`; it cannot select an arbitrary actor. The resource aggregates separate backend domains: saving profile + preferences is **not a cross-RPC atomic transaction**. Update only changed domains using their independent versions, preserve partial-success state and refetch; do not claim both saved if the second failed. Avatar replacement is exclusively the Storage lifecycle below, never an arbitrary `photoRef` table write. `bio` is outside the resource object's current accepted fields; send it only through the explicit profile form/RPC.

## Real private avatar lifecycle

Bucket **`connection-avatars`**, `public=false`, file limit **1 MiB = 1,048,576 bytes**. Exact MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. No SVG, HTML, PDF, audio/video, arbitrary URL or base64 data is stored in application tables. No journal/content placeholder is created. MIME checks are declared type checks, **not** malware scanning/content sniffing/EXIF removal or trusted image decoding. Browser/device image validation and consent remain UI/live gates.

1. Resolve current active avatar ID for the actor (or NULL if none). Generate a new UUID once for a genuinely new photo operation.
2. `reserve_avatar(p_id uuid,p_mime_type text,p_expected_active_id uuid) -> profile_avatars`. Actor/pair derived. `p_expected_active_id` must match current active ID (including NULL). Returned key is exactly `<pair_id>/<owner_profile_id>/<avatar_id>`; no email or name. Each pending row pessimistically reserves the full 1 MiB. Same UUID/type/expected-active retry returns identical live pending/ready row. Changed arguments/another owner/deleting or permanently retired UUID rejects `23505`. A retry does not consume another daily reservation.
3. Normal authenticated upload only:

```js
const reserved = await supabase.rpc('reserve_avatar', {
  p_id: avatarId, p_mime_type: mime, p_expected_active_id: currentAvatarId,
});
// Check error + normalize row before using reserved.data.object_key.
const uploaded = await supabase.storage.from('connection-avatars').upload(key, file, {
  contentType: mime, upsert: false, cacheControl: '0',
});
if (uploaded.error) throw uploaded.error;
const finalized = await supabase.rpc('finalize_avatar', {p_id: avatarId});
if (finalized.error) throw finalized.error;
```

4. `finalize_avatar(p_id uuid) -> profile_avatars` verifies real `storage.objects.metadata.size` and `.mimetype`, exact reserved MIME, nonzero <=1 MiB, still-matching active ID, and `publication_invalidated=false` under the pair lock. A competing replacement returns `40001` (discard stale pending operation through cleanup; do not silently replace the newer photo). Successful finalization atomically marks the previous active row `active=false,status='deleting'`, permanently sets `publication_invalidated=true` on **only the same owner's other pending operations**, sets the winner ready+active with actual byte reservation, and invalidates both. Losers retain pending status, immutable reservation arguments, full pessimistic byte charge and owner recovery reads; no cleanup or physical deletion is performed implicitly. Their finalize attempts remain `40001` even after the winner is marked/removed/finished and active returns to NULL, or after exact/full-chain reapply. This prevents both NULL and non-NULL stale cycles without timestamps. Same-ID reservation retries can return the invalidated pending row but never restore its publication authority; explicitly discard it. Unique partial index enforces one active row/person. Retry of still-ready active returns the same row; a replaced/deleting old ID is unavailable. A failed publication transaction rolls back winner, competing invalidation flags, active revocation, quota changes and signals together.
5. Read using `supabase.storage.from('connection-avatars').download(object_key)` with authenticated session. Check error, create an ephemeral object URL for the returned Blob and revoke it on replacement/logout. Partner reads only ready active; owner can read retained pending/deleting for recovery. An already downloaded copy cannot be revoked. No public/signed URL, transformations, listing, signed upload, copy/move/upsert/S3/TUS path is authorized.
6. List own `status='deleting'` rows after replacement and clean them. Also discard own pending rows with `publication_invalidated=true`. To discard a pending/active row, first call `mark_avatar_delete(p_id uuid) -> profile_avatars`; it atomically sets deleting/inactive and invalidates both only if that row was active. Mark only the intended immutable operation ID. Await/cancel its in-flight upload before cleanup; cancellation is cleanup coordination, **not** the SQL stale-publication protection.
7. `.storage.from('connection-avatars').remove([object_key])`, check error, then `finish_avatar_delete(p_id uuid) -> void`. Finish requires deleting status and **no Storage object metadata row remaining**. Atomically inserts a private permanent retired-ID marker and deletes only the application avatar metadata, releasing count/bytes. It never SQL-deletes `storage.objects` or claims to remove physical bytes. Missing own metadata is an idempotent no-op; stale old-ID finish cannot address a new UUID. A forced metadata-removal failure rolls retirement back too (tested).

### Quotas, interruption and Storage gates

- At most **3 retained avatar operations / 3 MiB per person**, counting active + pending + deleting. Count and byte reservations are conservative. One active and two pending fills the count cap. Clean old/deleting operations before another reservation.
- At most **10 new avatar reservations per UTC day/person** (same-ID retries do not count). At most **10,000 lifetime avatar operation IDs/person**, active + permanent retired ledger. A successful finish does not reset daily/lifetime counts. This bounds metadata/orphan upload churn, not bandwidth/failed-request DoS. Reviewed operator maintenance is required at the lifetime cap.
- INSERT policy requires own pending row AND managed `storage.allow_only_operation('object.upload')`; SELECT allows only authenticated get/info plus upload/delete authorization checks; DELETE requires own deleting row AND `object.delete`/`object.delete_many`. No UPDATE policy. Base bucket policies still cannot grant anything in this bucket because both sets constrain exact bucket IDs.
- These policies require the managed operation helpers. They fail closed if absent; do not loosen policies to bypass an unexpected HTTP route. Local tests model the documented helper ABI, not the running managed Storage service.
- Reservation/finalize and object bytes are separate systems, not one atomic transaction. A network interruption/race may retain bytes/reservations safely charged. If upload conflict follows a lost response, try finalize the same ID/key rather than overwrite. For a stale active-ID conflict discard the pending row, remove via Storage API, finish and only then request a fresh operation intentionally.
- Recover pending/deleting rows on next login with explicit retry/discard. No automatic janitor or privileged cleanup endpoint is installed. Never prune retirement markers. Do not promise that revocation deletes cached copies or removes bytes already in flight.

## Affection button: real event/in-app inbox, not native push

### `send_thought(p_id uuid) -> thought_events` (sanitized send receipt)

Generate/persist one operation UUID per completed ten-tap burst; call this RPC **once per burst**, not once per tap. The frontend intent remains:

```js
{ type:'affection.requested', version:1, idempotencyKey:uuid,
  phraseKey:'affection.phrase01', tapCount:10 }
```

Adapter validates its local intent format, then calls **only** `send_thought({p_id:intent.idempotencyKey})`. Sender/pair/recipient are never accepted from client. `tapCount` is a local interaction contract, not an authorization fact; a malicious client can call the RPC without taps, so SQL enforces cooldown/quotas regardless.

**Server phrase is authoritative:** it rotates per sender's successful new-event sequence 1..10/wrap, returning exactly `affection.phrase01` ... `affection.phrase10`. The helper's locally proposed `phraseKey` is NOT sent or trusted; it can drift after another device/reload. Render the returned key without remapping. Persist the returned receipt with the outbox operation. No native message is shown as delivered based on the proposed key or animation. Resolving sender's current `users_profiles.display_name` supplies the catalog's `{{sender}}` placeholder; names never authenticate or become phrase keys.

A new UUID requires exactly two enrolled members, derives the other member server-side, enforces **30-second sender cooldown**, **50 new events/person/UTC day**, and **10,000 lifetime events/person**. Uses the existing general mutation cap too. Phrase selection/event insert/quota update/both invalidations share the transaction/pair lock. Unique global event UUID plus sender check rejects cross-user reuse (`23505`); all operation IDs are immutable and never client-deleted.

Identical original UUID retry returns the same immutable sender/recipient/key/sequence/created timestamp before affection-specific cooldown/daily/lifetime checks, does not duplicate event or invalidation, and always returns `read_at:null` so it cannot leak recipient read state. The general 120 successful RPC/minute limiter still applies to retries. The event persists indefinitely within the lifetime cap; no deletion/retention task can erase dedupe evidence. This is an in-app event accepted by the DB, NOT proof the recipient saw it, a push provider accepted it, or a device displayed it.

### `mark_thought_read(p_id uuid) -> thought_events`

Recipient only; unknown/foreign event returns `42501`. First successful mark sets server `read_at`, invalidates recipient only. Repeated mark returns the same row without changing the timestamp/revision. Sender has no inbox SELECT access and cannot mark it read; sender send retries sanitize `read_at` to NULL.

No push-subscription table is needed for this implemented in-app scope. **No VAPID key, push sender, subscription endpoint, notification permission flow, service worker or device-delivery service is implemented.** iPhone web push is a separate PWA/Home Screen + explicit user opt-in + actual Push API/service-worker/server-delivery integration. Do not label this native APNs support or claim closed-app notification delivery. Review lock-screen privacy and obtain recipient consent before adding any such channel.

## Errors

- `42501`: enrollment/ownership/recipient denial or RPC grant.
- `40001`: profile/preferences version conflict or active-avatar CAS conflict; refetch and reconcile, not blind overwrite/retry success.
- `23505`: immutable operation UUID conflict/retirement; use a fresh UUID only for an intentionally new operation, not to bypass cooldown/quota.
- `23514` / `23502`: DB allowlist/bound/null check violation; `22023`: malformed name/UUID/lifecycle/upload metadata.
- `54000`: avatar/thought count/byte/day/lifetime quota; `P0001`: thought cooldown or base write-minute cap.

Show structured error status, preserve unsent intent/draft, and never convert a failed response into saved/sent/delivered. All calls require error checks; a sanitized send receipt is intentionally not a recipient read receipt.

## Apply / verify order — no remote execution performed

1. Approved human/operator confirms the fresh dedicated project and base Auth enrollment; no client/Saikan project writes. Apply `001_shared_app.sql` as a complete privileged transaction, then run **unchanged** `verify.sql` **before** this extension. The extension can also be applied before enrollment; its rows are lazily created by real actor RPCs.
2. Apply all of `002_profile_thoughts.sql` as one privileged transaction. No credentials/project IDs/user identities are embedded. Existing rows are retained on exact reapply; arbitrary drift is not auto-repaired.
3. Run the **extended read-only catalog verifier** exported by `node backend/profile-check.mjs --catalog-sql` in the privileged SQL Editor. This mode does not require PGlite and does not connect remotely. It reuses base checks with an explicit six-policy union (three untouched base + three avatar) and adds extension RLS/grants/definer/execute/private-state/bucket/policy checks. Original base policies/verifier remain untouched. Extra policies still fail closed.
4. `verify.sql` alone intentionally rejects the three extra avatar policies after extension as `Unexpected Storage policy: manual review required`; this is expected verifier versioning, NOT permission to remove the avatar gates or loosen base policies. Use the exported extended verifier thereafter. Do not fake/rename backup copies of base verification.
5. If reapplying the complete chain later, execute **001 then 002**, then the extended verifier. Base 001's `revoke all on all functions in schema app_private` revokes execute on the added `can_avatar` helper; 002 restores its exact grant. Do not leave the extension running between migrations or claim a base-only reapply keeps extension grants intact.
6. Verify actual API schema-cache return shapes and two independent authenticated sessions, role-negative cases, normal Storage HTTP upload/download/remove, image metadata keys/size/MIME enforcement, only active partner reads, interruption cleanup, true concurrent sessions, resnapshot/relogin and device UI before release. No cloud provisioning, deployment or network credentials were used here.

## Offline verification

From repository root, use the **existing external** test package (no installation/package mutation):

```bash
node --check backend/profile-check.mjs
CONNECTION_TEST_PACKAGE_JSON=C:/Users/rafaa/AppData/Local/hermes/profiles/krillin/cache/scratch/connection-backend-check/package.json node backend/profile-check.mjs
CONNECTION_TEST_PACKAGE_JSON=C:/Users/rafaa/AppData/Local/hermes/profiles/krillin/cache/scratch/connection-backend-check/package.json node backend/local-check.mjs
node backend/profile-check.mjs --catalog-sql
```

`profile-check.mjs` uses actual PGlite SQL/RLS/SET ROLE execution with random synthetic Auth UUIDs. It reuses only the explicit fixture SQL from `local-check.mjs`, not fabricated Supabase responses. It applies 001 twice with enrolled/content/retired-media state; runs original base verification; applies 002, exercises own-vs-peer names/preferences/avatar gates/lifecycle/CAS/metadata bounds/quotas, inbox privacy/idempotency/read state, compatible ten-phrase rotation/cooldown, anonymous/nonmember negatives and extended-catalog extra-policy rejection; reapplies 002 with populated states and compares payload/quota/retirement/version/timestamp snapshots; then additionally reruns the entire 001 -> 002 chain over that populated state, verifies restored helper grants, retired-avatar replay denial and a fresh WebP reservation. Local Storage-row fixture INSERT/DELETE models policy behavior only, not physical file delivery/deletion. Time-shifted quota fixtures and injected errors are local-only tests and must never be run on a real project.

Original command outputs/counts/package versions are recorded in `../execution/step-10-profile-backend.md`. The avatar-ABA red/green regression, independent parent fixture, updated counts and SQL hash are recorded in `../execution/step-14-avatar-order-fix.md`. The original 129 semantic cases are retained unchanged; additional actual SQL cases cover committed NULL ABA, non-NULL cycles, partner metadata/Storage-row invisibility, invalidated retry/cleanup/retirement/quota accounting, injected publication rollback, first pre-fix-shape upgrade and exact reapply preserving both revoked and fresh pending authority. Real Supabase HTTP/Auth/Storage/Realtime and true multi-session concurrency are **not tested**, nor are native push, the new settings UI, device images/RTL/translation quality or email/password Auth changes implemented by these files.

## Official primary references checked 2026-11-10

- Supabase getUser: https://supabase.com/docs/reference/javascript/auth-getuser — verified current-user lookup.
- Supabase Database Functions: https://supabase.com/docs/guides/database/functions — fixed definer path, in-function ownership checks and explicit execute revocation.
- Storage operation helpers: https://supabase.com/docs/guides/storage/schema/helper-functions — exact normalized operation gates, unset operation fails false.
- Official operation names: https://raw.githubusercontent.com/supabase/storage/master/src/http/routes/operations.ts — authenticated get/upload/delete and denied sign/copy/S3/TUS identifiers.
- Bucket restrictions: https://supabase.com/docs/guides/storage/buckets/creating-buckets — private bucket/type/size restrictions.
- Storage deletion: https://supabase.com/docs/guides/storage/management/delete-objects — API removal, not direct SQL deletion of managed metadata.
- WebKit iOS/iPadOS Web Push: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ — Home Screen app, direct-interaction opt-in, Push/Notifications APIs + service worker; this separate channel is explicitly not built here.
