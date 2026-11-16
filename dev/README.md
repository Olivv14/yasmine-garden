# Local development (never production)

- `node dev/build-preview.mjs` builds `dev/out/` (gitignored): the garden panorama and all 6 flowers x 4 stages with fake data. Serve it and open `index.html?theme=night|day|harissa`.
- `dev/e2e-local.cjs` drives the real built app as two people against a **local** Supabase stack:
  1. `dockerd &`, then in a scratch folder `npx supabase init && npx supabase start` (Docker needed).
  2. Apply `backend/001` to `005` with `psql` into the local `supabase_db_*` container, in order.
  3. Create two synthetic local users (`oliver@local.test`, `yasmine@local.test`) and run `admin_enroll_pair` as `postgres`. GoTrue needs the token columns of hand-inserted `auth.users` rows to be `''`, not `NULL`.
  4. `npm run build`, copy `dist/` elsewhere, write a local `public-config.json` there (fake `https://abcdefghijklmnopqrst.supabase.co` URL, the local publishable key, `loginAliases: {}`), and in that copy only add `ws://127.0.0.1:54321` to the CSP `connect-src`. Serve it on port 8766.
  5. `node dev/e2e-local.cjs <screenshot-dir>`.
- `backend/games-check.sql` is a rollback-only behavioural check for `005` on the local stack.

Never point these scripts at a shared or production project.
