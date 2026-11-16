#!/usr/bin/env bash
# LOCAL ONLY: copy dist/ to a scratch folder and relax the project-URL check in that copy only,
# so the app can talk to a local Supabase stack through dev/serve-local.mjs on the same origin.
# The shipped bundle and its CSP are not changed. Usage: dev/prepare-local-site.sh <out-dir>
set -euo pipefail
out=${1:?out dir}
rm -rf "$out" && mkdir -p "$out" && cp -r dist/. "$out/"
rm -f "$out/public-config.json"
# Accept any http(s) origin as the "project URL" (the dev server proxies Supabase on that origin).
sed -i -E 's/\.protocol!=="https:"\|\|!\/\^\(\[a-z0-9\]\{20\}\)\\\.supabase\\\.co\$\/\.test\(([a-z]+)\.hostname\)/.protocol===""||!\1.hostname/' "$out/assets/app.js"
sed -i -E 's#/placeholder\|example\|your\|replace\|project/i#/placeholder-never-matches/i#' "$out/assets/app.js"
grep -q 'supabase\\.co\$/.test' "$out/assets/app.js" && { echo "URL check not relaxed; bundle changed shape" >&2; exit 1; }
echo "Prepared $out"
