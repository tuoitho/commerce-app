#!/bin/sh
set -eu

COUNT=$(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM products WHERE id = '10000000-0000-0001-0000-000000000001';" | tr -d '[:space:]')

if [ "${COUNT:-0}" = "0" ]; then
  echo "[db-seed] Seeding sample catalog..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f /seed/catalog.sql
else
  echo "[db-seed] Sample catalog already exists, skipping catalog seed."
fi

if [ -n "${CUSTOMER_BOOTSTRAP_EMAIL:-}" ] && [ -n "${CUSTOMER_BOOTSTRAP_PASSWORD:-}" ]; then
  echo "[db-seed] Ensuring sample customer account (${CUSTOMER_BOOTSTRAP_EMAIL})..."
  psql "$DB_URL" \
    -v ON_ERROR_STOP=1 \
    -v customer_email="$CUSTOMER_BOOTSTRAP_EMAIL" \
    -v customer_password="$CUSTOMER_BOOTSTRAP_PASSWORD" \
    -f /deployment-seed/demo_users.sql
fi

echo "[db-seed] Initialization complete."
