# MoMo Payment E2E & Visual Verification Report

## Scope & Execution Mode
- **Mode:** `Mode 2: Shape-Locked Mock E2E` via `mountContractRoutes` against `.dream/specs/momo-payment/contract-snapshots.json` (`API-ORDER-MOMO@1`, `TYPE-ORDER-PAYMENT@1`).
- **Applications Verified:** Storefront (`http://localhost:15173`) and Admin Portal (`http://localhost:15174`).
- **Viewports Verified:** Desktop (`1440x900`) and Mobile (`375x812`), checking `documentElement.scrollWidth <= documentElement.clientWidth` and zero broken `<img>` elements on every captured view.

## Automated Playwright Scenarios (`frontend/e2e/momo-payment.spec.ts`)
1. **Checkout Out-of-Range Guard (Req 5.1):** Verified COD selected by default, MoMo radio disabled when total is `60.000.000 ₫` (> `50.000.000 ₫`), and Vietnamese range explanation rendered clearly.
2. **Checkout MoMo Selection & Gateway Redirect (Req 5.1, 5.2):** Verified MoMo enabled at `3.190.000 ₫`, selected on desktop and mobile (`375x812`), `POST /api/v1/orders` request/response matched `create_order_momo_201`, and browser redirected cleanly to `https://test-payment.momo.vn/v2/gateway/pay?t=123`.
3. **Checkout Gateway Failure Fallback (Req 5.2):** Verified `create_order_momo_gateway_failed_201` navigates to `/orders/:id` with warning toast `Chưa thể chuyển đến cổng MoMo`.
4. **MoMo Return Verification (Req 5.3):** Verified `/momo-return` invokes `POST /api/v1/payments/momo/return` once matching `momo_return_paid_200`, triggers cart refresh, displays transaction ID `4088812345`, handles failed callback `momo_return_failed_200` with Retry CTA redirecting via `retry_momo_200`, and handles invalid signature `momo_return_invalid_sig_400`.
5. **Storefront Orders History & Detail (Req 5.4, 5.5):** Verified `Ví MoMo` / `Ví điện tử MoMo` labels, Vietnamese payment badges (`Chờ thanh toán`, `Đã thanh toán`), MoMo transaction ID, live countdown (`Hết hạn sau:` / `Hạn thanh toán MoMo:`), retry CTA removal on paid orders, and retry redirect on pending orders across desktop and mobile.
6. **Admin Portal Orders & Detail (Req 6.1, 6.2):** Verified `Thanh toán` column on Admin orders table (`admin_list_orders_200`), Vietnamese payment badges, transaction ID (`GD: 4088812345`), full `Ví điện tử MoMo` label and `paidAt` timestamp (`admin_order_detail_momo_paid_200`), and confirmed `payUrl` is never exposed in Admin UI.

- **Result:** `npx playwright test e2e/momo-payment.spec.ts` -> **6 passed (34.0s)**.

## Visual Evidence (`.dream/specs/momo-payment/imgs/`)
All 12 captured screenshots were inspected directly:
- [01-checkout-momo-disabled-overlimit.png](imgs/01-checkout-momo-disabled-overlimit.png) — Desktop (`1440x900`) Checkout showing COD selected and MoMo disabled (`Ngoài hạn mức`) with range notice for `60.000.000 ₫` order.
- [02-checkout-momo-selected-desktop.png](imgs/02-checkout-momo-selected-desktop.png) — Desktop (`1440x900`) Checkout with `Ví điện tử MoMo` selected (`3.190.000 ₫`), clean alignment, header anchored at top.
- [03-checkout-momo-selected-mobile.png](imgs/03-checkout-momo-selected-mobile.png) — Mobile (`375x812`) Checkout stacked cleanly with zero horizontal overflow.
- [04-momo-return-paid-desktop.png](imgs/04-momo-return-paid-desktop.png) — Desktop `/momo-return` paid confirmation surface displaying `#44444444`, `Đã thanh toán`, `3.190.000 ₫`, transaction `4088812345`, timestamp, and action links.
- [05-momo-return-paid-mobile.png](imgs/05-momo-return-paid-mobile.png) — Mobile (`375x812`) `/momo-return` paid view stacking summary rows and navigation buttons cleanly.
- [06-momo-return-failed-desktop.png](imgs/06-momo-return-failed-desktop.png) — Desktop `/momo-return` failed payment view showing `Thanh toán thất bại`, gateway reason, and `Thanh toán lại qua MoMo` CTA.
- [07-storefront-orders-history-desktop.png](imgs/07-storefront-orders-history-desktop.png) — Desktop `/orders` showing `Ví MoMo`, `Chờ thanh toán` + live countdown `Hết hạn sau: 13:57` + retry button on pending order, and `Đã thanh toán` + `Mã GD MoMo: 4088812345` on paid order.
- [08-storefront-order-detail-momo-pending-desktop.png](imgs/08-storefront-order-detail-momo-pending-desktop.png) — Desktop `/orders/:id` pending MoMo order with `Hạn thanh toán MoMo: 13:55` countdown and `Thanh toán lại qua MoMo` primary CTA above `Hủy đơn`.
- [09-storefront-order-detail-momo-pending-mobile.png](imgs/09-storefront-order-detail-momo-pending-mobile.png) — Mobile (`375x812`) `/orders/:id` pending MoMo order stacking countdown, payment card, and action buttons cleanly.
- [10-storefront-order-detail-momo-paid-desktop.png](imgs/10-storefront-order-detail-momo-paid-desktop.png) — Desktop `/orders/:id` paid MoMo order showing `Đã thanh toán`, transaction ID `4088812345`, `paidAt`, and no retry CTA.
- [11-admin-orders-list-desktop.png](imgs/11-admin-orders-list-desktop.png) — Admin Portal `/orders` (`1440x900`) displaying all 10 columns cleanly within the card without horizontal clipping (`MoMo`, `Chờ thanh toán`, `Đã thanh toán`, `GD: 4088812345`, `Số dòng SP`, `Ngày tạo`).
- [12-admin-order-detail-momo-paid-desktop.png](imgs/12-admin-order-detail-momo-paid-desktop.png) — Admin Portal `/orders/:id` showing `Ví điện tử MoMo`, `Đã thanh toán`, `4088812345`, and `Thời điểm thanh toán` with `payUrl` absent.

## Visual Layout Polish Applied During Inspection
- During initial visual review of `11-admin-orders-list-desktop.png`, the 10-column Admin order table exceeded the inner table width at `1440px`, clipping `Chờ thanh toán` against the card's right edge and scrolling the rightmost columns (`Số dòng SP`, `Ngày tạo`). Adjusted table cell spacing and badge wrapping in `frontend-admin/src/pages/OrdersPage.tsx`, then re-verified with Playwright (`6 passed`), screenshot inspection, `oxlint`, `tsc -b && vite build`, and full `frontend-admin` Vitest (`48 passed / 376 tests`).
