#!/usr/bin/env bash
# Exports every table to backups/<table>.json using the family login.
# Photos and files stay in Supabase storage and are not copied here.
set -euo pipefail
: "${SUPABASE_URL:?}" "${SUPABASE_KEY:?}" "${FAMILY_EMAIL:?}" "${FAMILY_PASSWORD:?}"
token=$(curl -sS -f -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_KEY" -H "Content-Type: application/json" \
  -d "$(jq -n --arg e "$FAMILY_EMAIL" --arg p "$FAMILY_PASSWORD" '{email:$e,password:$p}')" | jq -r .access_token)
mkdir -p backups
for t in area_groups areas tasks contacts documents finishes checklists audit_log; do
  curl -sS -f "$SUPABASE_URL/rest/v1/$t?select=*" -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $token" \
    | jq 'sort_by((.id // .slug) | tostring)' > "backups/$t.json"
  echo "$t: $(jq length "backups/$t.json") rows"
done
