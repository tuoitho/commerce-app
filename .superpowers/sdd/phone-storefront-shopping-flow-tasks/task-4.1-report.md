# Task 4.1 Report

## Status

Implemented Kiro task 4.1: shared API client methods, catalog wire contracts, VND formatter, and focused regression tests.

## Files

- `frontend/src/api/client.ts`: added `put`, `patch`, and `delete`; all methods use the existing request pipeline, including credentials, bearer authorization, and one-time 401 refresh.
- `frontend/src/api/client.test.ts`: verified method/body/header behavior and 401 refresh retry.
- `frontend/src/api/catalog.ts`: replaced legacy category/product wire fields with `Brand`, `ProductSummary`, `ProductDetail`, `OptionGroup`, `OptionValue`, and `ProductVariant`; added featured products and repeated `category_id` serialization.
- `frontend/src/api/catalog.test.ts`: covered brands, featured endpoint, repeated categories, and catalog filters.
- `frontend/src/catalog/format.ts`: formats canonical decimal-string VND with `BigInt` and `vi-VN` currency formatting.
- `frontend/src/catalog/format.test.ts`: covered arbitrary-precision money and VND output.
- `frontend/src/pages/CatalogPage.tsx` and `frontend/src/pages/ProductDetailPage.tsx`: migrated rendering to the new catalog contract.
- Existing catalog/detail/hook tests and fixtures: migrated from the legacy generic catalog contract to phone summaries/details.

## Verification

- Focused tests: passed, 6 files and 25 tests.
- `npm run lint`: passed with existing warnings in `src/api/error.ts` and `src/auth/AuthProvider.tsx`.
- `npm test`: passed, 8 files and 35 tests.
- `npm run build`: passed, including TypeScript and Vite production build.

## Concerns

- The existing catalog and detail pages now read the new wire types, but dynamic option selection and cart integration are intentionally deferred to Kiro tasks 4.2, 6.1, and 6.2.
- The category selector UI remains single-select; task 4.1 updates API URL serialization to support repeated `category_id`, while multi-brand UI is task 5.3.
- Lint warnings are pre-existing and unrelated to this task.
- No commit was created.

## Review Follow-up

- Corrected `ProductSummary` to match the backend summary response: it no longer requires `featured`; `minPriceVnd` and `maxPriceVnd` remain required decimal-string fields.
- Added `minPriceVnd` and `maxPriceVnd` as required decimal-string fields on `ProductDetail`, matching the backend detail mapper. `featured` remains detail-only.
- Narrowed page edits to the minimum required for the new wire contract and formatter. No multi-brand selector or dynamic variant behavior was added; those remain later-task responsibilities.
- Expanded client tests so the 401 refresh retry matrix covers `POST`, `PUT`, `PATCH`, and `DELETE`, asserting one refresh, `credentials: include`, and refreshed bearer headers.
- Re-verified repeated `category_id` serialization and the `BigInt` `vi-VN` VND formatter.

## Review Verification

- Focused API/formatter tests: passed, 3 files and 14 tests.
- `npm run lint`: passed with the same pre-existing warnings in `src/api/error.ts` and `src/auth/AuthProvider.tsx`.
- `npm test`: passed, 8 files and 38 tests.
- `npm run build`: passed, including TypeScript and Vite production build.
