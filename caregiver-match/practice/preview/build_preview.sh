#!/bin/sh
# Assembles the practice preview from the two repos into ./out (or $OUT).
# Serve ./out with any static server. Nothing is deployed and nothing is sent.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
CDS="$(cd "$HERE/../../.." && pwd)"
SITE="${SITE:-$HOME/Claude/Projects/findcdscaregivers-phase1}"
PGL="${PGL:-$HOME/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist}"
OUT="${OUT:-$HERE/out}"
rm -rf "$OUT"; mkdir -p "$OUT/practice/photos" "$OUT/assets/samples" "$OUT/assets/match/shared" "$OUT/practice/pglite" "$OUT/practice/server" "$OUT/office"
cp "$HERE/index.html" "$HERE/public-only.html" "$HERE/caregiver-only.html" "$HERE/family-only.html" "$OUT/"
cp "$SITE/assets/site.css" "$SITE/assets/logo.png" "$SITE/assets/mark.png" "$OUT/assets/"
cp "$SITE"/assets/samples/*.jpg "$OUT/assets/samples/"
cp "$SITE"/assets/match/*.js "$SITE"/assets/match/*.css "$OUT/assets/match/"
cp "$CDS/supabase/functions/_shared/match/rules.js" "$CDS/supabase/functions/_shared/match/messages.js" "$OUT/assets/match/shared/"
cp "$CDS"/supabase/functions/_shared/match/*.js "$OUT/practice/server/"
cp "$CDS"/caregiver-match/practice/*.js "$CDS"/caregiver-match/practice/*.sql "$OUT/practice/server/"
cp "$CDS"/caregiver-match/practice/photos/*.jpg "$OUT/practice/photos/"
cp "$CDS/cds_public_insert_lock.sql" "$CDS/caregiver_match_phase1.sql" "$OUT/practice/server/"
cp "$CDS/caregiver-match/hub-match.js" "$CDS/caregiver-match/hub-match.css" "$OUT/office/"
cp "$PGL/index.js" "$PGL"/chunk-*.js "$PGL/postgres.wasm" "$OUT/practice/pglite/"; base64 -i "$PGL/postgres.data" -o "$OUT/practice/pglite/postgres-data.b64.txt"
find "$OUT" -type f | sed "s#$OUT/##" | sort
