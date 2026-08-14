# Kiro Task 1.2 Read-Only Review

## Verdict

- Spec compliance: **PASS**
- Task quality: **FAIL**

The reviewed change is limited to `backend/db/seed/catalog.sql`. It satisfies the
Task 1.2 scope and the directly mapped requirements 3.9, 7.1, 8.2, 8.4, and 10.1.

## Compliance Checks

- Idempotency: **PASS** for rerunning the same deterministic seed. Stable IDs and
  conflict updates are used for categories, products, images, groups, values,
  variants, and variant links.
- Apple/Xiaomi and multiple phones: **PASS**. Four phones are seeded across both
  brands, with model names, descriptions, images, and featured flags.
- Dynamic groups: **PASS**. The iPhone 16 Pro has three groups, while the other
  products use distinct two-group graphs.
- Active/inactive variants: **PASS**. The seed includes active in-stock, active
  zero-stock, and one inactive variant.
- Invalid combination coverage: **PASS**. The iPhone 16 Pro defines values for
  all three groups but omits Cartesian combinations, including a missing valid
  option combination.
- Positive integer VND price and non-negative integer stock: **PASS** for all
  seeded variant values. The migration constraints reject invalid persisted data.
- Generic rows: **PASS**. The nine legacy products are retained and set
  `active = false`; they are not deleted.
- Legacy aggregate columns: **PASS**. Phone rows receive minimum variant price,
  `VND`, and active-variant stock sum.
- Transaction and deferred constraints: **PASS**. The file uses `BEGIN`/`COMMIT`
  around all writes, so the deferred variant integrity triggers are checked at
  commit.

## Findings

### Important

**[P2] Seed does not remove stale child rows when converging from an older seed — `backend/db/seed/catalog.sql:67-152`**

The option group/value/variant/link upserts update rows present in the current
seed, but never delete or deactivate deterministic child rows that were present
in an earlier seed version and are no longer listed. A database containing such
stale rows can retain extra variants/options, expose unintended catalog data,
or fail the deferred duplicate-combination trigger after the current rows are
updated. Re-running this exact file on an already-clean result is safe, but the
seed is not fully convergent from an older seed state. Add an explicit cleanup
step for the seed-owned IDs, or document and enforce a clean database baseline.

### Critical

No findings.

### Minor

No findings.

## Review Basis

Reviewed:

- `.kiro/specs/phone-storefront-shopping-flow/requirements.md`
- `.kiro/specs/phone-storefront-shopping-flow/design.md`
- `.kiro/specs/phone-storefront-shopping-flow/tasks.md`, task 1.2
- `backend/db/seed/catalog.sql` working-tree diff
- `backend/db/migrations/000003_phone_variants_cart.up.sql`

This was a read-only source review. No database command was run by this review;
the pre-existing report's claimed PostgreSQL execution was treated as author
evidence, not independently reproduced.

## Review Fix Evidence

The P2 convergence finding was fixed by adding explicit cleanup for the
seed-owned deterministic UUID namespaces before re-inserting current rows:

- `13000000-%`: variant option links are deleted first, then variants.
- `12000000-%`: option values are deleted.
- `11000000-%`: option groups are deleted.
- `10000000-0000-0002-%`: phone images are deleted.

The cleanup does not delete generic rows or rows outside these reserved seed
namespaces. Current products, categories, images, groups, values, variants,
and links are then inserted by the existing deterministic upserts.

Exact verification commands and outputs:

```text
Command:
psql "postgres://ecommerce:change-me-local-only@localhost:5432/commerce?sslmode=disable" -f db/seed/catalog.sql

Output:
BEGIN
UPDATE 9
DELETE 29
DELETE 12
DELETE 18
DELETE 9
DELETE 4
INSERT 0 6
INSERT 0 4
INSERT 0 4
INSERT 0 9
INSERT 0 18
INSERT 0 12
INSERT 0 29
UPDATE 4
COMMIT
```

The same command was run a second time with the same output and commit
result, confirming repeatability after cleanup.

