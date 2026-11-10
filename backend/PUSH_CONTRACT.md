# Standard Web Push — code package / exact integration contract

**Code tested locally, not deployed, provisioned, installed or connected to the UI. No real push was sent.** This adds a real standards-based encrypted Web Push transport and PWA resources, not fake OS notification delivery and not a native APNs SDK. It extends `CONTRACT.md` + `PROFILE_CONTRACT.md`; their statements that push was absent describe the earlier implementation. Apply order is **001 -> 002 -> 003** on the approved fresh dedicated project only. Never expose `app_private` through the Data API.

## Authorization, privacy and durable identities

- Recipient opt-in is absent/disabled until an authenticated `register_my_push` call succeeds. No import-time prompts, auto-enrollment or subscription backfill. Browser permission alone does not register the device server-side.
- Both new tables are private: `app_private.push_subscriptions` and `app_private.push_deliveries`, RLS on, zero table grants/policies for anon/authenticated/**service_role**. The trusted sender obtains narrowly scoped secrets only through a service-only claim RPC. No endpoint, auth secret, browser encryption key, recipient locale or lease token appears in the sender's HTTP response or logs.
- `register_my_push` / `disable_my_push` acquire the existing `begin_write` singleton pair lock first, derive the real authenticated profile/pair, and consume the base successful-write limiter. No actor/pair/recipient argument is supported. Device identity, endpoint and encryption keys are immutable. Same owned UUID + identical subscription is retryable; ownership/endpoint/key changes reject generically.
- **Quota: five concurrently enabled subscriptions per profile, 10 new immutable identities per UTC day, 10,000 identities lifetime.** Disabled rows count toward daily/lifetime metadata bounds, not the enabled-device bound. Counts use durable, server-created `created_at` rows under the existing pair lock, with no new counter/helper or client clock. Existing UUID + identical endpoint/keys consumes no new daily/lifetime identity; an already enabled retry succeeds even at all identity/device limits. Re-enabling a disabled UUID must still fit five enabled devices. The existing successful-write rate limiter remains unchanged, including on retries.
- An endpoint is permanently pinned to its original owner by retained subscription history. The same owner may register a **new UUID with changed subscription keys at the same endpoint only when every prior row for that endpoint is disabled**. A partial unique index on enabled endpoints independently prevents duplicate active endpoints, including re-enabling an old UUID while a newer identity owns that active endpoint. Old UUID payloads remain immutable; another owner cannot adopt even an inactive endpoint. Rotation/logout does not delete or reset subscriptions, accepted deliveries, terminal/cancelled evidence, or event/subscription dedupe history. Neither registration nor re-enabling backfills old events.
- Only exact HTTPS vendor hosts `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, default implicit port, nonempty conservative path. No IP/custom host, suffix trick, userinfo, explicit port, query, fragment, percent escapes, dot-segments or whitespace. This deliberately excludes unreviewed vendors/paths rather than enabling arbitrary URL fetches. SQL and transport independently validate. Do not add a host without a primary-source review and tests. DNS ownership/TLS of these vendor domains is trusted; there is no custom DNS proxy.
- `p256dh`: canonical unpadded base64url, exactly 65 bytes, first byte 0x04 (P-256 uncompressed). `auth`: exactly 16 bytes, canonical unpadded base64url. The real sender additionally imports/verifies the P-256 point through WebCrypto. Neither endpoint nor keys is placed in error prose.
- An AFTER INSERT trigger on existing `thought_events` captures **only currently enabled subscriptions for the event's actual recipient**. Claim never inserts targets. Old pre-migration events, later subscriptions and re-enabled devices cannot replay old thoughts. The `thought_events` unique immutable event ID and `(event_id,subscription_id)` delivery primary key remain durable.
- Pair-first service claim/complete serialize against subscription mutations and `send_thought`. Claim has a random lease token, **90-second lease**, **30-second retry backoff**, **three-attempt maximum**, no reclaim of accepted/terminal targets. Stale token completion fails after another claim. 404/410 disables the device and cancels other outstanding deliveries. Explicit disable cancels pending/retry/leased rows; it cannot recall an in-flight provider request or a notification already queued/displayed.
- Recipient locale is read by service authorization only from the existing private preferences row. A missing locale is an explicit `22023` dispatch error, not English/Spanish/MSA fallback. Sender name comes from the authenticated event's real profile; client locale/name/recipient/phrase inputs are never trusted. Preview false is the default and sends generic localized text; preview true explicitly consents to the selected affection phrase + sender on a lock screen.

## Exact browser RPCs

All args required; check every `.error`. JSONB RPC results are JSON objects/arrays, not SQL composite-row arrays.

| RPC | Exact args | Result |
|---|---|---|
| `register_my_push` | `{p_id: uuid, p_endpoint: string, p_p256dh: string, p_auth: string, p_preview: boolean}` | `{id,enabled,preview,created_at}` only |
| `disable_my_push` | `{p_id: uuid}` | void; own ID required; repeated own disable allowed |
| `list_my_push` | `{}` | `[{id,enabled,preview,created_at}, ...]`, actor only, zero secrets |

`22023` invalid subscription, `23505` immutable operation/endpoint-owner/active-endpoint conflict (generic, no endpoint existence detail), `54000` five enabled devices, 10 new UTC-day identities or 10,000 lifetime identities, `42501` auth/enrollment/ownership or execute denial, base `P0001` rate cap. SQL accepts UUID types; resource/dispatch clients use canonical UUIDv4 generated with `crypto.randomUUID()`.

## Service-only RPCs (never browser)

Execute ACL is service_role only **and** helper checks `auth.role()='service_role'`; public/anon/authenticated execute revoked. No direct table grants are needed.

- `push_claim({p_event_id:uuid}) -> Target[]`. Each target: `{subscription_id,lease_token,attempt,endpoint,p256dh,auth,preview,locale,phrase_key,sender}`. Event must already exist. Recipient, locale and sender all derive from that row, never supplied as params.
- `push_complete({p_event_id:uuid,p_subscription_id:uuid,p_lease_token:uuid,p_outcome:'accepted'|'retry'|'gone'|'rejected'}) -> boolean`. True means that exact leased attempt was updated. False means stale/cancelled/already-completed attempt; do not claim it committed. Retry at attempt three becomes exhausted. Accepted gets a server timestamp.
- `push_status({p_event_id:uuid}) -> {targets,provider_accepted,retriable,terminal}`. Aggregate only; no target identities or secrets. `retriable` includes pending/retry/in-flight leased; zero is not proof of display.

Delivery statuses: `pending | leased | retry | accepted | gone | rejected | cancelled | exhausted`. No public browser table or recipient-read-ack status is added. Reapply the full chain, not 001 alone: baseline 001 revokes private helper executes for all extensions, 002 restores its own, 003 restores its exact grants. Fresh 003, exact 003 reapply, and old-003 upgrade/full-chain reapply preserve populated subscriptions, accepted timestamps, leases, attempts, terminal states and dedupe rows. The upgrade creates the active-endpoint unique index before dropping old 003's `push_subscriptions_endpoint_key` lifetime-unique constraint; it does not rewrite any retained row. Other unexpected schema drift is not reconciled by `CREATE TABLE IF NOT EXISTS`.

## Edge HTTP API / safe sender

Function name `dispatch-thought`. Request: `POST`, `Content-Type: application/json`, verified Supabase bearer user token, body **exactly**:

```json
{"event_id":"<one persisted UUIDv4 per completed ten-tap burst>"}
```

No other fields. Max 256 body bytes read with an actual bounded stream. Origin, when supplied, must match `PUBLIC_APP_URL`'s origin; CORS is not auth. OPTIONS is preflight only. No generic proxy/link/fetch endpoint.

The handler explicitly calls `auth.getUser(token)` remotely **before constructing/using any privileged client**. It then calls existing `send_thought({p_id:event_id})` **under that same bearer user token**. This is both the new-event create path and the ownership/idempotency check for retries: a newly authenticated sender UUID creates one real event; a foreign ID fails; the same owner UUID returns the immutable sanitized receipt. Only then create a service client and claim the DB-derived targets. Existing 30-second thought cooldown, 50/day, lifetime cap and phrase rotation remain authoritative. Ten taps are a local gesture, not an authorization fact.

Successful response shape:

```js
{
 event_persisted:true,
 receipt:{id,phrase_key,sequence,created_at},
 push:{targets,provider_accepted,retriable,terminal},
 device_displayed:'unknown'
}
```

HTTP 401 auth missing/rejected; 400 malformed request; 403 wrong origin; 405 wrong method. HTTP 409 `event_not_persisted` is reserved for a returned 4xx RPC result (excluding 408/429) with a recognized deterministic SQL code (`22023`, `23505`, `42501`, `54000`, `P0001`, `40001`). The Edge adapter explicitly preserves the actual SDK `status` with `data/error`. Status 0, timeout/transport exceptions, upstream 5xx, 408/429, missing status, unknown error codes or malformed receipts return redacted 503 `event_persistence_unknown` + `retry_same_event:true`; none prove non-persistence. No raw error prose is returned. 503 `push_dispatch_incomplete` also carries `retry_same_event:true`, the receipt and `event_persisted:true`. Missing env produces 503 `push_environment_missing` with a safe `required_key` name, no values; malformed config gives `push_runtime_configuration_required`. Never show raw provider/DB prose containing private input.

**Three separate facts:** event persisted; provider HTTP 2xx accepted and SQL completion committed; device display **unknown**. Acceptance does not prove delivery/read/display. Confirmed, durably accepted rows are never resent. A timeout/network failure or process death after provider acceptance but before SQL confirmation can result in a later duplicate. This is intentionally **not exactly once**. Stable OS tag `thought-<event UUID>` helps replace the same event notification, not a hardware guarantee. Retry only the original UUID after backoff/lease; never create a fresh UUID to disguise an uncertain send. There is no deployed scheduler: the parent outbox must retain and re-invoke pending same-event dispatches. No browser dispatcher can manufacture targets or bypass owner checks; an unattended service retry queue would be a separately reviewed feature.

Transport uses exact pinned **`@negrel/webpush@0.5.0`**, **`@negrel/http-ece@0.7.0`**, **`@supabase/supabase-js@2.119.0`**, with integrity lockfile. It uses the real library ECDH/VAPID primitives + native WebCrypto HKDF + library RFC8188 AES128GCM encryption. It intentionally does **not** call the library's global-fetch `pushMessage` (which cannot enforce this transport policy). A new ephemeral encryption key is generated per message; persistent VAPID identity is validated as a matching ES256 key pair. The sender's explicit fetch has redirect `error`, 8-second timeout, TTL 300 seconds, normal urgency, max 3000-byte payload; provider response bodies are cancelled/not logged or returned. 2xx=accepted, 404/410=gone, 408/429/5xx=retry, other HTTP statuses=rejected. Transport exceptions are explicit retry, capped by SQL. Supabase Auth/RPC fetches are redirect-denied with 10-second timeout. Tests use injected local HTTP doubles only, with network permission absent.

## Required environment and public config — NO defaults

Server-only Edge environment, all required:

| Name | Required value |
|---|---|
| `SUPABASE_URL` | actual dedicated project HTTPS base URL (no path/query/userinfo) |
| `SUPABASE_ANON_KEY` | actual publishable/legacy anon key used by user-token client |
| `SUPABASE_SERVICE_ROLE_KEY` | actual server-only legacy service-role JWT; never browser/build/worker |
| `VAPID_PUBLIC_KEY` | canonical unpadded 65-byte uncompressed P-256 base64url key |
| `VAPID_PRIVATE_KEY` | matching canonical unpadded 32-byte P-256 scalar; secret |
| `VAPID_CONTACT` | real operator `mailto:` address or HTTPS contact URL |
| `PUBLIC_APP_URL` | actual public HTTPS app base URL with trailing slash, exact nested app scope, no query/hash |

Generate/store actual VAPID identity only in an approved private operator workflow; no key-generation output or secret file belongs in this repo. VAPID rotation requires browser unsubscribe/resubscribe/reconciliation; new subscription identities consume daily/lifetime metadata budgets, while disabled identities do not consume enabled-device slots. Hosted Edge JWT gateway verification configuration must be explicitly reviewed for the selected key type; **manual getUser stays mandatory regardless of gateway `verify_jwt` setting**. No cloud config/deploy command was executed or installed by this work.

Public integration keys (all required, parent-owned config, NOT root config changes here): `appBaseUrl`, `workerUrl`, `vapidPublicKey`, plus existing `supabaseUrl` and `supabasePublishableKey`. No private/service key, contact secret or endpoint catalogs in public config. Pass the real existing authenticated Supabase client; never construct fake sessions/accounts.

## PWA / frontend integration steps (parent owns; NOT performed)

1. Human-approved provisioning/apply/deploy only after isolated SQL/Auth/privacy review. Apply all 003 after 001/002. The existing profile/base catalog checks do not verify this extension; run `push-check.mjs` offline plus actual hosted ACL/RLS/trigger checks before release.
2. Copy `push/` public runtime modules/assets to the built site without changing paths. Parent adds `<link rel="manifest" href="./push/manifest.webmanifest">` and `<link rel="apple-touch-icon" href="./push/icons/apple-touch-icon-180.png">`; review product name/language/branding. Manifest `../` relative scope/start/id is intentional when served at `<app base>/push/manifest.webmanifest`. It is prepared resource code, not proof of installation.
3. Parent creates/merges one **classic root app worker** at `<app base>/sw.js` containing `importScripts('./push/service-worker.js');`. Do not register the nested resource as a root-scoped worker (hosting disallows that by default), overwrite another worker blindly, broaden scope to origin `/`, cache Auth/private data, or make an offline login bypass. No root worker/index/build assets were edited here.
4. For GitHub Pages the real app base has a nested relative path (parent currently targets `/yasmine-garden/`). Derive actual absolute base from deployment config; do not hardcode a project/endpoint in this package. Worker scope, manifest URLs, icons and `PUBLIC_APP_URL` must agree. Notification click opens/focuses **only the registration's same-origin scoped local app**, ignores every payload-provided URL, does not bypass login, and carries no secret.
5. Persist recipient locale through `save_my_preferences` before opt-in. Render explicit opt-in UI, default preview off, explain lock-screen disclosure. Call `preparePush({appBaseUrl,workerUrl,vapidPublicKey,supabase,deviceId,saveDeviceId})` while presenting the control; it registers/awaits the worker but never prompts/subscribes. `deviceId`/`saveDeviceId` must be durable **verified-profile-scoped** storage, not a shared browser/global name selector. Preserve operation ID before network; surface persistence failures.
6. From the actual enable button's synchronous click handler call `controller.enableFromGesture({preview:false})` (true only with explicit preview consent). It checks transient user activation, requests browser permission, verifies Auth, persists an immutable device UUID, subscribes through PushManager, registers and **reads back** the sanitized server state. Handle failures visibly; no silent memory fallback. Browser subscription/key changes require explicit new UUID/reconciliation, never overwriting an immutable old record.
7. On logout/account-switch, await `controller.disableBeforeLogout()` **while Auth is still valid**, verify disabled state, unsubscribe browser, close existing local notifications and clear the parent device-ID mapping; only then sign out/clear all session views. Do not swallow disable failures. Offline forced signout is not a successful server opt-out; expose recovery and warn that in-flight accepted notifications cannot be recalled. Permission revocation/expiry requires foreground reconciliation; no `pushsubscriptionchange` background credentials are stored.
8. Keep existing ten-tap `experience` controller/outbox. Persist its burst UUID and verified owner before send; call `dispatchThought({supabase,eventId,expectedUserId:entry.userId,getAuthGeneration,signal})` once, use returned **server** phrase key, retain same ID on all retries. It invokes only Edge `dispatch-thought`; do not independently invent actor/recipient/locale. Optional direct send_thought first is safe for same ID but Edge still calls it again to owner-check. Map event-persisted/provider-accepted/display-unknown distinctly, never label an animation as delivered.

On iOS/iPadOS, standard Web Push requires a supported browser/platform and a Home Screen web app, then an explicit direct-interaction notification opt-in. Feature-detect; a normal browser tab alone must not be presented as configured Home Screen push. No Apple Developer paid account or native APNs credentials are part of this package. Browser/OS permission, Focus, connectivity, TTL, platform quotas/power policy, installation and worker lifecycle can suppress/delay display. This code cannot prove a physical device displayed anything. Tunisian catalog and added generic notification sentence remain draft copy requiring native-speaker review.

## Client Auth/cancellation and immutable-key runtime contract

Exports remain `preparePush` and `dispatchThought`; enable/disable receipt semantics and explicit preview consent remain unchanged. `preparePush` now remotely verifies and pins the user **before** worker registration and never prompts at preparation. Additional options on both helpers:

- `expectedUserId`: verified Auth user UUID for this profile. Optional for `preparePush` (omission pins its initial remote `getUser`); **required at runtime for `dispatchThought`**, taken from the durable outbox entry's original owner, not the current screen/account. Calls without an outbox owner now fail closed before invoke. This is a deliberate security precondition tightening of the previous two-field dispatch call, not transparent legacy compatibility.
- `getAuthGeneration?: () => unknown`: synchronous parent generation getter, snapshotted on entry and compared before/after every await. Use a monotonically changing primitive, advance before every profile/session/Auth transition (including A→B→A); do not return a mutable object. This also binds app-profile state when Auth user identity alone is insufficient.
- `signal?: AbortSignal`: parent operation/session cancellation signal. Abort fences all subsequent side effects and receipts; it does not claim an already-issued browser/RPC request was rolled back.

When available, `supabase.auth.onAuthStateChange` invalidates a helper on every non-`INITIAL_SESSION` event, conservatively including token refresh. Initial-session notification must match the pinned owner. Each awaited browser/storage/RPC operation additionally re-verifies remote `getUser` and owner before continuing. No RPC or next await proceeds after a detected changed context. A changed/cancelled operation throws, does not report configured/success, and retains uncertain device/event identities for owner-scoped reconciliation. If the parent advances the generation or cancels during preparation, use the signal/generation passed to preparation; no controller exists yet.

`saveDeviceId(id, context)` now receives an additive second argument exactly `{userId, authGeneration, signal, assertCurrent}`. `id` is a UUID or null. **Storage must address the captured `context.userId` profile namespace, not a mutable current-account variable, and call `context.assertCurrent()` immediately before committing after its own async awaits.** Abort/failed context must abort that storage transaction; a helper cannot undo an arbitrary callback's already-committed external write. A pre-bound synchronous single-argument saver remains compatible under serialized Auth transitions. Persist the UUID before fresh `subscribe`/register RPC; do not generate a new UUID on retry after uncertain registration. Never clear or map A's ID under B.

Controllers add `await controller.cancel()`: cancellation takes effect synchronously, unsubscribes the Auth observer and waits for the active enable/disable promise to settle (swallowing its rejection only for drain). It never disables server state, clears IDs or authorizes logout; callers must separately observe the original operation's failure. Enable and disable on one controller are mutually exclusive; overlapping calls reject rather than queue a gesture-sensitive enable.

**Parent transition hook (mandatory before integration):** hold a shared Auth-transition mutex across device operations and outbox sends. Freeze new UI/outbox work; settle in-flight work; while A is still authenticated, successfully await `disableBeforeLogout()`; then cancel/drain the controller, abort/drain dispatch calls, increment the generation and clear A's session views/outbox view (not uncertain durable entries); only then perform signout/account switch and create B's new context/controller. If cleanup fails, stay in a visible blocked/recovery state, retain A's identities and do not present normal logout/server opt-out success. An externally forced Auth change must increment/abort/cancel immediately and clear rendered state; it cannot safely run A's cleanup as B. Auth observers are synchronous invalidation hooks, not async signout callbacks. No module can serialize unrelated parent `signOut`/`setSession` or undo a request already using a token; parent serialization remains a release gate.

Before reusing any existing PushSubscription, the client compares its `options.applicationServerKey` **exactly byte-for-byte with the configured 65-byte key**. Missing/malformed/different keys throw `Push VAPID reconciliation needed` before saving/mutating device identity, subscribing or registering/listing. A newly returned subscription is checked too. No automatic unsubscribe/overwrite/rotation occurs. Reconcile explicitly under the original owner: verified disable → unsubscribe → clear mapping, then a new explicit opt-in creates new subscription/new UUID and consumes the documented daily/lifetime identity budget. Preview defaults off; a failed DB disable still stops before browser unsubscribe, notification close and ID clear.

Current outbox call: `dispatchThought({supabase,eventId,expectedUserId:entry.userId,getAuthGeneration,signal})`. Guard before invoking and after receipt; on any uncertainty retain **that same** UUID and owner. No helper creates an event UUID or substitutes a fresh one.

## Verification and remaining release gates

Run from repo root (test dependencies live in profile scratch, no app package changes):

```sh
CONNECTION_TEST_PACKAGE_JSON=<absolute native external package.json> node backend/push-check.mjs
# Optional: exact frozen old-003 -> current upgrade, then the same lifecycle suite.
CONNECTION_TEST_PACKAGE_JSON=<absolute native external package.json> CONNECTION_PUSH_UPGRADE_SQL=<absolute frozen old 003_web_push.sql> node backend/push-check.mjs
node --test push/test.mjs
node --check backend/push-check.mjs
deno check --frozen --config supabase/functions/dispatch-thought/deno.json supabase/functions/dispatch-thought/index.ts
deno test --frozen --config supabase/functions/dispatch-thought/deno.json --allow-read=experience supabase/functions/dispatch-thought/push_test.ts
```

Actual Node 24.13.0 and Deno **2.1.4 + 2.9.6** execution: SQL through real offline PGlite, cryptographic encrypt/decrypt and signature verification, mocked provider status/errors/redirect policy, auth/owner-before-service, input/SSRF/locale/catalog/worker/click/gesture/logout/resource checks. No provider network permission in Deno tests. The lock is Deno-v4 format for 2.1 compatibility. Use `--frozen` on newer Deno to avoid automatic lock rewriting. Test totals, exact outputs and initial corrected errors are in `../execution/step-17-web-push-code.md`.

Lifecycle correction and current outputs: `../execution/step-25-push-device-lifecycle-fix.md`. The original 52 SQL cases remain except the intentionally wrong retained-five assertion, replaced by the five-enabled bound. Added cases cover six normal logout cycles, active/re-enable limits, idempotent retries, UTC/day and lifetime metadata bounds including disabled rows, same-owner disabled-endpoint rotation, immutable old IDs, cross-owner denial, active-index enforcement, and durable acceptance/no historical replay. The optional old-SQL run snapshots populated old-schema delivery/identity evidence before upgrading and then runs the same current-policy suite. No live parallel-session or provider delivery claim follows from these offline tests.

**Not verified:** actual managed Supabase runtime/Auth/REST schema-cache/RLS/permissions, true parallel DB sessions, deployed Edge packaging of cross-directory imports, actual HTTPS host/Pages root worker and PWA installation, UI wiring/translations, browser permission/subscription behavior on hardware, delivery with app closed/Focus modes, logout races, real Apple/Google/Mozilla provider acceptance/device display. Release requires approved synthetic two-user live tests, provider-specific endpoints, blocked/expired permissions, network-unknown retry behavior and independent review. The parent must independently rerun current-code gates; these local checks are not independent review or production approval.

## Primary sources retrieved for this code (2026-11-10)

- Supabase dependencies: https://supabase.com/docs/guides/functions/dependencies (JSR/npm/Deno support).
- Supabase getUser: https://supabase.com/docs/reference/javascript/auth-getuser (server-verified user lookup).
- Supabase functions security: https://supabase.com/docs/guides/database/functions (definer search_path/explicit execute grants).
- Package/source API: https://jsr.io/@negrel/webpush@0.5.0 and versioned `application_server.ts`, `subscriber.ts`, `vapid.ts`, `crypto_utils.ts` (inspected actual source); https://jsr.io/@negrel/http-ece@0.7.0 and actual `ece.ts` encryption/decryption API.
- W3C Push API: https://www.w3.org/TR/push-api/ ; RFC8291 https://www.rfc-editor.org/rfc/rfc8291 ; RFC8292 https://www.rfc-editor.org/rfc/rfc8292 .
- WebKit Home Screen opt-in: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (standard web push, direct-interaction permission, Home Screen requirements). No claim that a particular untested device has permission or display support.
