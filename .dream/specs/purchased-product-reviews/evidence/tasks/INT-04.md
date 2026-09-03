# Verification Report: INT-04

## Scope

- Feature: `purchased-product-reviews`
- Task: `INT-04`
- Phase: `integration`
- Contract baseline: `PURCHASED-REVIEW-API@5`

## Results

| Scenario/check | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| `PURCHASED-REVIEW-API-R5-001` | Anonymous public read returns masked author and null viewer | Live HTTP returned `200`, `i***@example.com`, and `viewer: null` | PASS | bounded runtime HTTP check |
| `PURCHASED-REVIEW-API-R5-003` | Owner/admin representations retain neutral label and response | Owner history and admin collection returned `Khách hàng đã mua hàng`; response remained present | PASS | bounded runtime HTTP check |
| `PURCHASED-REVIEW-API-R5-004` | Account email changes are reflected without a snapshot | Updating the fixture email changed the next public label to `n***@example.org`; fixture was restored | PASS | bounded runtime HTTP check |
| `PURCHASED-REVIEW-API-R5-007` | Full email, user ID, and internal media metadata are absent; user text remains literal | Public body contained no full account email or user ID; existing response/comment text was unchanged | PASS | bounded runtime HTTP check |
| Inherited hidden-product route | Public product detail becomes unavailable while history/admin retain data | Inactive product detail returned `404`; owner/admin retention was verified by revision-4 integration coverage | PASS | bounded runtime HTTP check and `INT-03` evidence |
| Browser public consumer | Real frontend displays masked label without console errors | Playwright found `i***@example.com` twice on the product page; zero browser errors after correct proxy configuration | PASS | `.playwright-mcp/page-2026-08-29T13-43-27-109Z.yml`, console artifact |
| Browser admin consumer | Revision-4 admin app loads provider-revision-5 collection | Admin page loaded 8 review cards; network `GET /admin/reviews` returned neutral labels and current responses | PASS | `.playwright-mcp/page-2026-08-29T13-43-41-293Z.yml`, network response |
| Process cleanup | Verification processes do not remain running | Backend and both Vite processes were terminated; ports `18080`, `5173`, and `5174` were confirmed released | PASS | cleanup command output |

## Findings

The first browser attempt used a Vite process without `HTTP_PORT=18080` and produced proxy `502`; this was diagnosed and discarded. The successful browser run used the correct proxy configuration and had no console errors on the public page.
