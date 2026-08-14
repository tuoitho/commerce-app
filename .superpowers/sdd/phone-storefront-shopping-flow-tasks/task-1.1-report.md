# Task 1.1 Report

## Status

DONE

## Implementation

- Added `backend/db/migrations/000003_phone_variants_cart.up.sql`.
- Added `backend/db/migrations/000003_phone_variants_cart.down.sql`.
- Ran `make gen`; sqlc regenerated `backend/internal/repository/sqlc/models.go` from the migration schema. The generated file was not edited directly.

The migration adds product `model`, `featured`, and `active` metadata while preserving legacy `price`, `currency`, and `stock_quantity`. It adds normalized option groups/values, variants, variant-value links, and account-owned cart items. It includes composite foreign keys, unique keys, indexes, positive VND/quantity and non-negative stock checks using `numeric(38,0)`, JSON-array validation for snapshots, and deferred constraint triggers that require every variant to contain exactly one value from every product option group and reject duplicate option combinations.

The down migration removes cart and variant data structures in dependency order, removes the trigger function, and drops only the three new product metadata columns. Legacy price, currency, and stock columns remain intact.

## Verification

- `make gen` in `backend/`: passed.
- `make test` in `backend/`: passed.
- `make vet` in `backend/`: passed.
- `git diff --check`: passed.
- `migrate ... up 1`: passed, migration version `3`.
- PostgreSQL smoke transaction inserting a valid product/group/value/variant/link/cart row: passed.
- `migrate ... down 1`: passed.
- `migrate ... up`: passed.
- PostgreSQL smoke check confirmed legacy product `price`, `currency`, and `stock_quantity` remained after the migration.

The temporary smoke-test rows were deleted afterward. No migration integration-test pattern existed in the repository, so no new test file was added for this isolated schema task.

## Fix Follow-up

Review finding: `numeric(38,0)` rounds fractional input before a check constraint evaluates it, so a check on the rounded column cannot reject values such as `1.5`.

Fix: changed variant `price_vnd`, variant `stock_quantity`, and cart `quantity` to unconstrained-scale `numeric` columns with checks requiring `value = trunc(value)`, the required positive/non-negative range, and a strict upper bound below `10^38`. This preserves integer values through 38 decimal digits while rejecting fractional input before storage can silently round it. `make gen` was rerun; generated sqlc types remain `pgtype.Numeric` and no generated file was edited directly.

Exact verification:

- `migrate -source "file://db/migrations" -database "postgres://ecommerce:change-me-local-only@localhost:5432/commerce?sslmode=disable" down 1`: passed, output `3/d phone_variants_cart`.
- `migrate -source "file://db/migrations" -database "postgres://ecommerce:change-me-local-only@localhost:5432/commerce?sslmode=disable" up 1`: passed, output `3/u phone_variants_cart`.
- PostgreSQL fractional-value check via `psql ... -v ON_ERROR_STOP=1 -c "DO ..."`: passed with output `NOTICE: fractional price rejected`, `NOTICE: fractional stock rejected`, `NOTICE: fractional quantity rejected`, `DO`.
- `make gen` in `backend/`: passed.
- `make test` in `backend/`: passed (`go test ./...`).
- `make vet` in `backend/`: passed (`go vet ./...`).
- `git diff --check`: passed.