```text
Command:
psql "postgres://ecommerce:change-me-local-only@localhost:5432/commerce?sslmode=disable" -c "[stale namespace, group-link, duplicate-combination, generic-active, and VND checks]"

Output:
stale_variants | 0
stale_groups | 0
stale_values | 0
missing_group_links | 0
generic_active | 0
phone_products | 4
phone_vnd | 4
```

`git diff --check -- backend/db/seed/catalog.sql` also passed.

## Re-review Fix Evidence

The P2 cart-integrity finding was fixed by making deterministic child cleanup
reference-aware. Variant links and variants are deleted only when no
`cart_items` row references the variant. A deterministic stale variant that is
still referenced by a cart is retained and set `active=false`; this preserves
the cart foreign key and prevents the stale variant from remaining sellable.
Option values and groups are also deleted only when no retained variant link
references them. Generic rows and unrelated user carts are not touched.

Exact verification evidence:

```text
Command: insert a cart row for current seeded variant 13000000-...001
Output:
INSERT 0 1
seeded_cart_refs | 1
```

```text
Command: psql "postgres://ecommerce:change-me-local-only@localhost:5432/commerce?sslmode=disable" -f db/seed/catalog.sql
Output:
BEGIN
UPDATE 9
DELETE 26
DELETE 11
UPDATE 0
DELETE 15
DELETE 6
DELETE 4
INSERT 0 6
INSERT 0 4
INSERT 0 4
INSERT 0 9
INSERT 0 18
INSERT 0 12
INSERT 0 29
UPDATE 4
COMMIT
```

The exact seed command was run twice with the same successful commit output.
The referenced current variant and cart row remained present after both runs.

```text
Verification output after the two reruns:
cart_refs | 1
active | stock_quantity
t      | 5
stale_variants | 0
missing_group_links | 0
duplicate_combinations | 0 rows
generic_active | 0
phone_vnd | 4
```

Older-seed-state simulation:

```text
Command: insert deterministic stale variant 13000000-...013 with valid
option links and a cart reference, then rerun catalog.sql.
Output before rerun:
INSERT 0 1
INSERT 0 3
INSERT 0 1
COMMIT
active | t

Output after rerun:
UPDATE 1
COMMIT
id                  | active
13000000-...013     | f
cart_refs           | 1
```

This confirms a cart-referenced stale variant is retained for cart integrity
but deactivated, while current seed data remains convergent.

## P1 Re-review Fix Evidence

The P1 finding was fixed by separating stale-variant cleanup from desired
variant-link cleanup. All links for the 12 current deterministic desired
variant IDs are deleted before current links are inserted again, regardless of
cart references. Stale variants outside that desired set remain subject to the
cart-aware delete/deactivate logic. This preserves referenced variants and
carts while making desired links converge exactly and allowing deferred
integrity validation to pass at commit.

Verification setup created an obsolete option group, value, and fourth link on
cart-referenced desired variant `13000000-...001`:

```text
links_before | 4
cart_refs_before | 1
```

First seed rerun output:

```text
BEGIN
UPDATE 9
DELETE 0
DELETE 30
DELETE 11
UPDATE 1
DELETE 16
DELETE 7
DELETE 4
INSERT 0 6
INSERT 0 4
INSERT 0 4
INSERT 0 9
INSERT 0 18
INSERT 0 12
INSERT 0 29
UPDATE 4
COMMIT
```

Second seed rerun output:

```text
BEGIN
UPDATE 9
DELETE 0
DELETE 29
DELETE 11
UPDATE 1
DELETE 15
DELETE 6
DELETE 4
INSERT 0 6
INSERT 0 4
INSERT 0 4
INSERT 0 9
INSERT 0 18
INSERT 0 12
INSERT 0 29
UPDATE 4
COMMIT
```

Post-rerun constraint and preservation checks:

```text
links_after | 3
obsolete_links | 0
cart_refs_after | 1
obsolete_groups | 0
obsolete_values | 0
missing_group_links | 0
generic_active | 0
phone_vnd | 4
```

Both runs committed successfully, confirming the deferred variant integrity
trigger accepts the exact current link set while the cart reference remains
intact.
