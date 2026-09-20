#!/usr/bin/env bash
#
# MOVE THE DATABASE TO ANOTHER NEON PROJECT (e.g. Ohio → Frankfurt).
#
# Neon cannot move a project between regions, so the data is dumped from the
# old project and restored into a new, empty one. Both URLs must be the
# DIRECT addresses (the host WITHOUT "-pooler"): a pooled connection in
# transaction mode cannot restore a schema.
#
# Nothing is read from this file's arguments — the two URLs come from the
# environment, so they stay out of your shell history and out of any chat.
#
#   bash scripts/move-database.sh
#
# It asks for each connection string and prints only the host back, so the
# passwords stay out of the screen, the shell history and any chat.
#
# NOBODY MAY USE THE SYSTEM WHILE THIS RUNS. Anything recorded between the
# dump and the restore stays behind in the old database.
set -euo pipefail

PG=/opt/homebrew/opt/postgresql@18/bin
DUMP="swiftcargo-$(date +%Y%m%d-%H%M).dump"

# Asked for rather than typed into the command, so nothing has to be edited
# and neither string lands in the shell history.
if [ -z "${OLD_DIRECT_URL:-}" ]; then
  printf 'Paste the OLD (Ohio) direct URL, then press Enter:\n> '
  IFS= read -r OLD_DIRECT_URL
fi
if [ -z "${NEW_DIRECT_URL:-}" ]; then
  printf '\nPaste the NEW (Frankfurt) direct URL, then press Enter:\n> '
  IFS= read -r NEW_DIRECT_URL
fi
echo
for url in "$OLD_DIRECT_URL" "$NEW_DIRECT_URL"; do
  case "$url" in
    postgresql://*|postgres://*) ;;
    *) echo "That does not look like a connection string — it must start with postgresql://" >&2; exit 1 ;;
  esac
done
echo "  old → $(printf '%s' "$OLD_DIRECT_URL" | sed -E 's|.*@([^/]*)/.*|\1|')"
echo "  new → $(printf '%s' "$NEW_DIRECT_URL" | sed -E 's|.*@([^/]*)/.*|\1|')"
echo
for url in "$OLD_DIRECT_URL" "$NEW_DIRECT_URL"; do
  case "$url" in
    *-pooler.*) echo "That is a pooled address. Use the direct one (no '-pooler')." >&2; exit 1 ;;
  esac
done

echo "→ Dumping the old database…"
"$PG/pg_dump" --no-owner --no-acl -Fc -d "$OLD_DIRECT_URL" -f "$DUMP"
echo "  $DUMP · $(du -h "$DUMP" | cut -f1)"

echo "→ Restoring into the new one…"
"$PG/pg_restore" --no-owner --no-acl --single-transaction -d "$NEW_DIRECT_URL" "$DUMP"

echo "→ Counting both, table by table…"
counts() {
  "$PG/psql" -At -d "$1" -c "
    SELECT relname, n_live_tup
    FROM pg_stat_user_tables
    ORDER BY relname" 2>/dev/null
}
# Row estimates are not exact after a restore, so the tables that carry money
# and cargo are counted properly.
exact() {
  "$PG/psql" -At -d "$1" -c "
    SELECT 'Cargo', count(*) FROM \"Cargo\"
    UNION ALL SELECT 'Customer', count(*) FROM \"Customer\"
    UNION ALL SELECT 'Invoice', count(*) FROM \"Invoice\"
    UNION ALL SELECT 'InvoiceItem', count(*) FROM \"InvoiceItem\"
    UNION ALL SELECT 'Payment', count(*) FROM \"Payment\"
    UNION ALL SELECT 'Receipt', count(*) FROM \"Receipt\"
    UNION ALL SELECT 'Container', count(*) FROM \"Container\"
    UNION ALL SELECT 'ContainerCargo', count(*) FROM \"ContainerCargo\"
    UNION ALL SELECT 'CargoPackage', count(*) FROM \"CargoPackage\"
    UNION ALL SELECT 'CargoBox', count(*) FROM \"CargoBox\"
    UNION ALL SELECT 'PickupNote', count(*) FROM \"PickupNote\"
    UNION ALL SELECT 'AuditLog', count(*) FROM \"AuditLog\"
    UNION ALL SELECT 'User', count(*) FROM \"User\"
    UNION ALL SELECT 'migrations', count(*) FROM \"_prisma_migrations\"
    ORDER BY 1"
}

before=$(exact "$OLD_DIRECT_URL")
after=$(exact "$NEW_DIRECT_URL")

printf '%-18s %10s %10s\n' TABLE OLD NEW
bad=0
while IFS='|' read -r table old; do
  new=$(printf '%s\n' "$after" | awk -F'|' -v t="$table" '$1 == t { print $2 }')
  flag=""
  if [ "$old" != "$new" ]; then flag="  ← DIFFERENT"; bad=1; fi
  printf '%-18s %10s %10s%s\n' "$table" "$old" "$new" "$flag"
done <<< "$before"

echo
if [ "$bad" = 0 ]; then
  echo "Every table matches. Point Vercel at the new project, then redeploy."
  echo "Keep $DUMP and the old project for a week before deleting either."
else
  echo "Something does not match. Do NOT switch Vercel over; tell me what differs." >&2
  exit 1
fi
