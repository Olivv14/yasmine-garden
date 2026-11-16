# Supabase staging runbook

## Scope and current status

This repository's SQL and Edge Function code is not proof of a live deployment. The `CI` workflow runs tests and a build without connecting to Supabase. GitHub Pages has a separate manual, explicitly confirmed workflow for publishing the frontend from `connection-live`; it does not deploy database SQL or Edge Functions. No Supabase credentials belong in CI. No project reference, credentials, or live schema inspection are part of this generic runbook.

Use a new, dedicated staging project with synthetic accounts and no production data. Do not use an existing project whose owner, schema, migration history, or data has not been verified. If the intended staging project is not clearly isolated, stop and ask its owner to identify the correct target.

## Before applying anything

1. Have the project owner confirm the Dashboard project name/reference and that it is the intended fresh staging project. Keep the reference and operator evidence in private team records, not in this repository.
2. Confirm there is no unrelated app data or schema drift. Review the SQL and deployment requirements in [CONTRACT.md](./CONTRACT.md), [PROFILE_CONTRACT.md](./PROFILE_CONTRACT.md), and [PUSH_CONTRACT.md](./PUSH_CONTRACT.md).
3. Configure Auth and invitations as described in `CONTRACT.md`. Use two synthetic staging accounts; do not copy production accounts or content.
4. Keep service-role credentials, database passwords, and the VAPID private key out of browser configuration, GitHub Actions, source control, and chat. Public app configuration may contain only browser-safe Supabase and VAPID public values.

## SQL application and verification

The current documented order is **001 -> 002 -> 003 -> 004 -> 005**. These files are currently maintained under `backend/`, not in a Supabase CLI migrations directory. The contracts specify privileged Dashboard SQL Editor application on a dedicated fresh project.

1. Read the full contracts and inspect each SQL file before execution. Apply `001_shared_app.sql` as one transaction, then run `verify.sql` unchanged.
2. Apply `002_profile_thoughts.sql`; follow its contract for the profile catalog verifier and avatar/storage checks.
3. Apply `003_web_push.sql`; run `push-check.mjs` offline using the separate PGlite test dependency and `CONNECTION_TEST_PACKAGE_JSON` setup described in `PUSH_CONTRACT.md`. Then complete the hosted push ACL/RLS/trigger checks from that contract.
4. Apply `004_http_business_conflicts.sql` last. Its contract requires hosted HTTP 409 verification; the repository's offline tests are not a substitute. The hosted proof artifact referenced by the contract was not present in this checkout, so obtain fresh authorized verification rather than treating that claim as current evidence.
5. Apply `005_garden_games.sql` (six flowers, Italian locale, `game_events`, private `hockey:<pair>` Realtime policies). It verifies itself and rolls back on any unsafe state. Its behaviour was checked only on a local stack with `games-check.sql`; that file is local-only and must never run on a shared project. Redeploy `dispatch-thought` from this branch so Italian push payloads are accepted.
6. Record which exact files were applied, when, by whom, and the verifier results in private operator evidence. Do not record credentials, user content, or Auth identifiers.

Do **not** run `supabase db push`, `supabase migration repair`, or move/copy these SQL files into a CLI migrations directory as a shortcut. First establish a reviewed baseline and prove the target's actual schema and migration history; SQL Editor application does not itself establish a CLI migration-history baseline. If the project is not fresh or any step fails, stop and have the owner review actual schema/history before making further changes. Do not reapply migrations to reconcile unexpected drift.

## Edge Function and app staging

Deploy `dispatch-thought` only after the staging database contracts and required hosted checks pass. Set its required environment values through the trusted Supabase Edge Function secret manager; never put the service-role key or VAPID private key in the app, repository, or CI. Use staging-specific values and synthetic subscriptions.

Build the app with staging's browser-safe configuration. Before inviting testers, verify both accounts, private-vs-shared reads, question-round reveal behavior, media cleanup, and recipient-only inbox/read state. Verify Realtime publishes only the intended invalidation signals. Test push only with an explicitly opted-in staging device; distinguish event persistence, provider acceptance, and device display, which remains unknown.

The Pages workflow publishes the tracked browser-safe `public-config.json` and `push-config.json` with the app. It is not a Supabase deployment path and must not be used to pass server credentials.

## Release gate

Staging success is not a production deployment. Before any production change, the project owner must independently identify the production target, review its live schema and migration history, approve a production-specific plan, and retain rollback/recovery evidence. Do not infer that anything is uploaded or deployed from repository files, CI success, local tests, or an unverified machine.
