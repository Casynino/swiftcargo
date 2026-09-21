#!/usr/bin/env bash
#
# CLEAR THE TEST RECORDS AND KEEP THE CUSTOMERS, BEFORE REAL WORK STARTS.
#
#   bash scripts/reset-to-customers.sh
#
# Kept:     customers and their logins, staff accounts, warehouses, the rate
#           book and agreed customer rates, exchange rates, collection
#           accounts, expense types, vendors, suppliers, company settings,
#           the Chinese glossary and the website's schedule and markets —
#           and the customer-code counter, so the next customer does not
#           collide with an existing code.
# Removed:  every consignment, container, bill, payment, receipt, pickup,
#           expense, payroll run, case, message, notification, request and
#           the history written about them. Every other document counter
#           restarts, so the first real consignment is SC0001 again.
#
# It takes a full backup first and deletes nothing until you type DELETE.
# The connection string is asked for with the echo off: it never appears on
# the screen, in the shell history or in any chat. Use the DIRECT address
# (no "-pooler" in the host).
#
# NOBODY MAY USE THE SYSTEM WHILE THIS RUNS.
set -euo pipefail

PG=/opt/homebrew/opt/postgresql@18/bin
BACKUP="swiftcargo-before-reset-$(date +%Y%m%d-%H%M).dump"

printf 'Paste the database DIRECT URL (it will not show), then press Enter:\n> '
IFS= read -rs DB_URL
echo
case "$DB_URL" in
  postgresql://*|postgres://*) ;;
  *) echo "That does not look like a connection string — it must start with postgresql://" >&2; exit 1 ;;
esac
case "$DB_URL" in
  *-pooler.*) echo "That is a pooled address. Use the direct one (no '-pooler')." >&2; exit 1 ;;
esac
echo "  database → $(printf '%s' "$DB_URL" | sed -E 's|.*@([^/?]*).*|\1|')"
echo

# Kept tables reference only kept tables, so these truncate without CASCADE —
# and if a future table ever points at one of them, Postgres refuses the whole
# statement rather than quietly emptying something that was meant to stay.
CLEAR=(
  LoginEvent
  Cargo CargoPackage CargoBox CargoPhoto CargoStatusHistory
  ChinaReceiving DarReceiving DeliveryNote ScanEvent
  Container ContainerCargo ContainerEvent ContainerBooking PackingList
  Shipment ShipmentDocument
  Invoice InvoiceItem Payment PaymentProof Receipt PickupNote Release
  ContainerExpense PayrollRun PayrollItem AccountTransfer CashCount ManagerReview
  DeliveryRequest PickupRequest RequestDocument QuoteRequest SourcingRequest
  ExceptionCase ExceptionEvent Conversation Message CustomerContact Notification
  AuditLog FieldChange
)
KEEP=(Customer User Warehouse ShippingRate CustomerRate ExchangeRate BankAccount
      ExpenseType Vendor Supplier CompanySetting Setting CargoTerm
      ShipmentSchedule MarketInformation)

count() {
  local sql="" t
  for t in "$@"; do sql+="SELECT '$t', count(*) FROM \"$t\" UNION ALL "; done
  "$PG/psql" -At -F ' ' -d "$DB_URL" -c "${sql% UNION ALL }"
}

echo "WILL BE KEPT"
count "${KEEP[@]}" | awk '{ printf "  %-20s %8s\n", $1, $2 }'
echo
echo "WILL BE DELETED"
count "${CLEAR[@]}" | awk '$2 > 0 { printf "  %-20s %8s\n", $1, $2 }'
echo

echo "→ Backing everything up first…"
"$PG/pg_dump" --no-owner --no-acl -Fc -d "$DB_URL" -f "$BACKUP"
echo "  $BACKUP · $(du -h "$BACKUP" | cut -f1) — keep this file."
echo

printf 'Type DELETE to remove the records above, anything else to stop:\n> '
IFS= read -r answer
if [ "$answer" != "DELETE" ]; then
  echo "Stopped. Nothing was deleted."
  exit 0
fi

list=""
for t in "${CLEAR[@]}"; do list+="\"$t\", "; done
"$PG/psql" -v ON_ERROR_STOP=1 -q -d "$DB_URL" <<SQL
BEGIN;
TRUNCATE ${list%, };
DELETE FROM "Counter" WHERE key <> 'customer';
COMMIT;
SQL

echo
echo "AFTER"
count "${KEEP[@]}" | awk '{ printf "  %-20s %8s\n", $1, $2 }'
left=$(count "${CLEAR[@]}" | awk '{ s += $2 } END { print s + 0 }')
echo "  records left in the cleared tables: $left"
echo
if [ "$left" = 0 ]; then
  echo "Done. The customers are kept; the system is ready for real work."
  echo "If anything is wrong, the backup restores it all: $BACKUP"
else
  echo "Something was not cleared. Tell me what the counts show." >&2
  exit 1
fi
