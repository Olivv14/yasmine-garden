# Between us

Private, two-account relationship app for Oliver and Yasmine. The production entry point is `src/template.html` plus `src/app.js`; the root `index.html` is a historical prototype and is not part of the build.

## Architecture

- `src/` contains the accessible HTML shell, app orchestration, Auth/transport adapters, composer, profile/avatar UI, and push settings.
- `experience/` contains language catalogs, question data, preferences, and the pure 10-tap affection controller.
- `backend/001_*.sql` through `004_*.sql` are the database schema/RPC migrations and contracts/checks. They are kept separate from browser code.
- `supabase/functions/` contains the push-dispatch Edge Function and shared transport.
- `push/` contains the service worker and client-side push implementation.
- `scripts/build.mjs` bundles the application into `dist/`; it does not replace the root prototype or invent runtime credentials.

The browser uses Supabase Auth and the authenticated `Transport` to read/write only authorized records. Private/shared visibility, media reservation/recovery, identity checks, and push state are enforced by the existing RPC/RLS and client-side generation guards. The app does not create accounts or pair users. Push activation requires a user gesture and explicit browser permission; provider acceptance is not proof of device display.

## Local development and checks

Use Node.js 24 and install dependencies with `npm ci`. Configure runtime `public-config.json` and, if using push, `push-config.json` from their example files. These are client-visible files: keep service-role/database credentials and the VAPID private key out of them. Review `loginAliases` before publishing because alias-to-email mappings are visible in a public repository.

```powershell
npm test
npm run test:edge
npm run check
npm run build
```

`npm run test:edge` requires Deno 2. These checks use offline fixtures and mocked providers; they do not prove a Supabase deployment or send a real push. The build requires the approved music recording under `vendor/` (or the documented sibling asset) and verifies its SHA-256 before producing `dist/`.

## Deployment status

GitHub Pages deployment is a manual, explicitly confirmed workflow from `connection-live`; it builds `dist/` and runs the test suite before publishing. It does not deploy SQL or Edge Functions. Do not trigger it until the reviewed pull request is merged and Pages is configured to use GitHub Actions. Supabase changes remain a separate owner-approved operation; repository migrations do not prove a live deployment. Follow the [staging runbook](backend/STAGING_RUNBOOK.md) before applying SQL or deploying functions. Never paste service-role keys, push private keys, or user data into GitHub or chat.

`public-config.json` contains browser-facing configuration; it is not a substitute for Auth/RLS. The push private key belongs only in the trusted Edge Function environment.
